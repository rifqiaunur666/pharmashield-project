"""
backend/tests/test_pharmashield.py
Comprehensive automated test suite for PharmaShield.
"""

import io
from datetime import date, timedelta
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.services.ocr_service import parse_dates_from_text, extract_medicine_info
from app.services.safety_evaluator import evaluate_safety
from app.services.wa_service import format_whatsapp_message, send_whatsapp_alert


@pytest.fixture
def client():
    return TestClient(app)


# ─── 1. Test OCR Date Parsing & Regex ──────────────────────────────────────────

def test_ocr_date_patterns():
    # Format DD/MM/YYYY
    exp, mfg = parse_dates_from_text("EXP: 25/12/2026")
    assert exp == "2026-12-25"

    # Format DD.MM.YY (2-digit year)
    exp, mfg = parse_dates_from_text("EXP 14.05.26")
    assert exp == "2026-05-14"

    # Format MM-YYYY
    exp, mfg = parse_dates_from_text("BEST BEFORE 12-2027")
    assert exp == "2027-12-31"

    # Format MM.YY
    exp, mfg = parse_dates_from_text("ED 09.25")
    assert exp == "2025-09-30"

    # Both MFG and EXP present
    exp, mfg = parse_dates_from_text("MFG 01/01/2024 EXP 15/08/2026")
    assert exp == "2026-08-15"
    assert mfg == "2024-01-01"

    # Indonesian label
    exp, mfg = parse_dates_from_text("KEDALUWARSA: 10/2026")
    assert exp == "2026-10-31"

    # Textual month
    exp, mfg = parse_dates_from_text("EXP DES 2026")
    assert exp == "2026-12-31"


# ─── 2. Test Safety Evaluator Rules ───────────────────────────────────────────

def test_safety_evaluator_green():
    """🟢 GREEN: Expiration date > 30 days from current date."""
    future_date = (date.today() + timedelta(days=90)).isoformat()
    result = evaluate_safety(future_date, has_dosage_instructions=True)
    assert result["status"] == "green"
    assert result["status_id"] == "Aman"
    assert result["status_emoji"] == "🟢"
    assert result["is_expired"] is False
    assert result["days_remaining"] > 30


def test_safety_evaluator_yellow_near_expiry():
    """🟡 YELLOW: Expiration date <= 30 days."""
    near_date = (date.today() + timedelta(days=15)).isoformat()
    result = evaluate_safety(near_date, has_dosage_instructions=True)
    assert result["status"] == "yellow"
    assert result["status_id"] == "Peringatan"
    assert result["status_emoji"] == "🟡"
    assert result["is_expired"] is False
    assert result["days_remaining"] == 15


def test_safety_evaluator_yellow_missing_dosage():
    """🟡 YELLOW: Expiration date > 30 days BUT dosage instructions are missing/unclear."""
    future_date = (date.today() + timedelta(days=90)).isoformat()
    result = evaluate_safety(future_date, has_dosage_instructions=False)
    assert result["status"] == "yellow"
    assert result["status_id"] == "Peringatan"
    assert result["status_emoji"] == "🟡"


def test_safety_evaluator_red_expired():
    """🔴 RED: Expired date (<= current date)."""
    past_date = (date.today() - timedelta(days=5)).isoformat()
    result = evaluate_safety(past_date)
    assert result["status"] == "red"
    assert result["status_id"] == "Bahaya"
    assert result["status_emoji"] == "🔴"
    assert result["is_expired"] is True
    assert result["days_remaining"] < 0


def test_safety_evaluator_red_unreadable():
    """🔴 RED: Unreadable critical details / missing expiry."""
    result = evaluate_safety(None, is_unreadable=True)
    assert result["status"] == "red"
    assert result["status_id"] == "Bahaya"
    assert result["status_emoji"] == "🔴"
    assert result["is_expired"] is True


# ─── 3. Test WhatsApp Notification Formatter ──────────────────────────────────

def test_whatsapp_message_format():
    msg = format_whatsapp_message(
        medicine_name="Paracetamol 500mg",
        expiry_date="2027-12-31",
        status="green",
        status_id="Aman",
        status_emoji="🟢",
        days_remaining=450,
        shelf_life_note="Obat aman digunakan.",
        recommendation="Simpan di tempat sejuk.",
        scan_time="06 Oktober 2026 19:00 WIB",
    )
    assert "Paracetamol 500mg" in msg
    assert "2027-12-31" in msg
    assert "🟢" in msg
    assert "Aman" in msg
    assert "Rekomendasi Penggunaan" in msg


# ─── 4. Test Endpoints & Fallback Image Processing ────────────────────────────

def test_api_health(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_api_scan_fallback_no_crash(client):
    """Verifies that unreadable image returns 🔴 Danger without 500/422 crash."""
    img = Image.new("RGB", (100, 100), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    res = client.post(
        "/api/scan-medicine",
        files={"file": ("scan.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("gray", "red")
    assert "scan_id" in data


def test_api_history_flow(client):
    # Fetch history
    res = client.get("/api/history")
    assert res.status_code == 200
    data = res.json()
    assert "total" in data
    assert "safe" in data
    assert "warning" in data
    assert "danger" in data
    assert "items" in data

    # Clear history
    del_res = client.delete("/api/history")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Check that history is empty
    res_after = client.get("/api/history")
    assert res_after.json()["total"] == 0


def test_api_scan_missing_file_returns_400(client):
    res = client.post("/api/scan-medicine")
    assert res.status_code == 400
    assert "Tidak ada file gambar" in res.json()["detail"]


def test_api_scan_single_image_fields(client):
    img = Image.new("RGB", (200, 200), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    res = client.post(
        "/api/scan-medicine",
        files={"file": ("paracetamol_test.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "scan_id" in data
    assert "name" in data
    assert "dosage_strength" in data
    assert "dosage_form" in data
    assert "storage_info" in data
    assert "bpom_registration" in data
    assert "disclaimer" in data
    assert "angle_count" not in data  # Multi-angle fields are strictly removed


def test_api_medicines_catalog_endpoint(client):
    res = client.get("/api/medicines")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 10

    # Search filter test
    res_search = client.get("/api/medicines?q=paracetamol")
    assert res_search.status_code == 200
    data_search = res_search.json()
    assert data_search["total"] >= 1
    assert any("paracetamol" in m["name"].lower() for m in data_search["medicines"])


# ─── 5. Test AI Vision & Chatbot Endpoints ────────────────────────────────────

def test_api_ai_status(client):
    res = client.get("/api/ai/status")
    assert res.status_code == 200
    data = res.json()
    assert "ai_enabled" in data
    assert "model" in data
    assert "features" in data
    assert "vision_scanner" in data["features"]
    assert "chatbot" in data["features"]


def test_api_ai_scan_vision_unsupported_format(client):
    res = client.post(
        "/api/ai/scan-vision",
        files={"file": ("test.pdf", b"%PDF-1.4...", "application/pdf")},
    )
    assert res.status_code == 415
    assert "Format file tidak didukung" in res.json()["detail"]


def test_api_ai_scan_vision_empty_file(client):
    res = client.post(
        "/api/ai/scan-vision",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert res.status_code == 400
    assert "kosong" in res.json()["detail"]


def test_api_ai_scan_vision_unconfigured_key(client):
    img = Image.new("RGB", (100, 100), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    res = client.post(
        "/api/ai/scan-vision",
        files={"file": ("sample.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["detection_status"] == "FAILED"
    assert data["requires_api_key"] is True
    assert "GEMINI_API_KEY" in data["error_message"]


def test_api_ai_chat_validation(client):
    # Empty message test
    res_empty = client.post("/api/ai/chat", json={"message": "   "})
    assert res_empty.status_code == 400

    # Unconfigured key response test
    res = client.post("/api/ai/chat", json={"message": "Apa dosis paracetamol untuk dewasa?"})
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is False
    assert data["requires_api_key"] is True


def test_ai_service_error_sanitization():
    from app.services.ai_service import _sanitize_error_message
    raw_error = "API request failed at https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz"
    sanitized = _sanitize_error_message(raw_error)
    assert "AIzaSy" not in sanitized
    assert "[REDACTED" in sanitized


