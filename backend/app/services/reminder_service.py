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
import re
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


def to_utc_iso(dt_or_str: datetime | str, tz_str: str = "Asia/Jakarta") -> str:
    """Convert datetime or ISO string to standard UTC ISO string (e.g. 2026-10-15T01:00:00+00:00)."""
    if isinstance(dt_or_str, str):
        dt = datetime.fromisoformat(dt_or_str)
    else:
        dt = dt_or_str
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=WIB_OFFSET)
    return dt.astimezone(timezone.utc).isoformat()


def to_local_iso(dt_or_str: datetime | str, tz_str: str = "Asia/Jakarta") -> str:
    """Convert UTC datetime or ISO string to user local timezone ISO string (WIB UTC+7)."""
    if isinstance(dt_or_str, str):
        dt = datetime.fromisoformat(dt_or_str)
    else:
        dt = dt_or_str
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(WIB_OFFSET).isoformat()


# ─── Pydantic Data Models ────────────────────────────────────────────────────

def parse_indonesian_snooze(text: str, reference_time: Optional[datetime] = None) -> Optional[datetime]:
    """
    Ekstraksi ekspresi waktu tunda dari teks bahasa Indonesia alami.
    Mendukung pola:
      - Relatif: 'tunda 45 menit', 'ingatkan 30 mnt', 'tunda 1 jam', 'undur 2 jam'
      - Absolut: 'ingatkan jam 8 malam', 'tunda sampai jam 10 pagi', 'jam 20:30'
    """
    now = reference_time or datetime.now(WIB_OFFSET)
    cleaned = text.strip().lower()

    # 0. Pola Percakapan Populer
    if cleaned in ("setengah jam", "tunda setengah jam", "undur setengah jam", "30m", "30 mnt", "30 menit"):
        return now + timedelta(minutes=30)
    if cleaned in ("sebentar", "nanti", "sebentar lagi", "tunda sebentar", "15m", "15 mnt", "15 menit"):
        return now + timedelta(minutes=15)
    if cleaned in ("1 jam", "tunda 1 jam", "undur 1 jam", "sejam"):
        return now + timedelta(hours=1)
    if cleaned in ("2 jam", "tunda 2 jam", "undur 2 jam"):
        return now + timedelta(hours=2)

    # 1. Pola Relatif (Menit / Jam)
    rel_match = re.search(r'(?:tunda|undur|nanti|ingatkan|lagi)?\s*(\d+(?:[.,]\d+)?)\s*(menit|mnt|m|jam|jm)', cleaned)
    if rel_match:
        val = float(rel_match.group(1).replace(',', '.'))
        unit = rel_match.group(2)
        if unit in ('menit', 'mnt', 'm'):
            return now + timedelta(minutes=val)
        else:
            return now + timedelta(hours=val)

    # 2. Pola Jam Spesifik (Absolut)
    abs_match = re.search(r'(?:jam|pukul)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|siang|sore|malam)?', cleaned)
    if abs_match:
        hours = int(abs_match.group(1))
        minutes = int(abs_match.group(2)) if abs_match.group(2) else 0
        period = abs_match.group(3)

        if period == 'malam' and hours < 12:
            hours += 12
        elif period == 'sore' and hours <= 6:
            hours += 12
        elif period == 'siang' and hours <= 3:
            hours += 12
        elif period == 'pagi' and hours == 12:
            hours = 0

        target_time = now.replace(hour=hours, minute=minutes, second=0, microsecond=0)
        if target_time <= now:
            target_time += timedelta(days=1)
        return target_time

    return None


def get_medicine_medical_advice(med_name: str, instructions: Optional[str] = None) -> dict[str, Any]:
    """
    Menyediakan penjelasan fungsi obat, anjuran medis, dan tips kesehatan edukatif
    berdasarkan nama obat yang dikonsumsi pasien.
    """
    clean_name = (med_name or "").strip().lower()

    # 1. Obat Flu, Demam, Batuk (Ultraflu, Panadol, Paracetamol, Bodrex, Decolgen, Mixagrip, dsb)
    if any(k in clean_name for k in ["ultraflu", "panadol", "paracetamol", "bodrex", "flu", "batuk", "mixagrip", "decolgen", "procold", "flucadex", "inza", "paratusin"]):
        return {
            "category": "Obat Flu, Batuk & Pereda Demam",
            "indication": "Meringankan gejala flu seperti hidung tersumbat, bersin-bersin, demam, dan sakit kepala.",
            "tips": [
                "Perbanyak minum air putih hangat (minimal 2 liter/hari) untuk membantu mengencerkan lendir dan hidrasi tubuh.",
                "Istirahat tidur 7-8 jam agar imunitas tubuh bekerja maksimal melawan infeksi virus flu.",
                "Obat flu ini dapat menyebabkan kantuk. Hindari mengemudi kendaraan atau mengoperasikan mesin berat.",
                "Hindari minuman dingin/es dan makanan berminyak selama masa pemulihan saluran pernapasan."
            ]
        }

    # 2. Obat Tekanan Darah / Hipertensi (Amlodipine, Captopril, Candesartan, Bisoprolol, Valsartan)
    elif any(k in clean_name for k in ["amlodipine", "captopril", "candesartan", "bisoprolol", "valsartan", "tensicap", "norvask"]):
        return {
            "category": "Antihipertensi (Pengontrol Tekanan Darah)",
            "indication": "Menstabilkan tekanan darah serta melindungi kesehatan jantung dan pembuluh darah.",
            "tips": [
                "Minum obat di jam yang sama setiap hari agar tensi terkontrol stabil sepanjang hari.",
                "Kurangi asupan garam/natrium dan makanan olahan tinggi lemak jenuh.",
                "Hindari bangkit berdiri secara tiba-tiba dari posisi duduk/tidur untuk mencegah rasa pusing/sempoyongan."
            ]
        }

    # 3. Obat Lambung / Maag / Asam Lambung (Promag, Mylanta, Omeprazole, Lansoprazole, Antasida)
    elif any(k in clean_name for k in ["promag", "mylanta", "omeprazole", "lansoprazole", "antasida", "polysilane", "sucralfate", "ranitidine"]):
        return {
            "category": "Obat Saluran Cerna / Lambung",
            "indication": "Menetralkan dan menekan asam lambung serta meredakan rasa perih di ulu hati.",
            "tips": [
                "Bila aturan minum sebelum makan, minumlah 30-60 menit sebelum makan agar lambung terproteksi.",
                "Hindari makanan pedas, terlalu asam, kopi, teh pekat, dan minuman bersoda.",
                "Beri jeda minimal 2 jam setelah makan sebelum berbaring untuk mencegah naiknya asam lambung (GERD)."
            ]
        }

    # 4. Obat Antibiotik (Amoxicillin, Cefixime, Ciprofloxacin, Azithromycin)
    elif any(k in clean_name for k in ["amoxicillin", "cefixime", "ciprofloxacin", "azithromycin", "erythromycin", "thiamphenicol"]):
        return {
            "category": "Antibiotik (Antimikroba)",
            "indication": "Membasmi infeksi bakteri penyebab penyakit di dalam tubuh.",
            "tips": [
                "Wajib dihabiskan seluruhnya sesuai instruksi resep dokter untuk mencegah resistensi bakteri.",
                "Konsumsi dengan jadwal teratur agar kadar antibiotik dalam darah tetap stabil.",
                "Bila timbul ruam kulit atau gatal tidak biasa, segera konsultasikan ke fasilitas kesehatan."
            ]
        }

    # Default Obat Umum
    return {
        "category": "Terapi Pengobatan Medis",
        "indication": f"Mendukung proses terapi dan pemulihan kesehatan pasien untuk {med_name}.",
        "tips": [
            f"Patuhi aturan minum ({instructions or 'sesuai anjuran'}) untuk penyerapan optimal zat aktif.",
            "Cukupi kebutuhan cairan tubuh dengan minum air putih yang cukup.",
            "Simpan obat pada suhu sejuk di bawah 30°C dan hindarkan dari sinar matahari langsung."
        ]
    }


class PatientModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    name: str
    whatsapp_no: str  # Format 628xxxxxxxxxx or QR contact identifier
    qr_code_url: Optional[str] = None
    qr_contact_name: Optional[str] = None
    caregiver_name: Optional[str] = None
    caregiver_whatsapp: Optional[str] = None
    escalation_enabled: bool = True
    timezone: str = "Asia/Jakarta"
    created_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())


class ScheduleModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str = "FIXED_TIMES"  # "FIXED_TIMES" or "INTERVAL"
    interval_hours: int = 8    # Default interval e.g. every 8 hours
    target_times: list[str] = Field(default_factory=lambda: ["08:00", "14:00", "20:00"])  # HH:MM strings
    user_timezone: str = "Asia/Jakarta"


class MedicationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    patient_id: str
    name: str
    dosage: str
    instructions: Optional[str] = "Sesudah makan"
    start_date: str  # YYYY-MM-DD
    duration_days: int = 7
    stock_quantity: int = 30
    daily_dose_count: int = 1
    refill_threshold_days: int = 3
    image_url: Optional[str] = None
    is_active: bool = True
    user_timezone: str = "Asia/Jakarta"
    created_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())
    schedule: ScheduleModel = Field(default_factory=ScheduleModel)


class MedicationLogModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    medication_id: str
    patient_id: str
    user_timezone: str = "Asia/Jakarta"
    original_scheduled_at: Optional[str] = None
    scheduled_at: str       # ISO format with timezone (shifts when snoozed)
    scheduled_at_utc: Optional[str] = None  # Standard UTC datetime for global cron/scheduler
    status: str = "PENDING"  # PENDING, REMINDED_10M, DUE_0M, TAKEN, SNOOZED, DELAYED, COMPLETED, RESCHEDULED, SKIPPED, ESCALATED
    snooze_count: int = 0
    snoozed_until: Optional[str] = None
    skip_reason: Optional[str] = None
    reminded_10m_at: Optional[str] = None
    due_sent_at: Optional[str] = None
    followup_sent_at: Optional[str] = None
    caregiver_escalated_at: Optional[str] = None
    taken_at: Optional[str] = None          # Exact timestamp when user clicks [Ya, Sudah]
    actual_taken_at: Optional[str] = None   # Backward compatibility alias
    last_prompt: Optional[str] = None       # DUE_0M, SNOOZE_MENU, DELAY_FOLLOWUP, ESCALATED_PROMPT, PRE_10M
    created_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(WIB_OFFSET).isoformat())


# ─── Reminder Store & Engine ──────────────────────────────────────────────────

class ReminderEngine:
    def __init__(self, db_file: Optional[Path] = None):
        self._db_file = db_file or REMINDERS_DB_FILE
        self._patients: dict[str, dict] = {}
        self._medications: dict[str, dict] = {}
        self._logs: dict[str, dict] = {}
        self._activity_logs: list[dict[str, Any]] = []
        self._load_data()

    def set_db_file(self, db_file: Path):
        self._db_file = db_file
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

    def calculate_weekly_adherence(self, patient_id: str) -> float:
        """
        Hitung persentase kepatuhan minum obat pasien dalam 7 hari terakhir:
        (total dosis diminum [TAKEN/COMPLETED] / total jadwal dosis) * 100%
        """
        now = datetime.now(WIB_OFFSET)
        week_ago = now - timedelta(days=7)
        total_doses = 0
        taken_doses = 0

        for log_data in self._logs.values():
            if log_data.get("patient_id") != patient_id:
                continue
            try:
                sched_str = log_data.get("scheduled_at", "")
                if not sched_str:
                    continue
                sched_dt = datetime.fromisoformat(sched_str)
                if sched_dt.tzinfo is None:
                    sched_dt = sched_dt.replace(tzinfo=WIB_OFFSET)

                # Dosis dalam rentang 7 hari terakhir hingga saat ini
                if week_ago <= sched_dt <= now + timedelta(hours=1):
                    total_doses += 1
                    status = log_data.get("status", "")
                    if status in ("COMPLETED", "TAKEN", "RESCHEDULED"):
                        taken_doses += 1
            except Exception:
                continue

        if total_doses == 0:
            return 100.0
        return round((taken_doses / total_doses) * 100.0, 1)

    def _load_data(self):
        if not self._db_file.exists():
            self._save_data()
            return

        try:
            content = self._db_file.read_text(encoding="utf-8").strip()
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
            self._db_file.parent.mkdir(parents=True, exist_ok=True)
            self._db_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
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
        caregiver_name: Optional[str] = None,
        caregiver_whatsapp: Optional[str] = None,
        escalation_enabled: bool = True,
    ) -> PatientModel:
        clean_wa = meta_wa_service.clean_recipient(whatsapp_no) if whatsapp_no else ""
        clean_cg_wa = meta_wa_service.clean_recipient(caregiver_whatsapp) if caregiver_whatsapp else ""
        if not clean_wa and qr_code_url:
            clean_wa = "QR_" + str(uuid.uuid4())[:8]
        patient = PatientModel(
            name=name,
            whatsapp_no=clean_wa,
            user_id=user_id,
            qr_code_url=qr_code_url,
            qr_contact_name=qr_contact_name,
            caregiver_name=caregiver_name,
            caregiver_whatsapp=clean_cg_wa or None,
            escalation_enabled=escalation_enabled
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
        start_date_str: Optional[str] = None,
        stock_quantity: int = 30,
        daily_dose_count: Optional[int] = None,
        refill_threshold_days: int = 3,
        image_url: Optional[str] = None,
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
            cleaned_times = []
            if target_times:
                for t in target_times:
                    t_str = str(t).strip().replace(".", ":")
                    parts = t_str.split(":")
                    if len(parts) >= 2:
                        try:
                            h, m = int(parts[0]), int(parts[1])
                            cleaned_times.append(f"{h:02d}:{m:02d}")
                        except ValueError:
                            pass
            actual_times = cleaned_times if cleaned_times else ["08:00"]

        schedule = ScheduleModel(
            type=schedule_type,
            interval_hours=interval_hours,
            target_times=actual_times
        )

        eff_daily_count = daily_dose_count or max(1, len(actual_times))
        medication = MedicationModel(
            patient_id=patient_id,
            name=name,
            dosage=dosage,
            instructions=instructions or "Sesudah makan",
            start_date=start_date,
            duration_days=duration_days,
            stock_quantity=stock_quantity,
            daily_dose_count=eff_daily_count,
            refill_threshold_days=refill_threshold_days,
            image_url=image_url,
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
                    scheduled_time_utc = scheduled_time.astimezone(timezone.utc)
                    
                    log = MedicationLogModel(
                        medication_id=medication.id,
                        patient_id=patient_id,
                        user_timezone=patient.timezone or "Asia/Jakarta",
                        original_scheduled_at=scheduled_time.isoformat(),
                        scheduled_at=scheduled_time.isoformat(),
                        scheduled_at_utc=scheduled_time_utc.isoformat(),
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
        log_data["last_prompt"] = "DUE_0M"
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
            # 10 menit sebelum jadwal dicatat sebagai REMINDED_10M (list_logs akan menampilkan PENDING untuk dashboard)
            log_data["status"] = "REMINDED_10M"
            log_data["reminded_10m_at"] = now_wib.isoformat()
            log_data["last_prompt"] = "PRE_10M"
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
        self._load_data()
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

                # Evaluate using UTC datetime comparison
                if log_data.get("scheduled_at_utc"):
                    scheduled_utc = datetime.fromisoformat(log_data["scheduled_at_utc"])
                else:
                    sched_raw = datetime.fromisoformat(log_data["scheduled_at"])
                    scheduled_utc = sched_raw.replace(tzinfo=WIB_OFFSET).astimezone(timezone.utc) if sched_raw.tzinfo is None else sched_raw.astimezone(timezone.utc)

                now_utc = (current_time.astimezone(timezone.utc) if current_time.tzinfo else current_time.replace(tzinfo=WIB_OFFSET).astimezone(timezone.utc)) if current_time else datetime.now(timezone.utc)
                diff_seconds = (scheduled_utc - now_utc).total_seconds()
                diff_minutes = diff_seconds / 60.0

                # Format time string in user local timezone (WIB)
                time_str = scheduled_utc.astimezone(WIB_OFFSET).strftime("%H:%M")

                # ─── Tahap 1: Pre-Medication Reminder (T - 10 Menit) ───
                if status == "PENDING" and not log_data.get("reminded_10m_at") and 0 < diff_minutes <= 10:
                    log_data["status"] = "REMINDED_10M"
                    log_data["reminded_10m_at"] = now.isoformat()
                    log_data["last_prompt"] = "PRE_10M"
                    log_data["updated_at"] = now.isoformat()
                    counts["reminded_10m"] += 1

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
                        title=f"Tahap 1: Pra-Minum Obat (H-10M) Dikirim ke WhatsApp {patient.name}",
                        details={"medication": medication.name, "time": time_str, "res": pre_res}
                    )

                # ─── Tahap 2: Main Execution & Confirmation (Tepat pada Jamnya / T - 0) ───
                elif status in ("PENDING", "REMINDED_10M", "SNOOZED") and -15 <= diff_minutes <= 0 and not log_data.get("due_sent_at"):
                    log_data["status"] = "DUE_0M"
                    log_data["due_sent_at"] = now.isoformat()
                    log_data["last_prompt"] = "DUE_0M"
                    log_data["updated_at"] = now.isoformat()
                    counts["due_0m"] += 1

                    due_res = await meta_wa_service.send_due_reminder_buttons(
                        to_phone=patient.whatsapp_no,
                        log_id=log_id,
                        patient_name=patient.name,
                        medication_name=medication.name,
                        dosage=medication.dosage,
                        instructions=medication.instructions,
                        image_url=medication.image_url,
                        scheduled_time_str=time_str
                    )
                    self.add_activity_log(
                        event_type="DUE_0M",
                        title=f"Tahap 2: Pesan Interaktif Konfirmasi Dikirim: {patient.name}",
                        details={"medication": medication.name, "log_id": log_id, "res": due_res}
                    )

                # ─── Catch-up Dosis Lewat (Jika server baru online / jadwal tertinggal >15m) ───
                elif status in ("PENDING", "REMINDED_10M") and diff_minutes < -15 and not log_data.get("due_sent_at"):
                    log_data["status"] = "DELAYED"
                    log_data["due_sent_at"] = now.isoformat()
                    log_data["followup_sent_at"] = now.isoformat()
                    log_data["last_prompt"] = "DELAY_FOLLOWUP"
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
                        event_type="FOLLOWUP_CATCHUP",
                        title=f"Late Dose Follow-up Catch-up: {patient.name}",
                        details={"medication": medication.name, "log_id": log_id, "res": delay_res}
                    )

                # ─── Smart Follow-up & Caregiver Escalation ───
                # A. Keterlambatan / Timeout (+15 menit tanpa konfirmasi): Gentle follow-up
                elif status in ("DUE_0M", "DELAYED") and diff_minutes < -15 and not log_data.get("followup_sent_at"):
                    log_data["status"] = "DELAYED"
                    log_data["followup_sent_at"] = now.isoformat()
                    log_data["last_prompt"] = "DELAY_FOLLOWUP"
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
                        event_type="FOLLOWUP_15M",
                        title=f"Gentle Follow-up (+15m) Sent: {patient.name}",
                        details={"medication": medication.name, "log_id": log_id, "res": delay_res}
                    )

                # B. Eskalasi Pendamping / Caregiver (+30 menit tetap tidak ada respon)
                elif status in ("DUE_0M", "DELAYED") and diff_minutes < -30 and not log_data.get("caregiver_escalated_at"):
                    log_data["caregiver_escalated_at"] = now.isoformat()
                    log_data["status"] = "ESCALATED"
                    log_data["last_prompt"] = "ESCALATED_PROMPT"
                    log_data["updated_at"] = now.isoformat()

                    time_str = scheduled_dt.strftime("%H:%M")
                    if patient.caregiver_whatsapp and patient.escalation_enabled:
                        esc_res = await meta_wa_service.send_caregiver_escalation_alert(
                            caregiver_phone=patient.caregiver_whatsapp,
                            caregiver_name=patient.caregiver_name or "Pendamping Pasien",
                            patient_name=patient.name,
                            medication_name=medication.name,
                            scheduled_time_str=time_str
                        )
                        self.add_activity_log(
                            event_type="CAREGIVER_ESCALATED_30M",
                            title=f"Eskalasi Caregiver (+30m) Terkirim ke: {patient.caregiver_name or 'Pendamping'}",
                            details={"patient": patient.name, "caregiver_phone": patient.caregiver_whatsapp, "res": esc_res}
                        )

            except Exception as loop_err:
                logger.error("[ReminderEngine] Error evaluating log %s: %s", log_id, loop_err)

        self._save_data()
        return counts

    # ─── Webhook Interaction & Rescheduling Engine ─────────────────────────────

    async def handle_button_interaction(self, button_id: str) -> dict[str, Any]:
        """
        Process Meta interactive reply button click:
          - ACT_TAKEN / BTN_ONTIME_TAKEN:<log_id> -> COMPLETED & kurangi stok & cek refill
          - ACT_SNOOZE_MENU / BTN_ONTIME_NOT:<log_id> -> Kirim opsi tunda 15m, 30m, 1h
          - ACT_SNOOZE_FIXED:<log_id>:<minutes> -> SNOOZED (+minutes) & jadwalkan ulang
          - ACT_SKIP / BTN_LATE_NOT:<log_id> -> SKIPPED
          - BTN_LATE_TAKEN:<log_id> -> RESCHEDULED (Dynamic Rescheduling Algorithm)
        """
        self._load_data()
        parts = button_id.split(":")
        action = parts[0]
        log_id = parts[1] if len(parts) > 1 else ""
        extra_param = parts[2] if len(parts) > 2 else ""

        if not log_id or log_id not in self._logs:
            return {"success": False, "message": "Log ID not found"}

        log = self._logs[log_id]
        patient = self.get_patient(log["patient_id"])
        medication = MedicationModel(**self._medications[log["medication_id"]]) if log["medication_id"] in self._medications else None
        now_wib = datetime.now(WIB_OFFSET)

        if not patient or not medication:
            return {"success": False, "message": "Associated patient or medication missing"}

        # 1. Skenario A: User Mengklik [ ✅ Ya, Sudah ]
        if action in ("ACT_TAKEN", "BTN_ONTIME_TAKEN"):
            log["status"] = "TAKEN"
            log["taken_at"] = now_wib.isoformat()
            log["actual_taken_at"] = now_wib.isoformat()
            log["last_prompt"] = "TAKEN"
            log["updated_at"] = now_wib.isoformat()

            # Otomatis kurangi stok obat di inventaris
            med_dict = self._medications.get(medication.id)
            if med_dict:
                curr_stock = max(0, med_dict.get("stock_quantity", 30) - 1)
                med_dict["stock_quantity"] = curr_stock
                self._medications[medication.id] = med_dict

                daily_count = max(1, med_dict.get("daily_dose_count", 1))
                days_left = curr_stock // daily_count
                threshold = med_dict.get("refill_threshold_days", 3)

                # Kirim Refill Alert jika sisa stok <= ambang hari
                if days_left <= threshold and curr_stock > 0:
                    try:
                        asyncio.create_task(
                            meta_wa_service.send_refill_alert(
                                to_phone=patient.whatsapp_no,
                                patient_name=patient.name,
                                medication_name=medication.name,
                                remaining_stock=curr_stock,
                                days_left=days_left
                            )
                        )
                    except Exception as ref_err:
                        logger.warning("[ReminderEngine] Error queueing refill alert: %s", ref_err)

            self._save_data()

            # Hitung persentase tingkat kepatuhan minggu ini
            adherence_pct = self.calculate_weekly_adherence(patient.id)
            waktu_klik = now_wib.strftime("%H:%M")

            # Ambil saran dan anjuran medis edukatif
            med_advice = get_medicine_medical_advice(medication.name, medication.instructions)
            tips_text = "\n".join([f"• {t}" for t in med_advice["tips"]])

            msg = (
                f"🎉 Terima kasih atas konfirmasinya!\n"
                f"Catatan: Obat *{medication.name}* telah berhasil ditandai SUDAH DIMINUM pada pukul {waktu_klik} WIB.\n\n"
                f"Luar biasa, tingkat kepatuhan Anda minggu ini: {adherence_pct:.0f}%! Tetap konsisten jaga kesehatan ya! 💪\n\n"
                f"💡 *Penjelasan & Saran Medis:*\n"
                f"• *Kategori:* {med_advice['category']}\n"
                f"• *Khasiat:* {med_advice['indication']}\n"
                f"{tips_text}"
            )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            self.add_activity_log(
                event_type="BUTTON_TAKEN",
                title=f"User Confirmed [Sudah Minum]: {patient.name}",
                details={"medication": medication.name, "log_id": log_id, "status": "TAKEN", "adherence": f"{adherence_pct:.0f}%"}
            )
            return {"success": True, "action": action, "status": "TAKEN", "adherence": adherence_pct}

        # 2. Skenario B: User Mengklik [ ❌ Belum ]
        elif action in ("ACT_NOT_YET", "ACT_SNOOZE_MENU", "BTN_ONTIME_NOT"):
            log["status"] = "DELAYED"
            log["last_prompt"] = "SNOOZE_MENU"
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            snooze_res = await meta_wa_service.send_snooze_options_buttons(
                to_phone=patient.whatsapp_no,
                log_id=log_id,
                medication_name=medication.name
            )
            self.add_activity_log(
                event_type="NOT_YET_DELAYED",
                title=f"User Memilih [Belum] - Status DELAYED & Opsi Tunda Dikirim: {patient.name}",
                details={"medication": medication.name, "log_id": log_id, "res": snooze_res}
            )
            return {"success": True, "action": action, "status": "DELAYED"}

        # 3. Sub-Skenario B.1: User Memilih Tunda (Snooze 15/30 Menit)
        elif action == "ACT_SNOOZE_FIXED":
            try:
                minutes = int(extra_param) if extra_param else 15
            except ValueError:
                minutes = 15

            new_dt = now_wib + timedelta(minutes=minutes)
            log["status"] = "SNOOZED"
            log["scheduled_at"] = new_dt.isoformat()
            log["scheduled_at_utc"] = new_dt.astimezone(timezone.utc).isoformat()
            log["snoozed_until"] = new_dt.isoformat()
            log["snooze_count"] = log.get("snooze_count", 0) + 1
            log["due_sent_at"] = None  # Reset agar saat tiba waktu baru, tombol interaktif dikirim ulang
            log["followup_sent_at"] = None  # Reset follow-up timer untuk waktu baru
            log["caregiver_escalated_at"] = None  # Reset eskalasi
            log["last_prompt"] = "SNOOZED"
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            msg = (
                f"⏱️ Baik *{patient.name}*, pengingat obat *{medication.name}* telah ditunda selama *{minutes} menit*.\n\n"
                f"Bot akan mengingatkan Anda kembali pada pukul *{new_dt.strftime('%H:%M')} WIB*. Siapkan air minumnya ya! 🌿"
            )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            self.add_activity_log(
                event_type="SNOOZE_FIXED_APPLIED",
                title=f"Snooze +{minutes}m Terpasang: {patient.name}",
                details={"medication": medication.name, "log_id": log_id, "minutes": minutes}
            )
            return {"success": True, "action": action, "status": "SNOOZED", "minutes": minutes, "new_scheduled_at": new_dt.isoformat()}

        # 4. Sub-Skenario B.2: User Memilih [ 🚫 Lewati Dosis Ini ]
        elif action in ("ACT_SKIP", "BTN_LATE_NOT"):
            log["status"] = "SKIPPED"
            log["last_prompt"] = "SKIPPED"
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            msg = (
                f"🚫 Dosis obat *{medication.name}* untuk jam ini telah ditandai DILEWATI.\n\n"
                f"⚠️ *Catatan Keselamatan Medis:*\n"
                f"Jangan menggandakan dosis pada jadwal minum berikutnya untuk mengganti dosis yang terlewat. "
                f"Konsultasikan dengan dokter jika Anda sering melewatkan dosis obat."
            )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            self.add_activity_log(
                event_type="DOSE_SKIPPED",
                title=f"Dosis Dilewati oleh {patient.name}",
                details={"medication": medication.name, "log_id": log_id, "status": "SKIPPED"}
            )
            return {"success": True, "action": action, "status": "SKIPPED"}

        # 5. User klik [Ya, Sudah] saat Terlambat -> TRIGGER DYNAMIC RESCHEDULING ALGORITHM
        elif action in ("BTN_LATE_TAKEN", "ACT_LATE_TAKEN"):
            reschedule_result = await self.apply_dynamic_rescheduling(log_id, now_wib)
            return {"success": True, "action": action, "result": reschedule_result}

        return {"success": False, "message": "Unknown button action"}

    async def handle_text_interaction(self, from_phone: str, text: str) -> dict[str, Any]:
        """
        Handle balasan teks WhatsApp pasien:
          - Angka 1 / 'sudah' / 'sudah minum' / '✅' -> Eksekusi COMPLETED + Penjelasan & Saran Medis Edukatif!
          - Angka 2 / 'belum' / 'tunda' / 'tunda 30 menit' / 'ingatkan jam 8 malam' -> Eksekusi SNOOZE
          - Angka 3 / 'lewati' / 'skip' -> Eksekusi SKIPPED + Peringatan keselamatan
        """
        self._load_data()
        clean_phone = meta_wa_service.clean_recipient(from_phone)
        now_wib = datetime.now(WIB_OFFSET)

        # 1. Cari pasien berdasarkan nomor WhatsApp
        patient = None
        for p in self._patients.values():
            p_wa = meta_wa_service.clean_recipient(p.get("whatsapp_no", ""))
            if p_wa == clean_phone:
                patient = PatientModel(**p)
                break

        # Fallback suffix match (matching last 9 digits for carrier prefix differences)
        if not patient and len(clean_phone) >= 8:
            for p in self._patients.values():
                p_wa = meta_wa_service.clean_recipient(p.get("whatsapp_no", ""))
                if p_wa and len(p_wa) >= 8 and (clean_phone[-9:] == p_wa[-9:]):
                    patient = PatientModel(**p)
                    break

        if not patient:
            logger.warning("[ReminderEngine] Incoming message from unknown phone: %s", clean_phone)
            return {"success": False, "reason": "Patient not found for this phone"}

        # 2. Temukan reminder log aktif milik pasien ini
        # Prioritaskan status DUE_0M, DELAYED, dan ESCALATED (yang sedang aktif menunggu interaksi bot)
        candidate_logs = []
        for lid, ldata in self._logs.items():
            if ldata.get("patient_id") == patient.id:
                status = ldata.get("status")
                if status in ("DUE_0M", "DELAYED", "SNOOZED", "ESCALATED", "PENDING"):
                    sched_str = ldata.get("scheduled_at", "")
                    try:
                        sched_dt = datetime.fromisoformat(sched_str)
                        if sched_dt.tzinfo is None:
                            sched_dt = sched_dt.replace(tzinfo=WIB_OFFSET)
                        diff_sec = abs((sched_dt - now_wib).total_seconds())
                    except Exception:
                        diff_sec = 999999

                    # Priority score: DUE_0M / DELAYED / ESCALATED (0), SNOOZED (1), PENDING within 2h (2)
                    if status in ("DUE_0M", "DELAYED", "ESCALATED"):
                        prio = 0
                    elif status == "SNOOZED":
                        prio = 1
                    else:
                        prio = 2 if diff_sec <= 7200 else 99
                    if prio < 99:
                        candidate_logs.append((prio, diff_sec, lid, ldata))

        candidate_logs.sort(key=lambda x: (x[0], x[1]))
        target_log_id = candidate_logs[0][2] if candidate_logs else None

        if not target_log_id:
            # Periksa apakah ada obat yang baru saja ditandai TAKEN dalam 30 menit terakhir
            recent_taken = None
            for lid, ldata in self._logs.items():
                if ldata.get("patient_id") == patient.id and ldata.get("status") in ("TAKEN", "RESCHEDULED"):
                    taken_at_str = ldata.get("taken_at") or ldata.get("actual_taken_at") or ldata.get("updated_at")
                    if taken_at_str:
                        try:
                            t_dt = datetime.fromisoformat(taken_at_str)
                            if t_dt.tzinfo is None:
                                t_dt = t_dt.replace(tzinfo=WIB_OFFSET)
                            if (now_wib - t_dt).total_seconds() < 1800:
                                recent_taken = (lid, ldata)
                                break
                        except Exception:
                            pass

            if recent_taken:
                med_id = recent_taken[1].get("medication_id")
                med = self._medications.get(med_id, {})
                med_name = med.get("name", "Obat")
                msg = (
                    f"✅ Halo *{patient.name}*, jadwal obat *{med_name}* sudah berhasil ditandai SUDAH DIMINUM sebelumnya. "
                    f"Terima kasih telah disiplin menjaga kesehatan! Tetap konsisten ya! 💪"
                )
                await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
                return {"success": True, "reason": "Already marked TAKEN recently"}

            # Cari jadwal PENDING berikutnya
            next_pending_info = None
            for lid, ldata in self._logs.items():
                if ldata.get("patient_id") == patient.id and ldata.get("status") == "PENDING":
                    sched_str = ldata.get("scheduled_at", "")
                    try:
                        sched_dt = datetime.fromisoformat(sched_str)
                        if sched_dt.tzinfo is None:
                            sched_dt = sched_dt.replace(tzinfo=WIB_OFFSET)
                        if sched_dt > now_wib:
                            if next_pending_info is None or sched_dt < next_pending_info[0]:
                                next_pending_info = (sched_dt, lid, ldata)
                    except Exception:
                        pass

            if next_pending_info:
                next_dt, _, next_ldata = next_pending_info
                med_id = next_ldata.get("medication_id")
                med = self._medications.get(med_id, {})
                med_name = med.get("name", "Obat")
                next_time_str = next_dt.strftime("%H:%M")
                msg = (
                    f"🌿 Halo *{patient.name}*!\n\n"
                    f"Belum ada pengingat yang aktif menunggu konfirmasi.\n\n"
                    f"📅 *Jadwal obat berikutnya:*\n"
                    f"💊 *{med_name}* — pukul *{next_time_str} WIB*\n\n"
                    f"Pengingat otomatis akan dikirim saat waktunya tiba. 💪\n"
                    f"_PharmaShield Medicine Reminder_"
                )
            else:
                msg = (
                    f"🌿 Halo *{patient.name}*!\n\n"
                    f"Saat ini tidak ada jadwal pengingat obat yang aktif.\n\n"
                    f"Untuk mendaftarkan jadwal minum obat, buka aplikasi *PharmaShield* → menu *Pengingat Obat*.\n\n"
                    f"_PharmaShield Medicine Reminder_"
                )
            await meta_wa_service.send_text_message(patient.whatsapp_no, msg)
            return {"success": False, "reason": "No active reminder log found"}

        clean_text = text.strip().lower()
        log = self._logs[target_log_id]
        log_status = log.get("status")
        last_prompt = log.get("last_prompt", "")
        medication = MedicationModel(**self._medications[log["medication_id"]]) if log["medication_id"] in self._medications else None
        med_name = medication.name if medication else "Obat"

        # ── KONDISI 1: Pengguna sedang berada di Menu Opsi Tunda (last_prompt == "SNOOZE_MENU") ──
        if last_prompt == "SNOOZE_MENU":
            # Pilihan 1: Tunda 15 Menit
            if clean_text in ("1", "1.", "15", "15m", "15 mnt", "15 menit", "tunda 15", "tunda 15 menit") or "15 menit" in clean_text:
                return await self.handle_button_interaction(f"ACT_SNOOZE_FIXED:{target_log_id}:15")
            # Pilihan 2: Tunda 30 Menit
            if clean_text in ("2", "2.", "30", "30m", "30 mnt", "30 menit", "tunda 30", "tunda 30 menit") or "30 menit" in clean_text:
                return await self.handle_button_interaction(f"ACT_SNOOZE_FIXED:{target_log_id}:30")
            # Pilihan 3: Lewati Dosis Ini
            if clean_text in ("3", "3.", "lewati", "skip", "lewat", "batal", "lewati dosis") or clean_text.startswith("lewati") or clean_text.startswith("3"):
                return await self.handle_button_interaction(f"ACT_SKIP:{target_log_id}")
            # Jika pengguna berubah pikiran dan ketik sudah minum:
            if any(k in clean_text for k in ("sudah", "udah", "diminum", "ya, sudah", "selesai", "yes", "ok", "siap", "alhamdulillah")):
                if log_status in ("DELAYED", "ESCALATED"):
                    return await self.handle_button_interaction(f"BTN_LATE_TAKEN:{target_log_id}")
                return await self.handle_button_interaction(f"ACT_TAKEN:{target_log_id}")

        # ── KONDISI 2: Pengguna sedang di Notifikasi Terlambat / Eskalasi (DELAYED atau ESCALATED) ──
        if last_prompt in ("DELAY_FOLLOWUP", "ESCALATED_PROMPT") or log_status in ("DELAYED", "ESCALATED"):
            # Jika ketik 1 / sudah / ya -> konfirmasi diminum (eksekusi dynamic rescheduling)
            taken_late_keywords = (
                "1", "1.", "1-sudah", "1. sudah", "1 sudah",
                "sudah", "sudah minum", "diminum", "udah", "ya sudah", "ok sudah",
                "done", "selesai", "yes", "ya", "sip", "ok", "oke", "siap",
                "alhamdulillah", "✅", "✅ ya, sudah", "ya, sudah"
            )
            if clean_text in taken_late_keywords or clean_text.startswith("sudah") or clean_text.startswith("udah") or clean_text.startswith("1 ") or clean_text.startswith("1."):
                return await self.handle_button_interaction(f"BTN_LATE_TAKEN:{target_log_id}")

            # Jika ketik 2 / belum -> kirim menu opsi tunda
            belum_late_keywords = (
                "2", "2.", "2-belum", "2. belum", "2 belum",
                "belum", "belum minum", "gak", "tidak", "belum lagi", "❌", "❌ belum", "nanti", "tunda"
            )
            if clean_text in belum_late_keywords or clean_text.startswith("belum") or clean_text.startswith("2 ") or clean_text.startswith("2."):
                return await self.handle_button_interaction(f"ACT_NOT_YET:{target_log_id}")

            # Pilihan langsung menit tunda
            if clean_text in ("15", "15m", "15 mnt", "tunda 15", "tunda 15 menit", "15 menit") or "15 menit" in clean_text:
                return await self.handle_button_interaction(f"ACT_SNOOZE_FIXED:{target_log_id}:15")
            if clean_text in ("30", "30m", "30 mnt", "tunda 30", "tunda 30 menit", "30 menit") or "30 menit" in clean_text:
                return await self.handle_button_interaction(f"ACT_SNOOZE_FIXED:{target_log_id}:30")
            if clean_text in ("3", "3.", "lewati", "skip", "lewat", "batal", "tidak minum") or clean_text.startswith("lewati") or clean_text.startswith("3"):
                return await self.handle_button_interaction(f"ACT_SKIP:{target_log_id}")

        # ── KONDISI 3: Pengguna sedang di Pengingat Waktu H (DUE_0M / SNOOZED / PENDING) ──
        taken_keywords = (
            "1", "1.", "1-sudah", "1. sudah", "1 sudah",
            "sudah", "sudah minum", "diminum", "udah", "ya sudah", "ok sudah",
            "done", "selesai", "yes", "ya", "sip", "ok", "oke", "siap",
            "alhamdulillah", "✅", "✅ ya, sudah", "ya, sudah"
        )
        if clean_text in taken_keywords or clean_text.startswith("sudah") or clean_text.startswith("udah") or clean_text.startswith("1 ") or clean_text.startswith("1."):
            return await self.handle_button_interaction(f"ACT_TAKEN:{target_log_id}")

        belum_keywords = (
            "2", "2.", "2-belum", "2. belum", "2 belum",
            "belum", "belum minum", "gak", "tidak", "belum lagi", "❌", "❌ belum", "nanti", "tunda"
        )
        if clean_text in belum_keywords or clean_text.startswith("belum") or clean_text.startswith("2 ") or clean_text.startswith("2."):
            return await self.handle_button_interaction(f"ACT_NOT_YET:{target_log_id}")

        # Pilihan tunda langsung
        if clean_text in ("15", "15m", "15 mnt", "tunda 15", "tunda 15 menit", "15 menit") or "15 menit" in clean_text:
            return await self.handle_button_interaction(f"ACT_SNOOZE_FIXED:{target_log_id}:15")
        if clean_text in ("30", "30m", "30 mnt", "tunda 30", "tunda 30 menit", "30 menit") or "30 menit" in clean_text:
            return await self.handle_button_interaction(f"ACT_SNOOZE_FIXED:{target_log_id}:30")

        # Pilihan lewati dosis
        skip_keywords = (
            "3", "3.", "3-lewati", "3. lewati", "3 lewati",
            "lewati", "skip", "lewati dosis", "batal", "lewat",
            "tidak minum", "❌ lewati", "🚫", "🚫 lewati dosis ini"
        )
        if clean_text in skip_keywords or clean_text.startswith("lewati") or clean_text.startswith("3 ") or clean_text.startswith("3."):
            return await self.handle_button_interaction(f"ACT_SKIP:{target_log_id}")

        # ── KONDISI 4: Pengguna Mengetik Waktu Tunda Bebas (Custom NLP Snooze) ──
        new_target_dt = parse_indonesian_snooze(clean_text, now_wib)
        if new_target_dt:
            minutes_snoozed = max(1, int((new_target_dt - now_wib).total_seconds() // 60))
            log["status"] = "SNOOZED"
            log["scheduled_at"] = new_target_dt.isoformat()
            log["scheduled_at_utc"] = new_target_dt.astimezone(timezone.utc).isoformat()
            log["snoozed_until"] = new_target_dt.isoformat()
            log["snooze_count"] = log.get("snooze_count", 0) + 1
            log["due_sent_at"] = None
            log["followup_sent_at"] = None
            log["caregiver_escalated_at"] = None
            log["last_prompt"] = "SNOOZED"
            log["updated_at"] = now_wib.isoformat()
            self._save_data()

            reply_msg = (
                f"⏱️ Baik *{patient.name}*, pengingat obat *{med_name}* telah ditunda selama *{minutes_snoozed} menit*.\n\n"
                f"Bot akan mengingatkan Anda kembali pada pukul *{new_target_dt.strftime('%H:%M')} WIB*. Tetap sehat ya! 🌿"
            )
            await meta_wa_service.send_text_message(patient.whatsapp_no, reply_msg)
            self.add_activity_log(
                event_type="CUSTOM_TEXT_SNOOZE",
                title=f"Snooze NLP Diproses untuk {patient.name}",
                details={"raw_text": text, "minutes": minutes_snoozed, "medication": med_name}
            )
            return {"success": True, "action": "CUSTOM_TEXT_SNOOZE", "new_scheduled_at": new_target_dt.isoformat()}

        # ── KONDISI 5: Teks Tidak Dikenali (Kirim Panduan Balas Cepat) ──
        guide_msg = (
            f"Halo *{patient.name}*,\n"
            f"Untuk merespons pengingat obat *{med_name}*, Anda cukup membalas:\n\n"
            f"1️⃣ Ketik *1* atau *SUDAH* (Jika sudah diminum)\n"
            f"2️⃣ Ketik *2* atau *BELUM* (Untuk opsi tunda)\n"
            f"3️⃣ Ketik *3* atau *LEWATI* (Jika dosis terlewat)\n"
        )
        await meta_wa_service.send_text_message(patient.whatsapp_no, guide_msg)
        return {"success": False, "reason": "Unrecognized reply, guide sent"}

    # ─── Dynamic Rescheduling Core Algorithm ──────────────────────────────────

    async def apply_dynamic_rescheduling(self, log_id: str, actual_taken_at: datetime) -> dict[str, Any]:
        """
        ALGORITMA DYNAMIC RESCHEDULING:
        Menghitung ulang waktu jadwal obat SELANJUTNYA:
          Waktu Aktual Minum + Interval Dosis Asli dari Dokter
        Mencegah interval yang terlalu dekat yang berisiko toksisitas/overdosis.
        """
        self._load_data()
        log = self._logs[log_id]
        patient = self.get_patient(log["patient_id"])
        medication = MedicationModel(**self._medications[log["medication_id"]])

        if actual_taken_at.tzinfo is None:
            actual_taken_at = actual_taken_at.replace(tzinfo=WIB_OFFSET)

        # 1. Update log saat ini
        log["status"] = "RESCHEDULED"
        log["actual_taken_at"] = actual_taken_at.isoformat()
        log["taken_at"] = actual_taken_at.isoformat()
        log["last_prompt"] = "RESCHEDULED"
        log["updated_at"] = actual_taken_at.isoformat()

        # Otomatis kurangi stok obat di inventaris
        med_dict = self._medications.get(medication.id)
        if med_dict:
            curr_stock = max(0, med_dict.get("stock_quantity", 30) - 1)
            med_dict["stock_quantity"] = curr_stock
            self._medications[medication.id] = med_dict
            daily_count = max(1, med_dict.get("daily_dose_count", 1))
            days_left = curr_stock // daily_count
            threshold = med_dict.get("refill_threshold_days", 3)
            if days_left <= threshold and curr_stock > 0:
                try:
                    asyncio.create_task(
                        meta_wa_service.send_refill_alert(
                            to_phone=patient.whatsapp_no,
                            patient_name=patient.name,
                            medication_name=medication.name,
                            remaining_stock=curr_stock,
                            days_left=days_left
                        )
                    )
                except Exception as ref_err:
                    logger.warning("[ReminderEngine] Error queueing refill alert: %s", ref_err)

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
        if original_next_dt.tzinfo is None:
            original_next_dt = original_next_dt.replace(tzinfo=WIB_OFFSET)

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
            self._logs[next_log.id]["scheduled_at_utc"] = new_next_dt.astimezone(timezone.utc).isoformat()
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

        # Jika caregiver sebelumnya pernah dieskalasi, kirimkan pemberitahuan bahwa pasien sudah minum obat
        if patient.caregiver_whatsapp and log.get("caregiver_escalated_at"):
            caregiver_msg = (
                f"✅ *Pemberitahuan Pasien Telah Minum Obat*\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"Halo *{patient.caregiver_name or 'Pendamping'}*,\n"
                f"Pasien *{patient.name}* baru saja mengonfirmasi bahwa beliau telah meminum obat "
                f"*{medication.name}* pada pukul {actual_str} WIB.\n\n"
                f"Terima kasih atas kepedulian Anda mendampingi kesehatan pasien! 🌿"
            )
            asyncio.create_task(meta_wa_service.send_text_message(patient.caregiver_whatsapp, caregiver_msg))

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
