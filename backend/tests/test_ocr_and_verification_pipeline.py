"""
backend/tests/test_ocr_and_verification_pipeline.py
===================================================
Automated Test Suite for OCR, Computer Vision Preprocessing,
and Intelligent Medicine Verification Pipeline.
"""

import io
import json
import sqlite3
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.matching_service import (
    compute_composite_similarity,
    normalize_ocr_typos,
    verification_engine,
)
from app.services.ocr_service import extract_medicine_info, preprocess_image_pipeline

client = TestClient(app)
BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "database"


# ─────────────────────────────────────────────────────────────────────────────
# Task 1: Database Enrichment & Sanitization Tests (Target: 1,000+ Records)
# ─────────────────────────────────────────────────────────────────────────────

def test_database_has_over_1000_unique_records():
    """Verify that medicines.json contains at least 1,000 unique records across A-Z."""
    json_path = DB_DIR / "medicines.json"
    assert json_path.exists(), "medicines.json must exist"

    data = json.loads(json_path.read_text(encoding="utf-8"))
    assert len(data) >= 1000, f"Expected >= 1000 medicines, found {len(data)}"

    # Check unique IDs
    ids = [m["id"] for m in data]
    assert len(ids) == len(set(ids)), "All medicine IDs must be unique"

    # Verify all alphabetical letters (A-Z) are represented
    letters_present = {m["medicine_name"][0].upper() for m in data if m.get("medicine_name")}
    alphabet = {chr(c) for c in range(ord("A"), ord("Z") + 1)}
    missing_letters = alphabet - letters_present
    assert len(missing_letters) == 0, f"Missing alphabet directories: {missing_letters}"


def test_mandatory_fields_presence_and_sanitization():
    """Verify all 6 mandatory fields exist and are sanitized."""
    json_path = DB_DIR / "medicines.json"
    data = json.loads(json_path.read_text(encoding="utf-8"))

    sample_items = data[:50]
    for m in sample_items:
        # 1. medicine_name
        assert m.get("medicine_name"), "medicine_name is mandatory"
        # 2. generic_name
        assert m.get("generic_name"), "generic_name is mandatory"
        # 3. category
        assert m.get("category"), "category is mandatory"
        # 4. indications
        assert m.get("indications") or m.get("purpose"), "indications is mandatory"
        # 5. dosage_and_forms
        assert m.get("dosage_and_forms") or m.get("dosage_form"), "dosage_and_forms is mandatory"
        # 6. alias_names / common_misspellings
        assert "aliases" in m or "alias_names" in m, "alias_names is mandatory"
        assert "common_misspellings" in m, "common_misspellings is mandatory"


def test_sqlite_database_and_indexes():
    """Verify production SQLite database exists and has required B-Tree indexes."""
    db_path = DB_DIR / "medicines.db"
    assert db_path.exists(), "medicines.db must exist"

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM medicines")
    row_count = cursor.fetchone()[0]
    assert row_count >= 1000, f"Expected >= 1000 rows in SQLite, found {row_count}"

    cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
    indexes = [r[0] for r in cursor.fetchall()]
    assert "idx_med_name" in indexes, "Index on medicine_name must exist"
    assert "idx_generic_name" in indexes, "Index on generic_name must exist"
    assert "idx_category" in indexes, "Index on category must exist"
    conn.close()


def test_sql_script_deliverable_exists():
    """Verify medicines.sql deliverable file exists and is populated."""
    sql_path = DB_DIR / "medicines.sql"
    assert sql_path.exists(), "medicines.sql must exist"
    assert sql_path.stat().st_size > 500_000, "medicines.sql must be larger than 500KB"


# ─────────────────────────────────────────────────────────────────────────────
# Task 2: High-Accuracy OCR & Image Preprocessing Pipeline Tests
# ─────────────────────────────────────────────────────────────────────────────

def _create_synthetic_medicine_image(
    text: str,
    active_ingredient: str | None = None,
    blur: bool = False,
    rotate_90: bool = False,
) -> bytes:
    """Helper to generate mock medicine packaging images."""
    img = np.full((320, 640, 3), 245, dtype=np.uint8)
    # Packaging header banner
    cv2.rectangle(img, (0, 0), (640, 70), (25, 80, 190), -1)
    cv2.putText(img, text, (30, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 3, cv2.LINE_AA)
    cv2.putText(img, "Dosis: Sediaan Oral", (30, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (40, 40, 40), 2, cv2.LINE_AA)
    act = active_ingredient or text.split()[0]
    cv2.putText(img, f"Bahan Aktif: {act}", (30, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (50, 50, 50), 2, cv2.LINE_AA)
    cv2.putText(img, "No Reg: DBL8504503710A1", (30, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (60, 60, 60), 2, cv2.LINE_AA)

    if blur:
        img = cv2.GaussianBlur(img, (9, 9), 3.0)

    if rotate_90:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)

    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def test_image_preprocessing_pipeline_applied_steps():
    """Verify that multi-stage preprocessing applies enhancements."""
    img_bytes = _create_synthetic_medicine_image("PARACETAMOL 500mg", blur=True)
    thresh, applied_steps, skew = preprocess_image_pipeline(img_bytes)

    assert thresh is not None
    assert isinstance(thresh, np.ndarray)
    assert any("CLAHE" in s for s in applied_steps), "CLAHE contrast step must be applied"
    assert any("Grayscale" in s for s in applied_steps), "Grayscale conversion must be applied"
    assert any("Reduksi Silau" in s or "Pencahayaan" in s for s in applied_steps), "Glare reduction must be applied"


def test_ocr_extraction_on_clear_image():
    """Verify OCR extracts text and identifies medicine on clear synthetic image."""
    img_bytes = _create_synthetic_medicine_image("PARACETAMOL")
    result = extract_medicine_info(img_bytes)

    assert "Paracetamol" in result["medicine_name"]
    assert result["confidence_score"] >= 85.0
    assert result["is_unreadable"] is False
    assert len(result["roi_regions"]) > 0


def test_ocr_extraction_on_rotated_image():
    """Verify OCR handles 90 degree rotated packaging."""
    img_bytes = _create_synthetic_medicine_image("PARACETAMOL", rotate_90=True)
    result = extract_medicine_info(img_bytes)

    assert "Paracetamol" in result["medicine_name"]
    assert result["confidence_score"] >= 85.0


def test_ocr_edge_case_corrupted_image():
    """Verify robust error handling for broken image bytes."""
    bad_bytes = b"This is not a valid image file binary stream"
    result = extract_medicine_info(bad_bytes)

    assert result["is_unreadable"] is True
    assert result["confidence_score"] == 0.0
    assert result["retake_prompt"] is not None


# ─────────────────────────────────────────────────────────────────────────────
# Task 3: Intelligent Matching & Data Verification Pipeline Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_ocr_typo_paracetam0l_fuzzy_match():
    """Verify OCR typo 'Paracetam0l' matches Paracetamol with >= 85% confidence."""
    res = verification_engine.verify_extracted_text("Paracetam0l 500 mg Kaplet")
    assert res.matched_drug is not None
    assert "Paracetamol" in res.matched_drug.get("medicine_name")
    assert res.confidence_score >= 85.0
    assert res.status == "matched"


def test_ocr_typo_paracetanol_fuzzy_match():
    """Verify OCR typo 'Paracetanol' matches Paracetamol with >= 85% confidence."""
    res = verification_engine.verify_extracted_text("Paracetanol 500 mg")
    assert res.matched_drug is not None
    assert "Paracetamol" in res.matched_drug.get("medicine_name")
    assert res.confidence_score >= 85.0
    assert res.status == "matched"


def test_ocr_typo_am0xicillin_fuzzy_match():
    """Verify OCR typo 'Am0xicillin' matches Amoxicillin with >= 85% confidence."""
    res = verification_engine.verify_extracted_text("Am0xicillin Trihydrate 500mg")
    assert res.matched_drug is not None
    assert "Amoxicillin" in res.matched_drug.get("medicine_name")
    assert res.confidence_score >= 85.0
    assert res.status == "matched"


def test_ocr_typo_ibupr0fen_fuzzy_match():
    """Verify OCR typo 'Ibupr0fen' matches Ibuprofen with >= 85% confidence."""
    res = verification_engine.verify_extracted_text("Ibupr0fen 400 mg Tablet")
    assert res.matched_drug is not None
    assert "Ibuprofen" in res.matched_drug.get("medicine_name")
    assert res.confidence_score >= 85.0
    assert res.status == "matched"


def test_generic_name_fallback_priority():
    """Verify Fallback Priority 2: Generic name matches when brand is generic/active substance."""
    res = verification_engine.verify_extracted_text("Acetaminophen 500 mg")
    assert res.matched_drug is not None
    # Paracetamol is Acetaminophen
    assert "Paracetamol" in res.matched_drug.get("medicine_name") or "Asetaminofen" in res.matched_drug.get("generic_name")
    assert res.confidence_score >= 85.0


def test_moderate_confidence_returns_top3_suggestions():
    """Verify confidence between 60%-84% returns top-3 alternative suggestions."""
    # An ambiguous/partial drug string
    res = verification_engine.verify_extracted_text("Cetamol 250")
    assert res.status == "uncertain"
    assert 60.0 <= res.confidence_score < 85.0
    assert len(res.alternative_suggestions) > 0
    assert len(res.alternative_suggestions) <= 3
    # Check suggestion fields
    first_sug = res.alternative_suggestions[0]
    assert "medicine_name" in first_sug
    assert "confidence_score" in first_sug


def test_low_confidence_triggers_retake_prompt():
    """Verify confidence below 60% prompts user to retake photo."""
    res = verification_engine.verify_extracted_text("qwxz98721 #@! unreadable blur")
    assert res.status == "low_confidence"
    assert res.confidence_score < 60.0
    assert res.retake_prompt is not None
    assert "ambil foto ulang" in res.retake_prompt.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Task 4: API Endpoint Integration Tests (/api/verify-medicine & /api/scan-medicine)
# ─────────────────────────────────────────────────────────────────────────────

def test_api_verify_medicine_raw_text():
    """Test POST /api/verify-medicine with raw_text form data."""
    response = client.post("/api/verify-medicine", data={"raw_text": "Paracetam0l 500mg"})
    assert response.status_code == 200
    data = response.json()

    assert "matched_drug" in data
    assert "Paracetamol" in data["matched_drug"]["medicine_name"]
    assert data["confidence_score"] >= 85.0
    assert data["status"] == "matched"
    assert "extracted_text" in data
    assert "applied_algorithms" in data


def test_api_verify_medicine_image_upload():
    """Test POST /api/verify-medicine with multipart image file."""
    img_bytes = _create_synthetic_medicine_image("IBUPROFEN 400mg")
    files = {"image": ("blister.jpg", io.BytesIO(img_bytes), "image/jpeg")}

    response = client.post("/api/verify-medicine", files=files)
    assert response.status_code == 200
    data = response.json()

    assert data["matched_drug"] is not None
    assert data["matched_drug"]["medicine_name"] == "Ibuprofen"
    assert data["confidence_score"] >= 85.0
    assert "roi_regions" in data
    assert "preprocessing_applied" in data


def test_api_scan_medicine_includes_all_task3_fields():
    """Test that POST /api/scan-medicine returns all Task 3 fields."""
    img_bytes = _create_synthetic_medicine_image("PARACETAMOL")
    files = {"files": ("blister.jpg", io.BytesIO(img_bytes), "image/jpeg")}

    response = client.post("/api/scan-medicine", files=files)
    assert response.status_code == 200
    data = response.json()

    # Core Task 3 outputs must be present
    assert "matched_drug" in data
    assert "confidence_score" in data
    assert "extracted_text" in data
    assert "alternative_suggestions" in data
    assert "applied_algorithms" in data
    assert "roi_regions" in data
    assert data["confidence_score"] >= 85.0
