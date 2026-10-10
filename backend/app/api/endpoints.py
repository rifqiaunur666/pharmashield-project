"""
app/api/endpoints.py
PharmaShield — Central API Router.

Endpoints:
  - POST   /scan-medicine      (Multipart image scan, OCR, safety, WA alert)
  - GET    /history            (Retrieve all scan history + aggregate statistics)
  - DELETE /history            (Clear all history)
  - DELETE /history/{scan_id}  (Delete specific history item)
  - GET    /stats              (Aggregate stats: total, green, yellow, red)

Mounted in main.py under prefix="/api" -> e.g. /api/scan-medicine, /api/history
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.ocr_service import extract_medicine_info
from app.services.safety_evaluator import evaluate_consumption_safety, evaluate_safety
from app.services.wa_service import send_whatsapp_alert

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── History Storage Persistence ──────────────────────────────────────────────

def _get_history_file() -> Path:
    """Return primary history file path and ensure directory exists."""
    path = settings.history_file
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load_history_from_disk() -> list[dict[str, Any]]:
    """Load scan history list from disk (data/scan_history.json)."""
    file_path = _get_history_file()
    if not file_path.exists():
        return []
    try:
        content = file_path.read_text(encoding="utf-8").strip()
        if not content:
            return []
        data = json.loads(content)
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.error("[History] Error reading history file: %s", exc)
        return []


def _save_history_to_disk(items: list[dict[str, Any]]) -> None:
    """Save history list to disk (retaining latest 250 items)."""
    trimmed = items[:250]
    payload = json.dumps(trimmed, ensure_ascii=False, indent=2)

    # Write to primary data/scan_history.json
    primary = _get_history_file()
    primary.write_text(payload, encoding="utf-8")

    # Mirror to legacy database/scan_history.json for safety
    try:
        settings.legacy_history_file.parent.mkdir(parents=True, exist_ok=True)
        settings.legacy_history_file.write_text(payload, encoding="utf-8")
    except Exception as exc:
        logger.debug("[History] Legacy mirror write skipped: %s", exc)


def _append_history_item(entry: dict[str, Any]) -> None:
    """Prepend new scan item to history file."""
    items = _load_history_from_disk()
    items.insert(0, entry)
    _save_history_to_disk(items)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/scan-medicine", summary="Scan medicine packaging image")
async def scan_medicine(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="JPEG/PNG image of medicine packaging"),
):
    """
    Accept medicine image, execute OCR date extraction, evaluate 3-level safety status,
    persist to data/scan_history.json, and trigger automated WhatsApp notification.
    """
    # Validate uploaded file
    if not file:
        raise HTTPException(status_code=400, detail="Tidak ada file yang diunggah.")

    # Read image bytes
    try:
        image_bytes = await file.read()
    except Exception as exc:
        logger.error("[Scan] Failed reading file stream: %s", exc)
        raise HTTPException(status_code=400, detail="Gagal membaca file gambar.")

    if not image_bytes or len(image_bytes) == 0:
        raise HTTPException(status_code=400, detail="File gambar kosong.")

    if len(image_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ukuran gambar maksimal 20 MB.")

    scan_id = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    now_display = datetime.now().strftime("%d %B %Y %H:%M WIB")

    # 1. OCR Extraction (with fallback to avoid 500/422 crash)
    try:
        ocr_result = extract_medicine_info(image_bytes)
    except Exception as exc:
        logger.exception("[Scan] OCR processing unexpected error: %s", exc)
        # Fallback response instead of crashing with HTTP 500
        ocr_result = {
            "raw_text": f"Gagal memproses gambar: {exc}",
            "medicine_name": "Kemasan Tidak Dikenali",
            "expiry_date": None,
            "mfg_date": None,
            "ocr_confidence": 0.0,
            "is_unreadable": True,
            "unreadable_reason": "Format gambar tidak didukung atau terjadi kesalahan sistem OCR.",
            "dosage_instructions": None,
            "has_dosage_instructions": False,
            "has_severe_warning": True,
            "detected_warnings": ["Gambar tidak dapat diproses secara normal."],
            "matched_catalog": None,
        }

    medicine_name = ocr_result.get("medicine_name")
    expiry_date = ocr_result.get("expiry_date")
    mfg_date = ocr_result.get("mfg_date")
    raw_text = ocr_result.get("raw_text", "")
    ocr_confidence = ocr_result.get("ocr_confidence", 0.0)
    is_unreadable = ocr_result.get("is_unreadable", False)
    unreadable_reason = ocr_result.get("unreadable_reason")
    has_dosage = ocr_result.get("has_dosage_instructions", True)
    has_severe = ocr_result.get("has_severe_warning", False)
    detected_warnings = ocr_result.get("detected_warnings", [])
    matched_catalog = ocr_result.get("matched_catalog") or {}

    # 2. Safety Status Evaluation (🟢 Aman, 🟡 Perhatian, 🔴 Peringatan Ketat)
    overall_conf = ocr_result.get("overall_confidence", ocr_confidence)
    bpom_class = matched_catalog.get("bpom_class") or ocr_result.get("bpom_class")

    safety = evaluate_consumption_safety(
        medicine_name=medicine_name,
        overall_confidence=overall_conf,
        has_dosage_instructions=has_dosage,
        has_severe_warning=has_severe,
        is_unreadable=is_unreadable,
        unreadable_reason=unreadable_reason,
        bpom_class=bpom_class,
    )

    # Enrich metadata from catalog if available
    purpose = matched_catalog.get("purpose", "")
    usage = matched_catalog.get("usage", ocr_result.get("dosage_instructions") or "")
    ingredients = matched_catalog.get("ingredients", [])
    side_effects = matched_catalog.get("side_effects", [])
    all_warnings = list(set(detected_warnings + matched_catalog.get("warnings", [])))

    identified = bool(medicine_name and not is_unreadable and safety["readability_status"] != "tidak_teridentifikasi")

    # 3. Construct response payload
    response_data: dict[str, Any] = {
        "scan_id": scan_id,
        "scanned_at": now_iso,
        "scanned_at_formatted": now_display,
        "identified": identified,
        "name": medicine_name,
        "medicine_name": medicine_name,
        "category": matched_catalog.get("category", "Pengobatan Umum"),
        "bpom_class": bpom_class or "Pemeriksaan Fisik Diperlukan",
        "purpose": purpose,
        "usage": usage,
        "ingredients": ingredients,
        "side_effects": side_effects,
        "warnings": all_warnings,
        "readability_status": safety["readability_status"],
        "readability_label": safety["readability_label"],
        "is_safe_to_consume": safety["is_safe_to_consume"],
        "risk_level": safety["risk_level"],
        "confidence_percentage": safety["confidence_percentage"],
        "status": safety["status"],
        "status_id": safety["status_id"],
        "status_emoji": safety["status_emoji"],
        "shelf_life_note": safety["shelf_life_note"],
        "recommendation": safety["recommendation"],
        "ocr_confidence": ocr_confidence,
        "match_confidence": ocr_result.get("match_confidence", 0.0),
        "overall_confidence": overall_conf,
        "preprocessing_applied": ocr_result.get("preprocessing_applied", []),
        "skew_angle_corrected": ocr_result.get("skew_angle_corrected", 0.0),
        "raw_text": raw_text,
    }

    # 4. Persist to data/scan_history.json
    try:
        history_entry = {k: v for k, v in response_data.items() if k != "raw_text"}
        _append_history_item(history_entry)
    except Exception as exc:
        logger.error("[Scan] Failed to persist scan history: %s", exc)

    # 5. Automated WhatsApp Notification (non-blocking background task)
    wa_payload = {
        "medicine_name": medicine_name,
        "expiry_date": expiry_date,
        "status": safety["status"],
        "status_id": safety["status_id"],
        "status_emoji": safety["status_emoji"],
        "days_remaining": safety["days_remaining"],
        "shelf_life_note": safety["shelf_life_note"],
        "recommendation": safety["recommendation"],
        "scan_time": now_display,
    }
    background_tasks.add_task(send_whatsapp_alert, **wa_payload)

    logger.info(
        "[Scan] Result -> ID: %s | Name: %s | Expiry: %s | Status: %s (%s)",
        scan_id, medicine_name, expiry_date, safety["status_id"], safety["status_emoji"],
    )

    return JSONResponse(content=response_data, status_code=200)


@router.get("/history", summary="Get scan history and statistics")
async def get_history():
    """
    Retrieve full list of scan records from data/scan_history.json
    along with aggregate counts for dashboard metric cards.
    """
    items = _load_history_from_disk()

    total = len(items)
    safe_count = sum(1 for i in items if i.get("status") == "green")
    warning_count = sum(1 for i in items if i.get("status") == "yellow")
    danger_count = sum(1 for i in items if i.get("status") == "red")

    return JSONResponse(
        content={
            "total": total,
            "safe": safe_count,
            "warning": warning_count,
            "expired": danger_count,
            "danger": danger_count,
            "items": items,
        },
        status_code=200,
    )


@router.get("/stats", summary="Get dashboard summary metrics")
async def get_stats():
    """Get aggregate metrics for top dashboard cards."""
    items = _load_history_from_disk()
    return JSONResponse(
        content={
            "total": len(items),
            "safe": sum(1 for i in items if i.get("status") == "green"),
            "warning": sum(1 for i in items if i.get("status") == "yellow"),
            "danger": sum(1 for i in items if i.get("status") == "red"),
        },
        status_code=200,
    )


@router.delete("/history/{scan_id}", summary="Delete single history entry")
async def delete_history_item(scan_id: str):
    """Remove a specific scan record by its scan_id."""
    items = _load_history_from_disk()
    filtered = [i for i in items if i.get("scan_id") != scan_id and i.get("id") != scan_id]

    if len(filtered) == len(items):
        raise HTTPException(status_code=404, detail="Riwayat tidak ditemukan.")

    _save_history_to_disk(filtered)
    return JSONResponse(content={"success": True, "message": "Entri berhasil dihapus."})


@router.delete("/history", summary="Clear all scan history")
async def clear_all_history():
    """Clear all records from scan_history.json."""
    _save_history_to_disk([])
    return JSONResponse(content={"success": True, "message": "Semua riwayat berhasil dihapus."})
