"""
app/api/reminder_endpoints.py
PharmaShield — Medicine Reminder & Meta WhatsApp Webhook Endpoints.

Endpoints:
  - POST /api/reminders/patients         : Register patient with WhatsApp target
  - GET  /api/reminders/patients         : List patients
  - POST /api/reminders/medications      : Setup medication, dosage rule, interval, and generate schedules
  - GET  /api/reminders/medications      : List medications
  - GET  /api/reminders/logs             : View reminder schedule logs & statuses
  - POST /api/reminders/simulate-tick    : Trigger manual scheduler evaluation (testing/debugging)
  - GET  /api/webhook/meta-whatsapp      : Webhook verification challenge (hub.challenge)
  - POST /api/webhook/meta-whatsapp      : Webhook event receiver for interactive reply buttons
"""

from __future__ import annotations

import asyncio
import logging
import re
import httpx
from typing import Any, Optional
from fastapi import APIRouter, Request, HTTPException, Query, Response, UploadFile, File, Depends, Header
from pydantic import BaseModel, Field

from app.config import settings
from app.services.reminder_service import reminder_engine
from app.services.meta_wa_service import meta_wa_service
from app.services.wa_qr_service import wa_qr_service
from app.services.auth_service import decode_access_token, get_user_by_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reminders", tags=["Medicine Reminder Engine"])
webhook_router = APIRouter(prefix="/webhook", tags=["Meta WhatsApp Webhook"])


# ─── Auth Dependencies ────────────────────────────────────────────────────────

async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[dict[str, Any]]:
    """Extract user from Bearer token if provided."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return get_user_by_id(user_id)


async def get_current_user_required(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    """Require valid authenticated Bearer token or raise 401."""
    user = await get_current_user_optional(authorization)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Akses Ditolak: Anda harus masuk atau membuat akun terlebih dahulu untuk menyimpan jadwal obat."
        )
    return user


# ─── Pydantic Request Schemas ────────────────────────────────────────────────

class CreatePatientRequest(BaseModel):
    name: str = Field(..., example="Ibu Siti")
    whatsapp_no: Optional[str] = Field(None, example="6281234567890")
    qr_code_url: Optional[str] = None
    qr_contact_name: Optional[str] = None
    caregiver_name: Optional[str] = None
    caregiver_whatsapp: Optional[str] = None
    escalation_enabled: bool = True
    user_id: Optional[str] = None


class CreateMedicationRequest(BaseModel):
    patient_id: str
    name: str = Field(..., example="Amlodipine")
    dosage: str = Field(..., example="5 mg - 1 Tablet")
    instructions: Optional[str] = Field("Sesudah makan", example="Sesudah makan")
    duration_days: int = Field(7, ge=1, le=365)
    schedule_type: str = Field("FIXED_TIMES", example="FIXED_TIMES")  # FIXED_TIMES or INTERVAL
    interval_hours: int = Field(8, ge=1, le=24)
    target_times: Optional[list[str]] = Field(default_factory=lambda: ["08:00", "14:00", "20:00"])
    start_date: Optional[str] = None  # YYYY-MM-DD
    stock_quantity: int = Field(30, ge=1, le=1000)
    daily_dose_count: Optional[int] = Field(None, ge=1, le=24)
    refill_threshold_days: int = Field(3, ge=1, le=30)
    image_url: Optional[str] = None


class ManualSimulateActionRequest(BaseModel):
    button_id: str = Field(..., example="ACT_TAKEN:log_id")


class ManualSimulateTextRequest(BaseModel):
    phone: str = Field(..., example="6281234567890")
    text: str = Field(..., example="tunda 45 menit")


# ─── REST Endpoints ──────────────────────────────────────────────────────────

@router.post("/scan-qr-contact")
async def scan_qr_contact(file: UploadFile = File(...)):
    """
    Ekstrak tautan atau nomor kontak WhatsApp langsung dari upload gambar / screenshot Kode QR.
    Membebaskan lansia & caregiver dari input token teknis.
    """
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="File gambar kosong.")
        res = wa_qr_service.decode_qr_from_bytes(content)
        if not res.get("success"):
            return {
                "success": False,
                "error": res.get("error", "Gagal memindai Kode QR."),
            }
        return res
    except Exception as e:
        logger.error("[scan_qr_contact] Error decoding uploaded QR image: %s", e)
        raise HTTPException(status_code=500, detail=f"Gagal memproses gambar: {str(e)}")


@router.post("/patients")
async def create_patient(
    payload: CreatePatientRequest,
    user: dict[str, Any] = Depends(get_current_user_required),
):
    # SECURITY: user_id always from authenticated token, NEVER from request body
    patient = reminder_engine.create_patient(
        name=payload.name,
        whatsapp_no=payload.whatsapp_no or "",
        user_id=user["id"],
        qr_code_url=payload.qr_code_url,
        qr_contact_name=payload.qr_contact_name,
        caregiver_name=payload.caregiver_name,
        caregiver_whatsapp=payload.caregiver_whatsapp,
        escalation_enabled=payload.escalation_enabled,
    )
    return {"success": True, "patient": patient}


@router.get("/patients")
async def list_patients(
    user: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    # SECURITY: Only return patients belonging to authenticated user
    # Unauthenticated users see empty list — no cross-user data exposure
    uid = user["id"] if user else None
    patients = reminder_engine.list_patients(user_id=uid)
    return {"success": True, "patients": patients}


@router.post("/medications")
async def create_medication(
    payload: CreateMedicationRequest,
    user: dict[str, Any] = Depends(get_current_user_required),
):
    try:
        # SECURITY: Verify the patient belongs to the authenticated user
        _pat_check = reminder_engine.get_patient(payload.patient_id)
        if _pat_check and _pat_check.user_id and _pat_check.user_id != user["id"]:
            raise HTTPException(status_code=403, detail="Akses Ditolak: Pasien ini tidak terdaftar dalam akun Anda.")

        med, logs = reminder_engine.create_medication_and_schedules(
            patient_id=payload.patient_id,
            name=payload.name,
            dosage=payload.dosage,
            instructions=payload.instructions,
            duration_days=payload.duration_days,
            schedule_type=payload.schedule_type,
            interval_hours=payload.interval_hours,
            target_times=payload.target_times,
            start_date_str=payload.start_date,
            stock_quantity=payload.stock_quantity,
            daily_dose_count=payload.daily_dose_count,
            refill_threshold_days=payload.refill_threshold_days,
            image_url=payload.image_url,
        )
        patient = reminder_engine.get_patient(payload.patient_id)
        wa_link = None
        if patient and patient.whatsapp_no:
            import urllib.parse
            times_str = ", ".join(payload.target_times or ["08:00"])
            inst_note = f"\n📝 *Aturan Minum:* {payload.instructions}" if payload.instructions else ""
            msg_text = (
                f"👋 *Halo {patient.name}, Selamat Datang di PharmaShield!*\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"Data pengingat obat Anda telah berhasil didaftarkan:\n\n"
                f"💊 *Nama Obat:* {payload.name}\n"
                f"⚖️ *Dosis:* {payload.dosage}{inst_note}\n"
                f"⏰ *Jadwal Minum:* {times_str} WIB\n\n"
                f"Pengingat otomatis akan dikirim ke WhatsApp ini:\n"
                f"1️⃣ Pengingat persiapan 10 menit sebelum jam minum obat.\n"
                f"2️⃣ Pengingat saat tiba waktunya minum obat.\n\n"
                f"Semoga lekas sembuh dan sehat selalu ya! 🌿\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"_Layanan Pengingat Pasien PharmaShield_"
            )
            wa_link = f"https://wa.me/{patient.whatsapp_no}?text={urllib.parse.quote(msg_text)}"

        return {
            "success": True,
            "medication": med,
            "generated_logs_count": len(logs),
            "logs": logs[:10],
            "wa_link": wa_link,
            "patient_name": patient.name if patient else "",
            "patient_phone": patient.whatsapp_no if patient else ""
        }
    except HTTPException:
        raise
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))


@router.get("/medications")
async def list_medications(
    patient_id: Optional[str] = Query(None),
    user: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    # SECURITY: Verify patient ownership before returning medications
    if patient_id and user:
        _pat = reminder_engine.get_patient(patient_id)
        if _pat and _pat.user_id and _pat.user_id != user["id"]:
            return {"success": True, "medications": []}  # Empty — no cross-user data leak
    meds = reminder_engine.list_medications(patient_id=patient_id)
    return {"success": True, "medications": meds}


@router.get("/logs")
async def list_logs(
    patient_id: Optional[str] = Query(None),
    medication_id: Optional[str] = Query(None),
    user: Optional[dict[str, Any]] = Depends(get_current_user_optional),
):
    # SECURITY: Verify patient ownership before returning logs
    if patient_id and user:
        _pat = reminder_engine.get_patient(patient_id)
        if _pat and _pat.user_id and _pat.user_id != user["id"]:
            return {"success": True, "logs": [], "total": 0}  # Empty — no cross-user data leak
    logs = reminder_engine.list_logs(patient_id=patient_id, medication_id=medication_id)
    return {"success": True, "logs": logs, "total": len(logs)}


@router.delete("/patients/{patient_id}")
async def delete_patient(
    patient_id: str,
    user: dict[str, Any] = Depends(get_current_user_required),
):
    # SECURITY: Verify ownership before deletion
    _pat = reminder_engine.get_patient(patient_id)
    if _pat and _pat.user_id and _pat.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Akses Ditolak: Anda tidak memiliki izin menghapus data pasien ini.")
    success = reminder_engine.delete_patient(patient_id)
    if not success:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"success": True, "message": "Patient deleted"}


@router.delete("/medications/{medication_id}")
async def delete_medication(
    medication_id: str,
    user: dict[str, Any] = Depends(get_current_user_required),
):
    # SECURITY: Verify ownership via patient association
    all_meds = reminder_engine.list_medications()
    _target = next((m for m in all_meds if m.get("id") == medication_id), None)
    if _target:
        _pat = reminder_engine.get_patient(_target.get("patient_id", ""))
        if _pat and _pat.user_id and _pat.user_id != user["id"]:
            raise HTTPException(status_code=403, detail="Akses Ditolak: Anda tidak memiliki izin menghapus data obat ini.")
    success = reminder_engine.delete_medication(medication_id)
    if not success:
        raise HTTPException(status_code=404, detail="Medication not found")
    return {"success": True, "message": "Medication deleted"}


@router.delete("/logs/{log_id}")
async def delete_log(log_id: str):
    success = reminder_engine.delete_log(log_id)
    if not success:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"success": True, "message": "Log deleted"}


@router.delete("/clear-all")
async def clear_all_reminders_data():
    reminder_engine.clear_all_data()
    return {"success": True, "message": "All reminder data cleared. Clean slate restored."}


@router.get("/activity-logs")
async def list_activity_logs(limit: int = Query(50, ge=1, le=100)):
    """Fetch live webhook and reminder activity logs for real-time jury demonstration."""
    logs = reminder_engine.list_activity_logs(limit=limit)
    return {"success": True, "activities": logs, "total": len(logs)}


class WelcomeTestRequest(BaseModel):
    phone: str
    patient_name: str
    medication_name: str
    dosage: str
    times: str
    instructions: Optional[str] = "Sesudah makan"


@router.post("/send-welcome")
async def send_welcome_test(payload: WelcomeTestRequest):
    """Directly test welcome notification dispatch via Meta/Gateway."""
    res = await meta_wa_service.send_welcome_message(
        to_phone=payload.phone,
        patient_name=payload.patient_name,
        medication_name=payload.medication_name,
        dosage=payload.dosage,
        schedule_time_str=payload.times,
        instructions=payload.instructions
    )
    reminder_engine.add_activity_log(
        event_type="WELCOME_SENT",
        title=f"Welcome WhatsApp Sent to {payload.patient_name}",
        details={"phone": payload.phone, "medication": payload.medication_name, "res": res}
    )
    return {"success": res.get("success", False), "response": res}


@router.post("/simulate-tick")
async def simulate_scheduler_tick():
    """Manual scheduler evaluation endpoint for local testing and debugging."""
    counts = await reminder_engine.evaluate_and_dispatch_reminders()
    return {"success": True, "processed": counts}


@router.post("/simulate-interaction")
async def simulate_button_interaction(payload: ManualSimulateActionRequest):
    """Simulate receiving a button click from patient WhatsApp."""
    result = await reminder_engine.handle_button_interaction(payload.button_id)
    return {"success": True, "result": result}


@router.post("/simulate-text")
async def simulate_text_interaction(payload: ManualSimulateTextRequest):
    """Simulate receiving a natural language custom snooze text message from patient WhatsApp."""
    result = await reminder_engine.handle_text_interaction(payload.phone, payload.text)
    return {"success": True, "result": result}



@router.post("/trigger-due/{log_id}")
async def trigger_due_for_log(log_id: str):
    """Force-trigger H-0 Interactive Notification [Ya, Sudah Minum] / [Belum] to patient WhatsApp."""
    res = await reminder_engine.trigger_immediate_due_for_log(log_id)
    return res


@router.post("/trigger-stage/{log_id}")
async def trigger_stage_for_log(log_id: str, stage: str = Query("STAGE_3_DUE_0M")):
    """
    Force-trigger specific notification stage:
      - STAGE_1_CONFIRM : Konfirmasi jadwal awal
      - STAGE_2_PRE_10M : Pengingat H-10 Menit persiapan
      - STAGE_3_DUE_0M  : Pengingat interaktif Waktu H [Ya, Sudah Minum] & [Belum]
    """
    res = await reminder_engine.trigger_stage_for_log(log_id=log_id, stage=stage)
    return res


@router.post("/test-send")
async def test_send_whatsapp(phone: str = Query(...), text: Optional[str] = Query("Halo dari PharmaShield Reminder Engine! Tes notifikasi WhatsApp berhasil terkirim.")):
    """Directly test WhatsApp message delivery to a phone number."""
    res = await meta_wa_service.send_text_message(to_phone=phone, text=text)
    return {
        "success": res.get("success", False),
        "gateway_status": {
            "meta_configured": meta_wa_service.is_configured(),
            "fonnte_configured": bool(settings.fonnte_token and settings.fonnte_token != "YOUR_FONNTE_TOKEN_HERE"),
            "provider_used": res.get("provider", "unknown")
        },
        "response": res
    }


@router.get("/gateway-status")
async def get_gateway_status():
    """Return status of Meta and Fonnte delivery gateways with live connection check."""
    fonnte_token = settings.fonnte_token.strip()
    fonnte_info = {
        "configured": bool(fonnte_token and fonnte_token != "YOUR_FONNTE_TOKEN_HERE"),
        "status": "not_configured",
        "device_phone": None,
        "device_status": "unknown",
        "quota": None,
    }

    if fonnte_info["configured"]:
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                dev_resp = await client.post(
                    "https://api.fonnte.com/get-devices",
                    headers={"Authorization": fonnte_token}
                )
                dev_data = dev_resp.json()
                if dev_data.get("status") and dev_data.get("data"):
                    dev = dev_data["data"][0]
                    fonnte_info["device_phone"] = dev.get("device")
                    fonnte_info["device_status"] = dev.get("status")  # "connect" or "disconnect"
                    fonnte_info["quota"] = dev.get("quota")
                    fonnte_info["status"] = "connected" if dev.get("status") == "connect" else "disconnected"
                else:
                    # Test device token directly
                    dev_check = await client.post(
                        "https://api.fonnte.com/device",
                        headers={"Authorization": fonnte_token}
                    )
                    chk_data = dev_check.json()
                    fonnte_info["device_status"] = chk_data.get("device_status", "unknown")
                    fonnte_info["device_phone"] = chk_data.get("device")
                    fonnte_info["status"] = "connected" if chk_data.get("device_status") == "connect" else "disconnected"
        except Exception as e:
            logger.warning("[get_gateway_status] Could not query Fonnte live status: %s", e)

    return {
        "meta_cloud_api": {
            "configured": meta_wa_service.is_configured(),
            "phone_number_id": meta_wa_service.phone_number_id[:4] + "***" if meta_wa_service.phone_number_id else "Belum Diset",
        },
        "fonnte_gateway": fonnte_info
    }


class UpdateGatewayRequest(BaseModel):
    meta_phone_number_id: Optional[str] = None
    meta_access_token: Optional[str] = None
    fonnte_token: Optional[str] = None


@router.post("/update-gateway")
async def update_gateway_credentials(payload: UpdateGatewayRequest):
    """Dynamically update Meta WhatsApp Cloud API credentials or Fonnte token without restarting server."""
    if payload.meta_phone_number_id is not None:
        settings.meta_wa_phone_number_id = payload.meta_phone_number_id.strip()
        meta_wa_service.phone_number_id = payload.meta_phone_number_id.strip()
    if payload.meta_access_token is not None:
        settings.meta_wa_access_token = payload.meta_access_token.strip()
        meta_wa_service.access_token = payload.meta_access_token.strip()
    if payload.fonnte_token is not None:
        settings.fonnte_token = payload.fonnte_token.strip()

    # Also persist to backend/.env
    env_file = settings.base_dir / ".env"
    if env_file.exists():
        try:
            content = env_file.read_text(encoding="utf-8")
            if payload.meta_phone_number_id:
                if "META_WA_PHONE_NUMBER_ID=" in content:
                    content = re.sub(r"META_WA_PHONE_NUMBER_ID=.*", f"META_WA_PHONE_NUMBER_ID={payload.meta_phone_number_id.strip()}", content)
                else:
                    content += f"\nMETA_WA_PHONE_NUMBER_ID={payload.meta_phone_number_id.strip()}\n"
            if payload.meta_access_token:
                if "META_WA_ACCESS_TOKEN=" in content:
                    content = re.sub(r"META_WA_ACCESS_TOKEN=.*", f"META_WA_ACCESS_TOKEN={payload.meta_access_token.strip()}", content)
                else:
                    content += f"\nMETA_WA_ACCESS_TOKEN={payload.meta_access_token.strip()}\n"
            if payload.fonnte_token:
                if "FONNTE_TOKEN=" in content:
                    content = re.sub(r"FONNTE_TOKEN=.*", f"FONNTE_TOKEN={payload.fonnte_token.strip()}", content)
                else:
                    content += f"\nFONNTE_TOKEN={payload.fonnte_token.strip()}\n"
            env_file.write_text(content, encoding="utf-8")
        except Exception as e:
            logger.warning("Could not persist to .env: %s", e)

    return {
        "success": True,
        "message": "Kredensial WhatsApp Gateway berhasil diperbarui!",
        "status": {
            "meta_configured": meta_wa_service.is_configured(),
            "fonnte_configured": bool(settings.fonnte_token and settings.fonnte_token != "YOUR_FONNTE_TOKEN_HERE")
        }
    }


# ─── Meta WhatsApp Cloud API Webhook Endpoints ───────────────────────────────

@webhook_router.get("/meta-whatsapp")
async def meta_webhook_verification(
    hub_mode: Optional[str] = Query(None, alias="hub.mode"),
    hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token")
):
    """
    Meta Webhook Verification Challenge endpoint.
    Meta sends GET request with hub.verify_token and expects hub.challenge returned.
    """
    configured_token = settings.meta_wa_verify_token.strip()
    if hub_mode == "subscribe" and hub_verify_token == configured_token:
        logger.info("[MetaWebhook] Verification successful.")
        return Response(content=hub_challenge or "", media_type="text/plain")

    logger.warning("[MetaWebhook] Verification failed. Token mismatch: %s vs %s", hub_verify_token, configured_token)
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@webhook_router.post("/meta-whatsapp")
async def meta_webhook_receiver(request: Request):
    """
    Meta Webhook Event Receiver for WhatsApp incoming messages & interactive reply buttons.
    Always returns HTTP 200 OK fast to acknowledge Meta API.
    """
    raw_body = await request.body()
    sig_header = request.headers.get("X-Hub-Signature-256")

    # Verify signature
    if not meta_wa_service.verify_webhook_signature(raw_body, sig_header):
        logger.warning("[MetaWebhook] Signature validation failed.")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = await request.json()
        logger.debug("[MetaWebhook] Received event: %s", body)

        # Parse WhatsApp entries
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                val = change.get("value", {})
                messages = val.get("messages", [])

                for msg in messages:
                    # Check for interactive button reply
                    if msg.get("type") == "interactive":
                        interactive = msg.get("interactive", {})
                        button_reply = interactive.get("button_reply", {})
                        button_id = button_reply.get("id")

                        if button_id:
                            logger.info("[MetaWebhook] Button reply clicked: %s", button_id)
                            reminder_engine.add_activity_log(
                                event_type="META_WEBHOOK_CLICK",
                                title=f"Meta WhatsApp Button Click: {button_id.split(':')[0]}",
                                details={"button_id": button_id, "from": msg.get("from")}
                            )
                            # Fire-and-forget: process in background, return 200 instantly
                            asyncio.create_task(reminder_engine.handle_button_interaction(button_id))

                    # Check for incoming free text (Custom Snooze NLP parser)
                    elif msg.get("type") == "text":
                        body_text = msg.get("text", {}).get("body", "")
                        from_phone = msg.get("from", "")
                        if body_text and from_phone:
                            logger.info("[MetaWebhook] Inbound text received from %s: %s", from_phone, body_text)
                            reminder_engine.add_activity_log(
                                event_type="META_INBOUND_TEXT",
                                title=f"WhatsApp Inbound Text from {from_phone}",
                                details={"from": from_phone, "text": body_text}
                            )
                            # Fire-and-forget: process in background, return 200 instantly
                            asyncio.create_task(reminder_engine.handle_text_interaction(from_phone, body_text))

    except Exception as exc:
        logger.error("[MetaWebhook] Error processing webhook event: %s", exc)

    # Always return 200 OK so Meta doesn't retry endlessly
    return {"status": "EVENT_RECEIVED"}


@webhook_router.post("/fonnte")
@webhook_router.post("/whatsapp")
async def fonnte_webhook_receiver(request: Request):
    """
    Inbound webhook receiver for Fonnte WhatsApp messages.
    Receives incoming chats from users/patients (e.g., '1', 'sudah minum', 'tunda 30 menit').
    """
    try:
        sender = None
        message = None

        # 1. Try parsing JSON body first
        try:
            data = await request.json()
            if isinstance(data, dict):
                sender = data.get("sender") or data.get("from")
                message = data.get("message") or data.get("text")
        except Exception:
            pass

        # 2. If not found, try Form data
        if not sender or not message:
            try:
                form = await request.form()
                sender = sender or form.get("sender") or form.get("from")
                message = message or form.get("message") or form.get("text")
            except Exception:
                pass

        if sender and message:
            clean_s = meta_wa_service.clean_recipient(str(sender))
            bot_num = meta_wa_service.clean_recipient(getattr(settings, "fonnte_sender_number", "") or "")
            if bot_num and clean_s == bot_num:
                logger.debug("[FonnteWebhook] Ignored outgoing echo from bot device: %s", clean_s)
                return {"status": True, "ignored": "bot_echo"}

            clean_msg = str(message).strip()
            logger.info("[FonnteWebhook] Inbound WhatsApp from %s: %s", clean_s, clean_msg)
            reminder_engine.add_activity_log(
                event_type="FONNTE_INBOUND_MSG",
                title=f"WhatsApp Inbound dari {clean_s}: {clean_msg}",
                details={"sender": clean_s, "message": clean_msg}
            )

            async def _safe_handle_inbound():
                try:
                    res = await reminder_engine.handle_text_interaction(clean_s, clean_msg)
                    logger.info("[FonnteWebhook] Interaction result for %s: %s", clean_s, res)
                except Exception as err:
                    logger.error("[FonnteWebhook] Error handling interaction for %s: %s", clean_s, err, exc_info=True)

            # Fire-and-forget: return 200 instantly so Fonnte never retries due to timeout
            asyncio.create_task(_safe_handle_inbound())
        else:
            logger.warning("[FonnteWebhook] Received empty sender/message in payload")
    except Exception as exc:
        logger.error("[FonnteWebhook] Error handling webhook: %s", exc)

    return {"status": True}


@webhook_router.get("/fonnte")
async def fonnte_webhook_test():
    """Health check for Fonnte webhook configuration."""
    return {"status": True, "service": "PharmaShield Fonnte Webhook Active"}

