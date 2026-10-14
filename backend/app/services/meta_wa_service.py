"""
app/services/meta_wa_service.py
PharmaShield — Meta WhatsApp Cloud API Service.

Official Graph API client for:
  - 15m Pre-reminder (Text message / Template)
  - H-0 Reminder (Interactive Reply Buttons: [Sudah] / [Belum])
  - Follow-up Delay Reminder (Interactive Reply Buttons: [Ya, Sudah] / [Belum Lagi])
  - Plain Text Notifications (Rescheduled / Completed info)
"""

from __future__ import annotations

import hmac
import hashlib
import logging
from typing import Any, Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class MetaWhatsAppService:
    def __init__(self):
        self.phone_number_id = settings.meta_wa_phone_number_id.strip()
        self.access_token = settings.meta_wa_access_token.strip()
        self.version = settings.meta_wa_api_version.strip() or "v19.0"
        self.app_secret = settings.meta_wa_app_secret.strip()
        self.verify_token = settings.meta_wa_verify_token.strip()

    @property
    def endpoint(self) -> str:
        phone_id = self.phone_number_id or "100000000000000"
        return f"https://graph.facebook.com/{self.version}/{phone_id}/messages"

    def is_configured(self) -> bool:
        return bool(self.phone_number_id and self.access_token and self.access_token != "YOUR_META_ACCESS_TOKEN")

    def verify_webhook_signature(self, raw_body: bytes, signature_header: Optional[str]) -> bool:
        """
        Verify Meta's X-Hub-Signature-256 header.
        If app_secret is not set (e.g. in development), return True to permit testing.
        """
        if not self.app_secret:
            return True
        if not signature_header or not signature_header.startswith("sha256="):
            return False

        expected_hash = signature_header.split("sha256=", 1)[1]
        calculated_hash = hmac.new(
            key=self.app_secret.encode("utf-8"),
            msg=raw_body,
            digestmod=hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected_hash, calculated_hash)

    def clean_recipient(self, phone: str) -> str:
        """Clean phone string to international format (e.g., 6281234567890)."""
        clean = "".join(ch for ch in phone if ch.isdigit())
        if clean.startswith("0"):
            clean = "62" + clean[1:]
        return clean

    async def _send_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Dispatch HTTP POST to Meta WhatsApp Graph API with seamless Fonnte fallback for real device delivery."""
        recipient = payload.get("to", "")
        import urllib.parse

        # Extract text body for fallback & wa_link
        text_content = ""
        if payload.get("type") == "text":
            text_content = payload.get("text", {}).get("body", "")
        elif payload.get("type") == "interactive":
            interactive = payload.get("interactive", {})
            header_text = interactive.get("header", {}).get("text", "")
            body_text = interactive.get("body", {}).get("text", "")
            footer_text = interactive.get("footer", {}).get("text", "")
            buttons = interactive.get("action", {}).get("buttons", [])
            btn_options = "\n".join([f"👉 {b.get('reply', {}).get('title')}" for b in buttons])
            text_content = f"*{header_text}*\n\n{body_text}\n\n*PILIHAN:*\n{btn_options}\n\n_{footer_text}_"

        wa_link = f"https://wa.me/{recipient}?text={urllib.parse.quote(text_content)}" if recipient and text_content else ""

        # If Meta credentials configured, send via Meta Graph API
        if self.is_configured():
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(self.endpoint, json=payload, headers=headers)
                    data = resp.json()

                    if resp.status_code in (200, 201):
                        logger.info("[MetaWA] Message sent successfully to %s: %s", recipient, data)
                        return {"success": True, "provider": "meta", "wa_link": wa_link, **data}
                    else:
                        logger.error("[MetaWA] Failed to send message. HTTP %d: %s", resp.status_code, data)
                        return {"success": False, "error": data, "http_status": resp.status_code, "wa_link": wa_link}
            except Exception as exc:
                logger.error("[MetaWA] Network error calling Meta API: %s", exc)
                return {"success": False, "error": str(exc), "wa_link": wa_link}

        # FALLBACK: When Meta tokens are waiting to be configured by user, check Fonnte token
        fonnte_token = settings.fonnte_token.strip()
        if fonnte_token and fonnte_token != "YOUR_FONNTE_TOKEN_HERE":
            try:
                if text_content and recipient:
                    effective_token = fonnte_token
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        # Test if token is an account token or if device token needs resolving
                        fonnte_resp = await client.post(
                            "https://api.fonnte.com/send",
                            data={
                                "target": recipient,
                                "message": text_content,
                                "countryCode": "62",
                            },
                            headers={"Authorization": effective_token}
                        )
                        raw_data = fonnte_resp.json() if "application/json" in fonnte_resp.headers.get("content-type", "") else {"detail": fonnte_resp.text}

                        # If token was an Account Token (invalid on send endpoint), auto-resolve to Device Token!
                        if raw_data.get("reason") in ("invalid token", "token invalid") or len(effective_token) > 30:
                            try:
                                dev_resp = await client.post(
                                    "https://api.fonnte.com/get-devices",
                                    headers={"Authorization": fonnte_token}
                                )
                                dev_data = dev_resp.json()
                                if dev_data.get("status") and dev_data.get("data"):
                                    device_info = dev_data["data"][0]
                                    device_token = device_info.get("token")
                                    device_status = device_info.get("status")
                                    if device_token:
                                        effective_token = device_token
                                        # Retry send with resolved device token
                                        fonnte_resp = await client.post(
                                            "https://api.fonnte.com/send",
                                            data={
                                                "target": recipient,
                                                "message": text_content,
                                                "countryCode": "62",
                                            },
                                            headers={"Authorization": effective_token}
                                        )
                                        raw_data = fonnte_resp.json() if "application/json" in fonnte_resp.headers.get("content-type", "") else {"detail": fonnte_resp.text}
                                        raw_data["device_status"] = device_status
                                        raw_data["device_phone"] = device_info.get("device")
                            except Exception as res_err:
                                logger.warning("[MetaWA->FonnteFallback] Could not auto-resolve device token: %s", res_err)

                        fonnte_status = bool(fonnte_resp.status_code == 200 and raw_data.get("status") is not False)
                        logger.info("[MetaWA->FonnteFallback] Live WhatsApp message response for %s: %s", recipient, raw_data)
                        return {
                            "success": fonnte_status,
                            "provider": "fonnte_fallback",
                            "wa_link": wa_link,
                            "response": raw_data
                        }
            except Exception as f_err:
                logger.warning("[MetaWA->FonnteFallback] Failed sending via fallback: %s", f_err)

        # Simulation mode log
        logger.info(
            "[MetaWA] Simulation mode. Payload queued for %s",
            recipient
        )
        return {
            "success": True,
            "simulated": True,
            "provider": "simulation",
            "wa_link": wa_link,
            "messages": [{"id": f"sim_wamid_{hash(str(payload))}"}]
        }

    async def send_text_message(self, to_phone: str, text: str) -> dict[str, Any]:
        """Send standard WhatsApp text message."""
        recipient = self.clean_recipient(to_phone)
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": text
            }
        }
        return await self._send_payload(payload)

    async def send_welcome_message(
        self,
        to_phone: str,
        patient_name: str,
        medication_name: str,
        dosage: str,
        schedule_time_str: str,
        instructions: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Send Instant Welcome & Confirmation Notification upon medication registration.
        """
        inst_note = f"\n📝 *Aturan Minum:* {instructions}" if instructions else ""
        text = (
            f"👋 *Halo {patient_name}, Selamat Datang di MedikaGuard!*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Data pengingat obat Anda telah berhasil didaftarkan:\n\n"
            f"💊 *Nama Obat:* {medication_name}\n"
            f"⚖️ *Dosis:* {dosage}{inst_note}\n"
            f"⏰ *Jadwal Minum:* {schedule_time_str} WIB\n\n"
            f"Pengingat otomatis akan dikirim ke WhatsApp ini:\n"
            f"1️⃣ Pengingat persiapan 10 menit sebelum jam minum obat.\n"
            f"2️⃣ Pengingat saat tiba waktunya minum obat.\n\n"
            f"Semoga lekas sembuh dan sehat selalu ya! 🌿\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Layanan Pengingat Pasien MedikaGuard_"
        )
        return await self.send_text_message(to_phone, text)

    async def send_pre_reminder_10m(
        self,
        to_phone: str,
        patient_name: str,
        medication_name: str,
        dosage: str,
        scheduled_time_str: str,
        instructions: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Send H-10 Minutes Preparation Reminder directly to patient's WhatsApp.
        """
        inst_text = f"\n📝 *Aturan:* {instructions}" if instructions else ""
        text = (
            f"⏰ *Pengingat Minum Obat (10 Menit Lagi)*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Halo *{patient_name}*,\n"
            f"10 menit lagi ({scheduled_time_str} WIB) adalah jadwal minum obat:\n\n"
            f"💊 *{medication_name}*\n"
            f"⚖️ *Dosis:* {dosage}{inst_text}\n\n"
            f"Mohon siapkan obat dan air minum Anda sekarang ya. "
            f"Pesan pengingat akan dikirim saat jam minum obat tiba.\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"_Layanan Pengingat Pasien MedikaGuard_"
        )
        return await self.send_text_message(to_phone, text)

    async def send_pre_reminder_15m(self, *args, **kwargs):
        """Backward-compatible alias for pre-reminder."""
        return await self.send_pre_reminder_10m(*args, **kwargs)

    async def send_due_reminder_buttons(
        self,
        to_phone: str,
        log_id: str,
        patient_name: str,
        medication_name: str,
        dosage: str,
        instructions: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Stage 3: Send H-0 On-Time Interactive Message with [Ya, Sudah Minum] & [Belum] reply buttons.
        """
        recipient = self.clean_recipient(to_phone)
        body_text = (
            f"Halo *{patient_name}*, tepat saatnya minum obat *{medication_name}* ({dosage})."
        )
        if instructions:
            body_text += f"\n📝 Aturan: {instructions}"
        body_text += "\n\nApakah obat sudah diminum sekarang?"

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "header": {
                    "type": "text",
                    "text": "Waktunya Minum Obat 💊"
                },
                "body": {
                    "text": body_text
                },
                "footer": {
                    "text": "Pilih respon di bawah ini:"
                },
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"BTN_ONTIME_TAKEN:{log_id}",
                                "title": "Ya, Sudah Minum"
                            }
                        },
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"BTN_ONTIME_NOT:{log_id}",
                                "title": "Belum"
                            }
                        }
                    ]
                }
            }
        }
        return await self._send_payload(payload)

    async def send_delay_followup_buttons(
        self,
        to_phone: str,
        log_id: str,
        patient_name: str,
        medication_name: str,
        dosage: str,
        scheduled_time_str: str
    ) -> dict[str, Any]:
        """
        Send Follow-up Delayed Interactive Message with [Ya, Sudah] & [Belum Lagi] buttons.
        """
        recipient = self.clean_recipient(to_phone)
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "header": {
                    "type": "text",
                    "text": "Peringatan Keterlambatan ⚠️"
                },
                "body": {
                    "text": (
                        f"Halo *{patient_name}*, Anda terlambat minum obat *{medication_name}* ({dosage}) "
                        f"dari jadwal seharusnya ({scheduled_time_str} WIB).\n\n"
                        f"Apakah sekarang Anda sudah minum obat tersebut?"
                    )
                },
                "footer": {
                    "text": "Jadwal berikutnya akan disesuaikan otomatis"
                },
                "action": {
                    "buttons": [
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"BTN_LATE_TAKEN:{log_id}",
                                "title": "Ya, Sudah"
                            }
                        },
                        {
                            "type": "reply",
                            "reply": {
                                "id": f"BTN_LATE_NOT:{log_id}",
                                "title": "Belum Lagi"
                            }
                        }
                    ]
                }
            }
        }
        return await self._send_payload(payload)


meta_wa_service = MetaWhatsAppService()
