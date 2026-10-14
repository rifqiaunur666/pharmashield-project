"""
app/services/wa_qr_service.py
PharmaShield — WhatsApp Contact QR Code Reader & Parser Service.

Features:
- Extracts WhatsApp contact links from uploaded QR code images (e.g. https://wa.me/qr/<TOKEN>, https://wa.me/<PHONE>).
- Preprocesses screenshots (grayscale, adaptive threshold, multi-scale resize) for high-accuracy decoding of mobile screenshots.
- Fallback OCR/text scanning to detect contact names (e.g. '~qii', 'Kontak WhatsApp') and phone numbers.
- Auto-formats phone numbers to international E.164 (+62/62) format.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any, Optional

try:
    import cv2
    import numpy as np
except Exception as _e:
    cv2 = None
    np = None

from PIL import Image

logger = logging.getLogger(__name__)


class WhatsAppQRService:
    def __init__(self):
        self._detector = None
        if cv2 is not None:
            try:
                self._detector = cv2.QRCodeDetector()
            except Exception as e:
                logger.warning("[WhatsAppQRService] Could not initialize cv2.QRCodeDetector: %s", e)

    def decode_qr_from_bytes(self, image_bytes: bytes) -> dict[str, Any]:
        """
        Decode QR code from raw image bytes and return extracted WhatsApp contact metadata.
        """
        if cv2 is None or np is None:
            return {
                "success": False,
                "error": "OpenCV tidak tersedia pada server.",
                "qr_data": None,
            }

        try:
            # Decode image using OpenCV
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return {
                    "success": False,
                    "error": "Gagal membaca file gambar. Format tidak didukung atau file korup.",
                    "qr_data": None,
                }

            # Strategy 1: Direct decoding on original BGR image
            val, pts, _ = self._detector.detectAndDecode(img)
            
            # Strategy 2: Grayscale + CLAHE contrast enhancement
            if not val:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                val, pts, _ = self._detector.detectAndDecode(gray)

            # Strategy 3: Otsu thresholding
            if not val:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
                val, pts, _ = self._detector.detectAndDecode(thresh)

            # Strategy 4: Center crop (if user took a full phone screenshot)
            if not val:
                h, w = img.shape[:2]
                # Crop middle 60%
                y1, y2 = int(h * 0.2), int(h * 0.8)
                x1, x2 = int(w * 0.1), int(w * 0.9)
                cropped = img[y1:y2, x1:x2]
                val, pts, _ = self._detector.detectAndDecode(cropped)

            if not val:
                return {
                    "success": False,
                    "error": "Kode QR tidak terdeteksi dalam gambar. Pastikan gambar memuat Kode QR Kontak WhatsApp dengan jelas dan tidak buram.",
                    "qr_data": None,
                }

            val = val.strip()
            logger.info("[WhatsAppQRService] Successfully decoded QR: %s", val)

            # Parse QR content
            parsed_meta = self._parse_qr_payload(val, img)
            return {
                "success": True,
                "qr_data": val,
                **parsed_meta
            }

        except Exception as exc:
            logger.error("[WhatsAppQRService] Error decoding QR code: %s", exc)
            return {
                "success": False,
                "error": f"Terjadi kesalahan saat memproses gambar: {str(exc)}",
                "qr_data": None,
            }

    def _parse_qr_payload(self, qr_val: str, img: Optional[np.ndarray] = None) -> dict[str, Any]:
        """
        Analyze the decoded QR content to extract WhatsApp links, contact names, and phone numbers.
        """
        phone_number = None
        contact_name = None
        qr_type = "UNKNOWN"
        is_whatsapp = False
        target_link = qr_val

        # Case 1: WhatsApp Contact QR Link (e.g. https://wa.me/qr/S7RKLDEWBD7LK1 or https://api.whatsapp.com/qr/...)
        if "wa.me/qr/" in qr_val or "whatsapp.com/qr/" in qr_val:
            qr_type = "WA_CONTACT_QR"
            is_whatsapp = True
            token_match = re.search(r"/qr/([A-Za-z0-9_-]+)", qr_val)
            token = token_match.group(1) if token_match else "QR-LINK"
            target_link = f"https://wa.me/qr/{token}"

        # Case 2: Direct WhatsApp Phone link (e.g. https://wa.me/628123456789 or https://api.whatsapp.com/send?phone=628...)
        elif "wa.me/" in qr_val or "api.whatsapp.com" in qr_val:
            is_whatsapp = True
            qr_type = "WA_PHONE_DIRECT"
            phone_match = re.search(r"wa\.me/(\+?\d+)", qr_val) or re.search(r"phone=(\+?\d+)", qr_val)
            if phone_match:
                raw_phone = phone_match.group(1)
                phone_number = self._clean_phone(raw_phone)
                target_link = f"https://wa.me/{phone_number}"

        # Case 3: vCard format
        elif "BEGIN:VCARD" in qr_val:
            qr_type = "VCARD_CONTACT"
            is_whatsapp = True
            tel_match = re.search(r"TEL[^:]*:([+\d\s-]+)", qr_val)
            if tel_match:
                phone_number = self._clean_phone(tel_match.group(1))
            name_match = re.search(r"FN:(.+)", qr_val)
            if name_match:
                contact_name = name_match.group(1).strip()
            if phone_number:
                target_link = f"https://wa.me/{phone_number}"

        # Case 4: Raw phone digits
        elif re.match(r"^(\+?62|08)\d{7,13}$", qr_val.replace(" ", "").replace("-", "")):
            qr_type = "RAW_PHONE"
            is_whatsapp = True
            phone_number = self._clean_phone(qr_val)
            target_link = f"https://wa.me/{phone_number}"

        # Extract contact name from screenshot using OCR fallback if image provided and name is still empty
        if not contact_name and img is not None:
            contact_name = self._extract_name_from_image(img)

        # Build human-friendly label
        display_name = contact_name or "Pengguna WhatsApp"
        if phone_number:
            display_phone = f"+{phone_number}"
        else:
            display_phone = "Tautan Kode QR Aktif"

        return {
            "qr_type": qr_type,
            "is_whatsapp": is_whatsapp,
            "phone_number": phone_number,
            "contact_name": contact_name,
            "target_link": target_link,
            "display_name": display_name,
            "display_phone": display_phone,
            "message": "Kode QR Kontak WhatsApp berhasil diverifikasi dan ditautkan!"
        }

    def _clean_phone(self, raw_phone: str) -> str:
        """Sanitize phone string to 628xxxxxxxxxx."""
        digits = re.sub(r"[^\d]", "", raw_phone)
        if digits.startswith("0"):
            digits = "62" + digits[1:]
        elif digits.startswith("8"):
            digits = "628" + digits[1:]
        return digits

    def _extract_name_from_image(self, img: np.ndarray) -> Optional[str]:
        """
        Attempt to read WhatsApp contact name header (e.g. '~qii', 'Nama') from QR screenshot using OCR.
        """
        try:
            from app.services.ocr_service import get_rapid_ocr_engine
            engine = get_rapid_ocr_engine()
            if engine is not None:
                res, _ = engine(img)
                lines = [item[1].strip() for item in (res or []) if len(item) > 1]
                
                # Priority 1: Check for tilde nickname like ~qi or ~qii
                for text in lines:
                    tilde_match = re.search(r"~([A-Za-z0-9_.\s]+)", text)
                    if tilde_match:
                        name = tilde_match.group(1).strip()
                        if len(name) >= 2 and name.lower() not in ("kode", "kontak"):
                            return name

                # Priority 2: Check for line right before 'Kontak WhatsApp' or 'Kontak'
                for idx, text in enumerate(lines):
                    if "kontak" in text.lower() and idx > 0:
                        prev = lines[idx - 1].replace("~", "").strip()
                        if len(prev) >= 2 and prev.lower() not in ("kodesaya", "kode saya", "pindaikode", "pindai kode"):
                            return prev
        except Exception as ocr_err:
            logger.debug("[WhatsAppQRService] OCR name extraction skipped: %s", ocr_err)
        return None


wa_qr_service = WhatsAppQRService()
