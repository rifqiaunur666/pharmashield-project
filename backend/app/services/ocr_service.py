"""
app/services/ocr_service.py
PharmaShield — Advanced Computer Vision Image Preprocessing & OCR Pipeline with Fuzzy Matching.

Features:
- Image Preprocessing: Grayscale conversion, CLAHE adaptive contrast, skew/rotation angle correction (deskewing), and adaptive thresholding.
- Multi-format support: JPG, PNG, WEBP.
- Fuzzy string matching against Indonesian Medicines Database to handle OCR typos.
- Confidence scoring: Combined OCR character clarity and catalog match percentage.
- Intelligent fallback if Tesseract binary is missing or image is unreadable.
"""

from __future__ import annotations

import difflib
import json
import logging
import math
import re
import shutil
from pathlib import Path
from typing import Any, TypedDict

import cv2
import numpy as np
import pytesseract
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# ─── Tesseract Configuration ─────────────────────────────────────────────────
pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
_TESS_CONFIG = r"--oem 3 --psm 6"

# ─── Date Parsing Helper (Backwards Compatibility) ───────────────────────────
import calendar

_MONTH_MAP = {
    "jan": 1, "januari": 1, "january": 1, "feb": 2, "februari": 2, "february": 2,
    "mar": 3, "maret": 3, "march": 3, "apr": 4, "april": 4, "mei": 5, "may": 5,
    "jun": 6, "juni": 6, "june": 6, "jul": 7, "juli": 7, "july": 7, "aug": 8,
    "agu": 8, "agustus": 8, "august": 8, "sep": 9, "september": 9, "okt": 10,
    "oct": 10, "oktober": 10, "october": 10, "nov": 11, "november": 11,
    "des": 12, "dec": 12, "desember": 12, "december": 12,
}

_EXP_LABEL_RE = re.compile(
    r"(?:exp(?:iry)?(?:date)?|ed|best\s*before|best\s*by|use\s*by|kedaluwarsa|expired?|tgl(?:\.|\s*)?exp)[:\s\.]*",
    re.IGNORECASE,
)
_MFG_LABEL_RE = re.compile(
    r"(?:mfg(?:date)?|mfd|prod(?:uksi)?|manufactured?|tgl(?:\.|\s*)?prod)[:\s\.]*",
    re.IGNORECASE,
)
_DATE_DMY_4DIGIT = re.compile(r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b")
_DATE_DMY_2DIGIT = re.compile(r"\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})\b")
_DATE_MY_4DIGIT = re.compile(r"\b(\d{1,2})[\/\-\.](\d{4})\b")
_DATE_MY_2DIGIT = re.compile(r"\b(\d{1,2})[\/\-\.](\d{2})\b")
_DATE_TEXT_MONTH = re.compile(
    r"\b(?:(\d{1,2})[\s\-\./]*)?(jan|feb|mar|apr|mei|may|jun|jul|aug|agu|sep|okt|oct|nov|des|dec)[a-z]*[\s\-\./]*(\d{2,4})\b",
    re.IGNORECASE,
)

def _to_iso(year: int, month: int, day: int | None = None) -> str | None:
    try:
        if year < 100: year += 2000
        if not (1 <= month <= 12): return None
        if day is None:
            day = calendar.monthrange(year, month)[1]
        else:
            day = max(1, min(day, calendar.monthrange(year, month)[1]))
        return f"{year:04d}-{month:02d}-{day:02d}"
    except Exception:
        return None

def _parse_single_date(snippet: str) -> str | None:
    m_text = _DATE_TEXT_MONTH.search(snippet)
    if m_text:
        d_str, mo_str, yr_str = m_text.groups()
        mo = _MONTH_MAP.get(mo_str.lower()[:3])
        if mo:
            return _to_iso(int(yr_str), mo, int(d_str) if d_str else None)

    m4 = _DATE_DMY_4DIGIT.search(snippet)
    if m4:
        d, mo, yr = map(int, m4.groups())
        return _to_iso(yr, mo, d)

    m2 = _DATE_DMY_2DIGIT.search(snippet)
    if m2:
        d, mo, yr = map(int, m2.groups())
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return _to_iso(yr, mo, d)

    m_my4 = _DATE_MY_4DIGIT.search(snippet)
    if m_my4:
        mo, yr = map(int, m_my4.groups())
        if 1 <= mo <= 12: return _to_iso(yr, mo, None)

    m_my2 = _DATE_MY_2DIGIT.search(snippet)
    if m_my2:
        mo, yr = map(int, m_my2.groups())
        if 1 <= mo <= 12: return _to_iso(yr, mo, None)

    return None

def parse_dates_from_text(text: str) -> tuple[str | None, str | None]:
    lines = text.splitlines()
    exp_d, mfg_d = None, None
    for line in lines:
        if not exp_d:
            em = _EXP_LABEL_RE.search(line)
            if em: exp_d = _parse_single_date(line[em.end(): em.end() + 25])
        if not mfg_d:
            mm = _MFG_LABEL_RE.search(line)
            if mm: mfg_d = _parse_single_date(line[mm.end(): mm.end() + 25])
    return exp_d, mfg_d

# ─── Keyword Dictionaries ────────────────────────────────────────────────────
_DOSAGE_FORM_KEYWORDS = [
    r"tablet", r"kapsul", r"kaplet", r"sirup", r"syrup", r"injeksi",
    r"salep", r"krim", r"cream", r"drop", r"tetes", r"suspensi",
    r"larutan", r"serbuk", r"sachet", r"mg", r"ml", r"forte",
]

_DOSAGE_INSTRUCTION_KEYWORDS = [
    r"sehari", r"kali sehari", r"sesudah makan", r"sebelum makan",
    r"diminum", r"tetes", r"oleskan", r"sendok teh", r"sendok makan",
    r"dosis", r"aturan pakai", r"1x1", r"2x1", r"3x1", r"4x1",
]

_SEVERE_WARNING_KEYWORDS = [
    r"obat keras", r"resep dokter", r"beracun", r"kontraindikasi",
    r"bahaya", r"dilarang", r"racun", r"peringatan keras", r"tanda lingkaran merah",
]


class ExtractedMedicine(TypedDict):
    raw_text: str
    medicine_name: str | None
    detected_brand: str | None
    matched_category: str | None
    bpom_class: str | None
    ocr_confidence: float          # 0.0 to 1.0 (e.g. 0.92 = 92%)
    match_confidence: float        # 0.0 to 1.0
    overall_confidence: float      # 0.0 to 1.0
    is_unreadable: bool
    unreadable_reason: str | None
    dosage_instructions: str | None
    has_dosage_instructions: bool
    has_severe_warning: bool
    detected_warnings: list[str]
    matched_catalog: dict[str, Any] | None
    preprocessing_applied: list[str]
    skew_angle_corrected: float


# ─── Image Preprocessing Pipeline ────────────────────────────────────────────

def _correct_skew(image: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Detect text skew angle and rotate image to align horizontally.
    Uses edge detection and minAreaRect on text regions.
    """
    try:
        # Binarize for contour analysis
        _, thresh = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

        # Morphological open to connect text components
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
        dilated = cv2.dilate(thresh, kernel, iterations=1)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        angles: list[float] = []

        for c in contours:
            area = cv2.contourArea(c)
            if area > 100:
                rect = cv2.minAreaRect(c)
                w, h = rect[1]
                angle = rect[2]
                if w < h:
                    angle = -(90 + angle)
                if abs(angle) < 45.0:
                    angles.append(angle)

        if not angles:
            return image, 0.0

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:
            return image, 0.0

        # Rotate around image center
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        m = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            image, m, (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        )
        return rotated, round(median_angle, 2)
    except Exception as exc:
        logger.debug("[Preprocessing] Skew correction skipped: %s", exc)
        return image, 0.0


def preprocess_image_pipeline(image_bytes: bytes) -> tuple[np.ndarray, list[str], float]:
    """
    Robust image preprocessing pipeline:
    1. Decode from JPG, PNG, WEBP byte buffer
    2. Upscale small images for high-DPI character rendering
    3. Grayscale conversion
    4. CLAHE contrast enhancement for uneven/poor lighting
    5. Skew angle detection and correction (deskewing)
    6. Denoising & Adaptive Gaussian Thresholding
    """
    applied_steps = []

    # 1. Decode multi-format bytes (JPG, PNG, WEBP)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Format berkas gambar tidak didukung atau berkas rusak.")

    applied_steps.append("Decode Multi-format (JPG/PNG/WEBP)")

    # 2. Rescale if too small
    h, w = img.shape[:2]
    if max(h, w) < 1200:
        scale = 1200 / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        applied_steps.append(f"Super-resolution Upscale ({scale:.2f}x)")

    # 3. Convert to Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    applied_steps.append("Konversi Grayscale")

    # 4. CLAHE Contrast Enhancement
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    contrast_enhanced = clahe.apply(gray)
    applied_steps.append("Peningkatan Kontras Adaptif (CLAHE)")

    # 5. Skew & Orientation Correction
    deskewed, skew_angle = _correct_skew(contrast_enhanced)
    if skew_angle != 0.0:
        applied_steps.append(f"Koreksi Kemiringan Sudut ({skew_angle}°)")

    # 6. Bilateral Denoising (preserves text edges while removing background grain)
    denoised = cv2.bilateralFilter(deskewed, d=7, sigmaColor=50, sigmaSpace=50)
    applied_steps.append("Pereduksi Derau (Bilateral Filter)")

    # 7. Adaptive Gaussian Thresholding & Sharpening
    thresh = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=25,
        C=9,
    )
    applied_steps.append("Thresholding Biner Adaptif")

    return thresh, applied_steps, skew_angle


# ─── Reference Catalog & Fuzzy Matching ──────────────────────────────────────

def _load_medicines_catalog() -> list[dict[str, Any]]:
    """Load reference medicines from JSON file."""
    catalog_path = settings.database_dir / "medicines.json"
    if not catalog_path.exists():
        return []
    try:
        content = catalog_path.read_text(encoding="utf-8").strip()
        if not content:
            return []
        data = json.loads(content)
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.error("[Catalog] Failed loading medicines.json: %s", exc)
        return []


def _fuzzy_match_catalog(text: str) -> tuple[dict[str, Any] | None, float]:
    """
    Perform fuzzy string matching on extracted text against the Indonesian Medicine Database.
    Calculates similarity score (0.0 to 1.0) using SequenceMatcher.
    """
    catalog = _load_medicines_catalog()
    if not catalog or not text.strip():
        return None, 0.0

    text_lower = text.lower()
    best_match: dict[str, Any] | None = None
    best_score: float = 0.0

    # Extract words/n-grams from OCR text
    words = re.findall(r"[a-zA-Z0-9\-]+", text_lower)
    tokens_text = " ".join(words)

    for med in catalog:
        candidates = [med.get("name", "").lower()] + [a.lower() for a in med.get("aliases", [])]

        for cand in candidates:
            if not cand:
                continue

            # Exact substring match
            if cand in text_lower:
                score = 1.0
            else:
                # Fuzzy matching against full text tokens and chunks
                score = difflib.SequenceMatcher(None, cand, tokens_text).ratio()

                # Check sliding window of word chunks matching candidate length
                cand_len = len(cand.split())
                for i in range(len(words) - cand_len + 1):
                    chunk = " ".join(words[i:i + cand_len])
                    chunk_score = difflib.SequenceMatcher(None, cand, chunk).ratio()
                    if chunk_score > score:
                        score = chunk_score

            if score > best_score:
                best_score = score
                best_match = med

    return best_match, round(best_score, 2)


# ─── Helper Functions ────────────────────────────────────────────────────────

def _check_tesseract_binary() -> bool:
    """Return True if Tesseract executable is found."""
    tess_path = pytesseract.pytesseract.tesseract_cmd
    if tess_path and Path(tess_path).is_file():
        return True
    return shutil.which("tesseract") is not None


def _check_dosage_and_warnings(text: str, catalog_match: dict | None) -> tuple[str | None, bool, bool, list[str]]:
    """Extract dosage instructions and detect severe warnings."""
    text_lower = text.lower()

    dosage: str | None = None
    has_dosage = False

    if catalog_match and catalog_match.get("usage"):
        dosage = catalog_match["usage"]
        has_dosage = True
    else:
        for kw in _DOSAGE_INSTRUCTION_KEYWORDS:
            if re.search(kw, text_lower):
                has_dosage = True
                for line in text.splitlines():
                    if re.search(kw, line.lower()):
                        dosage = line.strip()
                        break
                break

    detected_warnings: list[str] = []
    has_severe = False

    if catalog_match and catalog_match.get("warnings"):
        detected_warnings.extend(catalog_match["warnings"])
        for w in catalog_match["warnings"]:
            if any(re.search(kw, w.lower()) for kw in _SEVERE_WARNING_KEYWORDS):
                has_severe = True

    for kw in _SEVERE_WARNING_KEYWORDS:
        if re.search(kw, text_lower):
            has_severe = True
            for line in text.splitlines():
                if re.search(kw, line.lower()) and line.strip() not in detected_warnings:
                    detected_warnings.append(line.strip())

    return dosage, has_dosage, has_severe, detected_warnings


# ─── Public API ──────────────────────────────────────────────────────────────

def extract_medicine_info(image_bytes: bytes) -> ExtractedMedicine:
    """
    Main OCR extraction pipeline with Computer Vision preprocessing & Fuzzy Matching.
    """
    is_tesseract_installed = _check_tesseract_binary()
    raw_text = ""
    is_unreadable = False
    unreadable_reason: str | None = None
    applied_steps: list[str] = []
    skew_angle: float = 0.0

    # Execute Preprocessing
    try:
        preprocessed_img, applied_steps, skew_angle = preprocess_image_pipeline(image_bytes)
    except Exception as exc:
        logger.error("[Preprocessing] Pipeline failed: %s", exc)
        return ExtractedMedicine(
            raw_text="Gagal memproses gambar kemasan.",
            medicine_name="Kemasan Tidak Teridentifikasi",
            detected_brand=None,
            matched_category=None,
            bpom_class=None,
            ocr_confidence=0.0,
            match_confidence=0.0,
            overall_confidence=0.0,
            is_unreadable=True,
            unreadable_reason=f"Berkas gambar tidak dapat diproses: {exc}",
            dosage_instructions=None,
            has_dosage_instructions=False,
            has_severe_warning=True,
            detected_warnings=["Format berkas tidak valid atau gambar rusak."],
            matched_catalog=None,
            preprocessing_applied=["Error Processing"],
            skew_angle_corrected=0.0,
        )

    # Execute OCR
    if not is_tesseract_installed:
        logger.warning(
            "[OCR] Tesseract binary not found at '%s'. Using safe fallback.",
            pytesseract.pytesseract.tesseract_cmd,
        )
        is_unreadable = True
        unreadable_reason = (
            "Binary OCR lokal tidak ditemukan pada sistem. "
            "Sistem mengaktifkan status Peringatan Ketat / Berisiko demi keselamatan pasien."
        )
    else:
        try:
            pil_img = Image.fromarray(preprocessed_img)
            raw_text = pytesseract.image_to_string(pil_img, config=_TESS_CONFIG)
            logger.debug("[OCR] Extracted text:\n%s", raw_text)
        except Exception as exc:
            logger.exception("[OCR] Tesseract extraction error: %s", exc)
            is_unreadable = True
            unreadable_reason = f"Gagal mengekstrak teks OCR: {exc}"

    # Calculate OCR Text Confidence
    total_chars = max(len(raw_text.strip()), 1)
    alpha_chars = sum(c.isalpha() for c in raw_text)
    alpha_ratio = alpha_chars / total_chars

    if not is_unreadable and alpha_chars < 4:
        is_unreadable = True
        unreadable_reason = "Teks pada gambar buram atau tidak terbaca secara memadai."

    ocr_confidence = round(min(alpha_ratio * 1.15, 1.0), 2) if not is_unreadable else 0.0

    # Fuzzy String Match against Indonesian Medicine Catalog
    matched_catalog, match_score = _fuzzy_match_catalog(raw_text) if raw_text else (None, 0.0)

    # Combined Confidence Calculation
    if matched_catalog:
        overall_confidence = round((ocr_confidence * 0.4) + (match_score * 0.6), 2)
    else:
        overall_confidence = round(ocr_confidence * 0.5, 2)

    # Determine Medicine Name
    medicine_name = matched_catalog.get("name") if matched_catalog else None
    if not medicine_name and raw_text:
        # Heuristic extraction of first strong text line
        lines = [l.strip() for l in raw_text.splitlines() if len(l.strip()) >= 4]
        if lines:
            medicine_name = lines[0][:60]

    dosage, has_dosage, has_severe, warnings = _check_dosage_and_warnings(raw_text, matched_catalog)

    # Fallback / Low confidence risk trigger
    if is_unreadable or overall_confidence < 0.60:
        if not is_unreadable:
            is_unreadable = True
            unreadable_reason = (
                f"Tingkat akurasi identifikasi rendah ({int(overall_confidence * 100)}%). "
                "Nama obat tidak dapat dipastikan dengan aman."
            )

        return ExtractedMedicine(
            raw_text=raw_text or "(Teks tidak dapat dikenali)",
            medicine_name=medicine_name or "Kemasan Tidak Teridentifikasi",
            detected_brand=matched_catalog.get("aliases", [None])[0] if matched_catalog else None,
            matched_category=matched_catalog.get("category") if matched_catalog else "Tidak Teridentifikasi",
            bpom_class=matched_catalog.get("bpom_class") if matched_catalog else "Perlu Pemeriksaan",
            ocr_confidence=ocr_confidence,
            match_confidence=match_score,
            overall_confidence=overall_confidence,
            is_unreadable=True,
            unreadable_reason=unreadable_reason,
            dosage_instructions=dosage,
            has_dosage_instructions=has_dosage,
            has_severe_warning=True,
            detected_warnings=warnings or ["Label kemasan tidak terbaca jelas atau nama obat tidak dikenali."],
            matched_catalog=matched_catalog,
            preprocessing_applied=applied_steps,
            skew_angle_corrected=skew_angle,
        )

    return ExtractedMedicine(
        raw_text=raw_text,
        medicine_name=medicine_name,
        detected_brand=matched_catalog.get("aliases", [None])[0] if matched_catalog else None,
        matched_category=matched_catalog.get("category", "Pengobatan Umum"),
        bpom_class=matched_catalog.get("bpom_class", "Obat Bebas"),
        ocr_confidence=ocr_confidence,
        match_confidence=match_score,
        overall_confidence=overall_confidence,
        is_unreadable=False,
        unreadable_reason=None,
        dosage_instructions=dosage,
        has_dosage_instructions=has_dosage,
        has_severe_warning=has_severe,
        detected_warnings=warnings,
        matched_catalog=matched_catalog,
        preprocessing_applied=applied_steps,
        skew_angle_corrected=skew_angle,
    )
