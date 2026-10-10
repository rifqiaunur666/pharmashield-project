"""
services/wa_service.py
Re-exports from app.services.wa_service for backward compatibility.
"""
from app.services.wa_service import (
    format_whatsapp_message,
    send_whatsapp_alert,
)

__all__ = ["format_whatsapp_message", "send_whatsapp_alert"]
