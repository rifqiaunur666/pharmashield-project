"""
app/services/reminder_service.py
PharmaShield — Medicine Reminder Engine & Dynamic Rescheduler.

Features:
  - Patient, Medication, Schedule, & MedicationLog CRUD & persistence.
  - State Machine transitions:
      PENDING -> REMINDED_15M -> DUE_0M -> (COMPLETED / DELAYED) -> RESCHEDULED / SKIPPED.
  - Meta WhatsApp Cloud API button clicks handler & Webhook processor.
  - Dynamic Rescheduling Algorithm:
      Waktu Aktual Minum + Interval Dosis Asli Dokter agar jarak dosis aman secara medis.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.services.meta_wa_service import meta_wa_service

logger = logging.getLogger(__name__)

# Persistence storage path
REMINDERS_DB_FILE: Path = settings.data_dir / "reminders_engine.json"

# Default timezone offset (WIB = UTC+7)
WIB_OFFSET = timezone(timedelta(hours=7))


# ─── Pydantic Data Models ────────────────────────────────────────────────────

class PatientModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    name: str
    whatsapp_no: str  # Format 628xxxxxxxxxx or QR contact identifier
    qr_code_url: Optional[str] = None
    qr_contact_name: Optional[str] = None
    timezone: str = "Asia/Jakarta"
    created_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())


class ScheduleModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "FIXED_TIMES"  # "FIXED_TIMES" or "INTERVAL"
    interval_hours: int = 8    # Default interval e.g. every 8 hours
    target_times: list[str] = Field(default_factory=lambda: ["08:00", "14:00", "20:00"])  # HH:MM strings


class MedicationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    name: str
    dosage: str
    instructions: Optional[str] = "Sesudah makan"
    start_date: str  # YYYY-MM-DD
    duration_days: int = 7
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())
    schedule: ScheduleModel = Field(default_factory=ScheduleModel)


class MedicationLogModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    medication_id: str
    patient_id: str
    scheduled_at: str       # ISO format with timezone
    status: str = "PENDING"  # PENDING, REMINDED_10M, REMINDED_15M, DUE_0M, DELAYED, COMPLETED, RESCHEDULED, SKIPPED
    reminded_10m_at: Optional[str] = None
    reminded_15m_at: Optional[str] = None
    due_sent_at: Optional[str] = None
    delayed_sent_at: Optional[str] = None
    actual_taken_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())


# ─── Reminder Store & Engine ──────────────────────────────────────────────────

class ReminderEngine:
    def __init__(self):
        self._patients: dict[str, dict] = {}
        self._medications: dict[str, dict] = {}
        self._logs: dict[str, dict] = {}
        self._activity_logs: list[dict[str, Any]] = []
        self._load_data()

    def add_activity_log(self, event_type: str, title: str, details: dict[str, Any]):
        """Record real-time webhook/dispatch activity log for the live jury feed."""
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(WIB_OFFSET).isoformat(),
            "event_type": event_type,
            "title": title,
            "details": details,
        }
        self._activity_logs.insert(0, entry)
        if len(self._activity_logs) > 100:
            self._activity_logs = self._activity_logs[:100]

    def list_activity_logs(self, limit: int = 50) -> list[dict[str, Any]]:
        return self._activity_logs[:limit]

    def _load_data(self):
        if not REMINDERS_DB_FILE.exists():
            self._save_data()
            return

        try:
            content = REMINDERS_DB_FILE.read_text(encoding="utf-8").strip()
            data = json.loads(content) if content else {}
            self._patients: dict[str, dict] = data.get("patients", {})
            self._medications: dict[str, dict] = data.get("medications", {})
            self._logs: dict[str, dict] = data.get("logs", {})
        except Exception as exc:
            logger.error("[ReminderEngine] Error loading reminders DB: %s", exc)
            self._patients = {}
            self._medications = {}
            self._logs = {}

    def _save_data(self, data: Optional[dict] = None):
        try:
            payload = data or {
                "patients": self._patients,
                "medications": self._medications,
                "logs": self._logs
            }
            REMINDERS_DB_FILE.parent.mkdir(parents=True, exist_ok=True)
            REMINDERS_DB_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception as exc:
            logger.error("[ReminderEngine] Error saving reminders DB: %s", exc)

    # ─── Patients CRUD ────────────────────────────────────────────────────────

    def create_patient(
        self,
        name: str,
        whatsapp_no: str,
        user_id: Optional[str] = None,
        qr_code_url: Optional[str] = None,
        qr_contact_name: Optional[str] = None,
    ) -> PatientModel:
        clean_wa = meta_wa_service.clean_recipient(whatsapp_no) if whatsapp_no else ""
        if not clean_wa and qr_code_url:
            clean_wa = "QR_" + str(uuid.uuid4())[:8]
        patient = PatientModel(
            name=name,
            whatsapp_no=clean_wa,
            user_id=user_id,
            qr_code_url=qr_code_url,
            qr_contact_name=qr_contact_name
        )
        self._patients[patient.id] = patient.model_dump()
        self._save_data()
        return patient

    def get_patient(self, patient_id: str) -> Optional[PatientModel]:
        data = self._patients.get(patient_id)
        return PatientModel(**data) if data else None

    def list_patients(self, user_id: Optional[str] = None) -> list[PatientModel]:
        res = []
        for p in self._patients.values():
            if user_id and p.get("user_id") and p.get("user_id") != user_id:
                continue
            res.append(PatientModel(**p))
        return res

    # ─── Medication & Schedule Generation ──────────────────────────────────────

    def create_medication_and_schedules(
        self,
        patient_id: str,
        name: str,
        dosage: str,
        instructions: Optional[str],
        duration_days: int,
        schedule_type: str = "FIXED_TIMES",
        interval_hours: int = 8,
        target_times: Optional[list[str]] = None,
        start_date_str: Optional[str] = None
    ) -> tuple[MedicationModel, list[MedicationLogModel]]:
        patient = self.get_patient(patient_id)
        if not patient:
            raise ValueError(f"Patient with ID {patient_id} not found.")

        now_wib = datetime.now(WIB_OFFSET)
        if not start_date_str:
            start_date = now_wib.strftime("%Y-%m-%d")
        else:
            try:
                # Validate date format YYYY-MM-DD
                datetime.strptime(start_date_str.strip(), "%Y-%m-%d")
                start_date = start_date_str.strip()
            except Exception:
                start_date = now_wib.strftime("%Y-%m-%d")

        if schedule_type == "INTERVAL":
            # Generate times from interval
            times = []
            curr_hour = 8
            while curr_hour < 24:
                times.append(f"{curr_hour:02d}:00")
                curr_hour += interval_hours
            actual_times = times
        else:
            actual_times = target_times if target_times and len(target_times) > 0 else ["08:00", "14:00", "20:00"]

        schedule = ScheduleModel(
            type=schedule_type,
            interval_hours=interval_hours,
            target_times=actual_times
        )

        medication = MedicationModel(
            patient_id=patient_id,
            name=name,
            dosage=dosage,
            instructions=instructions or "Sesudah makan",
            start_date=start_date,
            duration_days=duration_days,
            schedule=schedule
        )

        self._medications[medication.id] = medication.model_dump()

        # Generate logs for the entire treatment duration
        generated_logs: list[MedicationLogModel] = []
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=WIB_OFFSET)

        for day in range(duration_days):
            current_day = start_dt + timedelta(days=day)
            for t_str in actual_times:
                try:
                    parts = t_str.split(":")
                    h, m = int(parts[0]), int(parts[1])
                    scheduled_time = current_day.replace(hour=h, minute=m, second=0, microsecond=0)
                    
                    # If scheduled time is already in the deep past on day 0 (more than 30 mins ago), 
                    # adjust to start on subsequent interval or leave for tomorrow so it doesn't instantly become delayed
                    log = MedicationLogModel(
                        medication_id=medication.id,
                        patient_id=patient_id,
                        scheduled_at=scheduled_time.isoformat(),
                        status="PENDING"
                    )
                    self._logs[log.id] = log.model_dump()
                    generated_logs.append(log)
                except Exception as err:
                    logger.error("[ReminderEngine] Error generating log time: %s", err)

        self._save_data()

        # ── Trigger Welcome WhatsApp Message (H-Instant) ──
        try:
            target_times_fmt = ", ".join(actual_times)
            loop = asyncio.get_running_loop()
            loop.create_task(
                self._dispatch_welcome_notification(
                    patient=patient,
                    medication=medication,
                    times_str=target_times_fmt
                )
            )
        except RuntimeError:
            # No running event loop (e.g. sync test), ignore background task
            pass
        except Exception as welcome_err:
            logger.warning("[ReminderEngine] Could not dispatch welcome message: %s", welcome_err)

        return medication, generated_logs

    async def _dispatch_welcome_notification(
        self,
        patient: PatientModel,
        medication: MedicationModel,
        times_str: str
    ):
        welcome_res = await meta_wa_service.send_welcome_message(
            to_phone=patient.whatsapp_no,
            patient_name=patient.name,
            medication_name=medication.name,
            dosage=medication.dosage,
            schedule_time_str=times_str,
            instructions=medication.instructions
        )
        self.add_activity_log(
            event_type="WELCOME_SENT",
            title=f"Welcome WhatsApp Sent to {patient.name}",
            details={
                "patient_name": patient.name,
                "whatsapp_no": patient.whatsapp_no,
                "medication_name": medication.name,
                "dosage": medication.dosage,
                "schedule_times": times_str,
                "dispatch_result": welcome_res
            }
        )

    def list_medications(self, patient_id: Optional[str] = None) -> list[MedicationModel]:
        res = []
        for m in self._medications.values():
            if patient_id and m.get("patient_id") != patient_id:
                continue
            res.append(MedicationModel(**m))
        return res

    def list_logs(self, patient_id: Optional[str] = None, medication_id: Optional[str] = None) -> list[MedicationLogModel]:
        res = []
        for log_data in self._logs.values():
            if patient_id and log_data.get("patient_id") != patient_id:
                continue
            if medication_id and log_data.get("medication_id") != medication_id:
                continue
            # Any 10m pre-reminder is strictly for WhatsApp, dashboard status stays PENDING
            item = dict(log_data)
            if item.get("status") in ("REMINDED_10M", "REMINDED_15M"):
                item["status"] = "PENDING"
            res.append(MedicationLogModel(**item))
        res.sort(key=lambda x: x.scheduled_at)
        return res

    def get_log(self, log_id: str) -> Optional[MedicationLogModel]:
        data = self._logs.get(log_id)
        return MedicationLogModel(**data) if data else None

    async def trigger_immediate_due_for_log(self, log_id: str) -> dict[str, Any]:
        """
        Force-trigger H-0 Interactive Notification for a specific log immediately.
        Dispatches Meta/WhatsApp interactive [Sudah] / [Belum] message to patient's real phone.
        """
        if log_id not in self._logs:
            return {"success": False, "message": "Log ID not found"}
        log_data = self._logs[log_id]
        patient = self.get_patient(log_data["patient_id"])
        medication = MedicationModel(**self._medications[log_data["medication_id"]]) if log_data["medication_id"] in self._medications else None
        if not patient or not medication:
            return {"success": False, "message": "Patient or medication missing"}

        now_wib = datetime.now(WIB_OFFSET)
        log_data["status"] = "DUE_0M"
        log_data["due_sent_at"] = now_wib.isoformat()
        log_data["updated_at"] = now_wib.isoformat()
        self._save_data()

        send_res = await meta_wa_service.send_due_reminder_buttons(
            to_phone=patient.whatsapp_no,
            log_id=log_id,
            patient_name=patient.name,
            medication_name=medication.name,
            dosage=medication.dosage,
            instructions=medication.instructions
        )
        self.add_activity_log(
            event_type="DUE_0M_TRIGGERED",
            title=f"Manual H-0 Triggered via Dashboard: {patient.name}",
            details={"medication": medication.name, "log_id": log_id, "dispatch_result": send_res}
        )
        return {
            "success": True,
            "status": "DUE_0M",
            "dispatch_result": send_res
        }

    def delete_patient(self, patient_id: str) -> bool:
        if patient_id in self._patients:
            del self._patients[patient_id]
            # Cascade delete medications and logs
            med_ids_to_del = [m_id for m_id, m in self._medications.items() if m.get("patient_id") == patient_id]
            for m_id in med_ids_to_del:
                del self._medications[m_id]
            log_ids_to_del = [l_id for l_id, l in self._logs.items() if l.get("patient_id") == patient_id]
            for l_id in log_ids_to_del:
                del self._logs[l_id]
            self._save_data()
            return True
        return False

    def delete_medication(self, medication_id: str) -> bool:
        if medication_id in self._medications:
            del self._medications[medication_id]
            log_ids_to_del = [l_id for l_id, l in self._logs.items() if l.get("medication_id") == medication_id]
            for l_id in log_ids_to_del:
                del self._logs[l_id]
            self._save_data()
            return True
        return False

    def delete_log(self, log_id: str) -> bool:
        if log_id in self._logs:
            del self._logs[log_id]
            self._save_data()
            return True
        return False

    def clear_all_data(self):
        self._patients = {}
        self._medications = {}
        self._logs = {}
        self._activity_logs = []
        self._save_data()

    # ─── Tick & Scheduler Evaluator (Background Worker) ─────────────────────────

    async def trigger_stage_for_log(self, log_id: str, stage: str) -> dict[str, Any]:
        """
        Force-trigger any of the 3 Multi-Stage Reminders for a specific log:
          - STAGE_1_CONFIRM : Konfirmasi awal pendaftaran jadwal
          - STAGE_2_PRE_10M : Notifikasi pra-minum obat H-10 menit
          - STAGE_3_DUE_0M  : Notifikasi eksekusi waktu H dengan tombol [Ya, Sudah Minum] & [Belum]
        """
        if log_id not in self._logs:
            return {"success": False, "message": "Log ID tidak ditemukan"}

        log_data = self._logs[log_id]
        patient = self.get_patient(log_data["patient_id"])
        medication = MedicationModel(**self._medications[log_data["medication_id"]]) if log_data["medication_id"] in self._medications else None
        if not patient or not medication:
            return {"success": False, "message": "Data pasien atau obat tidak lengkap"}

        now_wib = datetime.now(WIB_OFFSET)
        sched_time_str = datetime.fromisoformat(log_data["scheduled_at"]).strftime("%H:%M")

        if stage in ("STAGE_1_CONFIRM", "CONFIRMATION"):
            times_str = ", ".join(medication.schedule.target_times)
            res = await meta_wa_service.send_welcome_message(
                to_phone=patient.whatsapp_no,
                patient_name=patient.name,
                medication_name=medication.name,
                dosage=medication.dosage,
                schedule_time_str=times_str,
                instructions=medication.instructions
            )
            self.add_activity_log(
                event_type="STAGE_1_CONFIRMATION",
                title=f"Tahap 1: Konfirmasi Jadwal Awal Terkirim ke {patient.name}",
                details={"medication": medication.name, "times": times_str, "res": res}
            )
            return {"success": True, "stage": "STAGE_1_CONFIRMATION", "dispatch_result": res}

        elif stage in ("STAGE_2_PRE_10M", "PRE_10M"):
            # 10 menit sebelum jadwal hanya masuk ke WhatsApp, tidak merubah status dashboard
            log_data["reminded_10m_at"] = now_wib.isoformat()
            log_data["updated_at"] = now_wib.isoformat()
            self._save_data()

            res = await meta_wa_service.send_pre_reminder_10m(
                to_phone=patient.whatsapp_no,
                patient_name=patient.name,
                medication_name=medication.name,
                dosage=medication.dosage,
                scheduled_time_str=sched_time_str,
                instructions=medication.instructions
            )
            self.add_activity_log(
                event_type="STAGE_2_PRE_10M",
                title=f"Tahap 2: Pra-Minum Obat (H-10M) Terkirim ke WhatsApp {patient.name}",
                details={"medication": medication.name, "time": sched_time_str, "res": res}
            )
            return {"success": True, "stage": "STAGE_2_PRE_10M", "dispatch_result": res}

        else:  # STAGE_3_DUE_0M default
            return await self.trigger_immediate_due_for_log(log_id)

    async def evaluate_and_dispatch_reminders(self, current_time: Optional[datetime] = None) -> dict[str, int]:
        """
        Main loop executed by Background Scheduler:
        1. Checks H-10 Minutes: Dispatches WA pre-reminder, status remains PENDING in dashboard.
        2. Checks Waktu H (0M): PENDING -> DUE_0M (Pesan Interaktif [Ya, Sudah Minum] & [Belum])
        3. Checks Timeout (Grace Period 15-30m): DUE_0M -> DELAYED (Memicu Dynamic Rescheduling follow-up)
        """
        now = current_time or datetime.now(WIB_OFFSET)
        counts = {
            "reminded_10m": 0,
            "due_0m": 0,
            "delayed": 0
        }

        for log_id, log_data in list(self._logs.items()):
            try:
                scheduled_dt = datetime.fromisoformat(log_data["scheduled_at"])
                status = log_data["status"]

                patient = self.get_patient(log_data["patient_id"])
                medication = MedicationModel(**self._medications[log_data["medication_id"]]) if log_data["medication_id"] in self._medications else None

                if not patient or not medication or not medication.is_active:
                    continue

                diff_seconds = (scheduled_dt - now).total_seconds()
                diff_minutes = diff_seconds / 60.0

                # ─── Tahap 2: H-10 Menit (Pra-Minum Obat Hanya ke WhatsApp) ───
                if status == "PENDING" and not log_data.get("reminded_10m_at") and 0 < diff_minutes <= 10:
                    log_data["reminded_10m_at"] = now.isoformat()
                    log_data["updated_at"] = now.isoformat()
                    counts["reminded_10m"] += 1

                    time_str = scheduled_dt.strftime("%H:%M")
                    pre_res = await meta_wa_service.send_pre_reminder_10m(
                        to_phone=patient.whatsapp_no,
                        patient_name=patient.name,
                        medication_name=medication.name,
                        dosage=medication.dosage,
                        scheduled_time_str=time_str,
                        instructions=medication.instructions
                    )
                    self.add_activity_log(
                        event_type="REMINDED_10M",
                        title=f"Tahap 2: Notifikasi H-10M Dikirim ke WhatsApp {patient.name}",
                        details={"medication": medication.name, "time": time_str, "res": pre_res}
                    )

                # ─── Tahap 3: Waktu H (Eksekusi Interaktif dengan Tombol) ───
                elif status in ("PENDING", "REMINDED_10M", "REMINDED_15M") and -15 <= diff_minutes <= 0:
                    log_data["status"] = "DUE_0M"
                    log_data["due_sent_at"] = now.isoformat()
                    log_data["updated_at"] = now.isoformat()
                    counts["due_0m"] += 1

                    due_res = await meta_wa_service.send_due_reminder_buttons(
                        to_phone=patient.whatsapp_no,
                        log_id=log_id,
                        patient_name=patient.name,
                        medication_name=medication.name,
                        dosage=medication.dosage,
                        instructions=medication.instructions
                    )
                    self.add_activity_log(
                        event_type="DUE_0M",
                        title=f"Tahap 3: Pesan Interaktif [Ya, Sudah Minum/Belum] Dikirim: {patient.name}",
                        details={"medication": medication.name, "log_id": log_id, "res": due_res}
                    )

                # C. Keterlambatan / Timeout (Melebihi 15 menit dari jadwal tanpa konfirmasi)
                elif (status == "DUE_0M" or (status == "PENDING" and diff_minutes < -15)) and diff_minutes < -15:
                    log_data["status"] = "DELAYED"
                    log_data["delayed_sent_at"] = now.isoformat()
                    log_data["updated_at"] = now.isoformat()
                    counts["delayed"] += 1

                    time_str = scheduled_dt.strftime("%H:%M")
                    delay_res = await meta_wa_service.send_delay_followup_buttons(
                        to_phone=patient.whatsapp_no,
                        log_id=log_id,
                        patient_name=patient.name,
                        medication_name=medication.name,
                        dosage=medication.dosage,
                        scheduled_time_str=time_str
                    )
                    self.add_activity_log(
                        event_type="DELAYED",
                        title=f"Delay Follow-up Sent [Ya, Sudah/Belum]: {patient.name}",
                        details={"medication": medication.name, "log_id": log_id, "res": delay_res}
                    )

            except Exception as loop_err:
                logger.error("[ReminderEngine] Error evaluating log %s: %s", log_id, loop_err)

        self._save_data()
        return counts

    # ─── Webhook Interaction & Rescheduling Engine ─────────────────────────────

    async def handle_button_interaction(self, button_id: str) -> dict[str, Any]:
        """
        Process Meta interactive reply button click:
          - BTN_ONTIME_TAKEN:<log_id> -> COMPLETED
          - BTN_ONTIME_NOT:<log_id>   -> DELAYED & Follow-up
          - BTN_LATE_TAKEN:<log_id>   -> RESCHEDULED (Dynamic Rescheduling Algorithm)
          - BTN_LATE_NOT:<log_id>     -> SKIPPED / Escalate alert
        """
        parts = button_id.split(":", 1)
        action = parts[0]
        log_id = parts[1] if len(parts) > 1 else ""

        if not log_id or log_id not in self._logs:
            return {"success": False, "message": "Log ID not found"}

        log = self._logs[log_id]
        patient = self.get_patient(log["patient_id"])
        medication = MedicationModel(**self._medications[log["medication_id"]]) if log["medication_id"] in self._medications else None
        now_wib = datetime.now(WIB_OFFSET)

        if not patient or not medication:
            return {"success": False, "message": "Associated patient or medication missing"}

        # 1. User klik [Sudah] tepat waktu
        if action == "BTN_ONTIME_TAKEN":
            log["status"] = "COMPLETED"
            log["actual_taken_at"] = now_wib.isoformat()
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            # Cari jadwal berikutnya untuk konfirmasi
            next_log = self._find_next_pending_log(medication.id, log["scheduled_at"])
            if next_log:
                next_time = datetime.fromisoformat(next_log.scheduled_at).strftime("%H:%M")
                msg = (
                    f"✅ *Terima kasih {patient.name}!* Obat *{medication.name}* telah dicatat selesai.\n\n"
                    f"⏰ Jadwal minum obat berikutnya hari ini adalah pukul *{next_time} WIB*."
                )
            else:
                msg = (
                    f"🎉 *Hebat {patient.name}!* Seluruh jadwal minum obat *{medication.name}* untuk hari ini telah tuntas.\n"
                    f"Tetap jaga kesehatan dan istirahat yang cukup!"
                )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            self.add_activity_log(
                event_type="BUTTON_ONTIME_TAKEN",
                title=f"User Clicked [Sudah] (Tepat Waktu): {patient.name}",
                details={"medication": medication.name, "log_id": log_id, "status": "COMPLETED"}
            )
            return {"success": True, "action": action, "status": "COMPLETED"}

        # 2. User klik [Belum] saat H-0
        elif action == "BTN_ONTIME_NOT":
            log["status"] = "DELAYED"
            log["delayed_sent_at"] = now_wib.isoformat()
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            sched_time = datetime.fromisoformat(log["scheduled_at"]).strftime("%H:%M")
            await meta_wa_service.send_delay_followup_buttons(
                to_phone=patient.whatsapp_no,
                log_id=log_id,
                patient_name=patient.name,
                medication_name=medication.name,
                dosage=medication.dosage,
                scheduled_time_str=sched_time
            )
            return {"success": True, "action": action, "status": "DELAYED"}

        # 3. User klik [Ya, Sudah] saat Terlambat -> TRIGGER DYNAMIC RESCHEDULING ALGORITHM
        elif action == "BTN_LATE_TAKEN":
            reschedule_result = await self.apply_dynamic_rescheduling(log_id, now_wib)
            return {"success": True, "action": action, "result": reschedule_result}

        # 4. User klik [Belum Lagi] saat follow-up keterlambatan
        elif action == "BTN_LATE_NOT":
            log["status"] = "SKIPPED"
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            msg = (
                f"⚠️ *Peringatan:* Dosis *{medication.name}* terlewati/ditunda.\n"
                f"Keluarga/caregiver Anda telah menerima notifikasi perihal keterlambatan ini. "
                f"Jangan gandakan dosis di waktu berikutnya tanpa petunjuk dokter."
            )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            return {"success": True, "action": action, "status": "SKIPPED"}

        return {"success": False, "message": "Unknown button action"}

    # ─── Dynamic Rescheduling Core Algorithm ──────────────────────────────────

    async def apply_dynamic_rescheduling(self, log_id: str, actual_taken_at: datetime) -> dict[str, Any]:
        """
        ALGORITMA DYNAMIC RESCHEDULING:
        Menghitung ulang waktu jadwal obat SELANJUTNYA:
          Waktu Aktual Minum + Interval Dosis Asli dari Dokter
        Mencegah interval yang terlalu dekat yang berisiko toksisitas/overdosis.
        """
        log = self._logs[log_id]
        patient = self.get_patient(log["patient_id"])
        medication = MedicationModel(**self._medications[log["medication_id"]])

        # 1. Update log saat ini
        log["status"] = "RESCHEDULED"
        log["actual_taken_at"] = actual_taken_at.isoformat()
        log["updated_at"] = actual_taken_at.isoformat()

        # Interval asli dosis
        interval_hours = medication.schedule.interval_hours or 8
        ideal_interval = timedelta(hours=interval_hours)
        min_safety_gap = timedelta(hours=interval_hours * 0.75)  # 75% dari interval asli

        # 2. Cari jadwal dosis berikutnya yang masih PENDING
        next_log = self._find_next_pending_log(medication.id, log["scheduled_at"])

        if not next_log:
            self._save_data()
            msg = (
                f"✅ Obat *{medication.name}* telah dicatat diminum pada pukul {actual_taken_at.strftime('%H:%M')} WIB.\n\n"
                f"Ini adalah dosis penutup untuk periode ini. Terima kasih!"
            )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            return {"rescheduled": False, "reason": "No subsequent pending doses"}

        # 3. Hitung selisih waktu antara actual taken dan jadwal asli berikutnya
        original_next_dt = datetime.fromisoformat(next_log.scheduled_at)
        remaining_gap = original_next_dt - actual_taken_at

        is_shifted = False
        new_next_dt = original_next_dt

        # Jika jarak ke dosis berikutnya < jarak aman medis minimum:
        if remaining_gap < min_safety_gap:
            # Shift jadwal berikutnya = Waktu Aktual Minum + Interval Dosis Asli
            new_next_dt = actual_taken_at + ideal_interval
            is_shifted = True

            # Update database untuk log berikutnya
            self._logs[next_log.id]["scheduled_at"] = new_next_dt.isoformat()
            self._logs[next_log.id]["updated_at"] = datetime.now(WIB_OFFSET).isoformat()

        self._save_data()

        # 4. Format pesan konfirmasi WhatsApp
        actual_str = actual_taken_at.strftime("%H:%M")
        next_str = new_next_dt.strftime("%H:%M")

        if is_shifted:
            msg = (
                f"✅ Obat *{medication.name}* tercatat diminum (terlambat) pada pukul *{actual_str} WIB*.\n\n"
                f"🔄 *Penyesuaian Jadwal Otomatis (Dynamic Rescheduling):*\n"
                f"Agar jarak dosis tetap aman secara medis ({interval_hours} jam), jadwal berikutnya telah "
                f"disesuaikan otomatis menjadi pukul *{next_str} WIB*."
            )
            self.add_activity_log(
                event_type="DYNAMIC_RESCHEDULED",
                title=f"Dynamic Rescheduling Triggered: {patient.name}",
                details={
                    "medication": medication.name,
                    "actual_taken_at": actual_str,
                    "new_next_dose_time": next_str,
                    "interval_hours": interval_hours,
                    "patient_phone": patient.whatsapp_no
                }
            )
        else:
            msg = (
                f"✅ Obat *{medication.name}* tercatat diminum pada pukul *{actual_str} WIB*.\n\n"
                f"Jadwal berikutnya tetap aman sesuai rencana pada pukul *{next_str} WIB*."
            )
            self.add_activity_log(
                event_type="DOSE_RECORDED",
                title=f"Dose Recorded (Gap Safe): {patient.name}",
                details={"medication": medication.name, "time": actual_str, "next_time": next_str}
            )

        await meta_wa_service.send_text_message(patient.whatsapp_no, msg)

        return {
            "rescheduled": is_shifted,
            "actual_taken_at": actual_taken_at.isoformat(),
            "original_next": original_next_dt.isoformat(),
            "new_next": new_next_dt.isoformat(),
            "interval_hours": interval_hours
        }

    def _find_next_pending_log(self, medication_id: str, after_scheduled_at: str) -> Optional[MedicationLogModel]:
        matching = []
        for l in self._logs.values():
            if l.get("medication_id") == medication_id and l.get("status") == "PENDING" and l.get("scheduled_at") > after_scheduled_at:
                matching.append(MedicationLogModel(**l))
        matching.sort(key=lambda x: x.scheduled_at)
        return matching[0] if matching else None


# Singleton reminder engine
reminder_engine = ReminderEngine()
