"""
app/services/wa_service.py
PharmaShield — Automated WhatsApp alert via Fonnte API.

Sends formatted Indonesian notification immediately after scan.
Includes:
  - Medicine Name
  - Expiry Date
  - Safety Status Emoji (🟢/🟡/🔴)
  - Usage Recommendation & Shelf Life Note
  - Scan Timestamp
"""

from __future__ import annotations

import logging
from typing import Any

import requests

from app.config import settings

logger = logging.getLogger(__name__)

_FONNTE_ENDPOINT = "https://api.fonnte.com/send"
_TIMEOUT_SECONDS = 10


def format_whatsapp_message(
    *,
    medicine_name: str | None,
    expiry_date: str | None,
    status: str,
    status_id: str,
    status_emoji: str,
    days_remaining: int,
    shelf_life_note: str,
    recommendation: str,
    scan_time: str,
) -> str:
    """Format structured WhatsApp notification body."""
    med_display = medicine_name if medicine_name else "Tidak teridentifikasi (Kemasan Buram/Rusak)"
    exp_display = expiry_date if expiry_date else "Tidak terdeteksi pada label"

    if status == "green":
        time_text = f"✅ Sisa {days_remaining} hari (Aman)"
    elif status == "yellow":
        time_text = f"⚠️ Sisa {days_remaining} hari (Segera habiskan)"
    else:
        if days_remaining < 0:
            time_text = f"❌ Kedaluwarsa sejak {abs(days_remaining)} hari lalu"
        elif days_remaining == 0 and expiry_date:
            time_text = "❌ Kedaluwarsa hari ini"
        else:
            time_text = "❌ Berbahaya / Data Kritis Tidak Terbaca"

    lines = [
        "🛡️ *PharmaShield — Laporan Keamanan Obat*",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"💊 *Nama Obat:* {med_display}",
        f"📅 *Kedaluwarsa:* {exp_display}",
        f"{status_emoji} *Status Keamanan:* *{status_id}*",
        f"⏱️ *Sisa Waktu:* {time_text}",
        "",
        "💡 *Rekomendasi Penggunaan:*",
        f"{recommendation}",
        "",
        "📝 *Keterangan:*",
        f"{shelf_life_note}",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"🕐 *Waktu Pemindaian:* {scan_time}",
        "",
        "_Pesan otomatis oleh PharmaShield AI Safety Guard_",
    ]
    return "\n".join(lines)


def send_whatsapp_alert(
    *,
    medicine_name: str | None,
    expiry_date: str | None,
    status: str,
    status_id: str,
    status_emoji: str,
    days_remaining: int,
    shelf_life_note: str,
    recommendation: str,
    scan_time: str,
) -> dict[str, Any]:
    """
    Dispatch WhatsApp notification using Fonnte API.
    Fails gracefully if credentials are not configured or network issues occur.
    """
    token = settings.fonnte_token.strip()
    target = settings.wa_target_number.strip()

    # Graceful check for unconfigured or placeholder token
    if not token or token == "YOUR_FONNTE_TOKEN_HERE" or not target:
        logger.info(
            "[WA] FONNTE_TOKEN or WA_TARGET_NUMBER not configured. Skipping WhatsApp dispatch."
        )
        return {
            "success": False,
            "message": "Fonnte credentials not configured (token/target missing).",
        }

    body = format_whatsapp_message(
        medicine_name=medicine_name,
        expiry_date=expiry_date,
        status=status,
        status_id=status_id,
        status_emoji=status_emoji,
        days_remaining=days_remaining,
        shelf_life_note=shelf_life_note,
        recommendation=recommendation,
        scan_time=scan_time,
    )

    payload = {
        "target": target,
        "message": body,
        "countryCode": "62",
    }
    headers = {"Authorization": token}

    try:
        response = requests.post(
            _FONNTE_ENDPOINT,
            data=payload,
            headers=headers,
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        resp_json = response.json()
        logger.info("[WA] Notification dispatched successfully: %s", resp_json)
        return {"success": True, "message": str(resp_json)}
    except requests.exceptions.Timeout:
        logger.warning("[WA] Fonnte request timed out after %ds", _TIMEOUT_SECONDS)
        return {"success": False, "message": "Fonnte API timeout"}
    except requests.exceptions.HTTPError as exc:
        logger.warning("[WA] Fonnte HTTP error: %s", exc)
        return {"success": False, "message": f"HTTP {exc.response.status_code}: {exc.response.text}"}
    except Exception as exc:
        logger.warning("[WA] Failed to dispatch alert: %s", exc)
        return {"success": False, "message": str(exc)}
