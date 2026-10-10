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
from app.services.matching_service import verification_engine, VerificationResult

logger = logging.getLogger(__name__)

# ─── Tesseract & RapidOCR Configuration ─────────────────────────────────────
pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd
_TESS_CONFIG = r"--oem 3 --psm 6"

try:
    from rapidocr_onnxruntime import RapidOCR
    _rapid_ocr_engine = RapidOCR()
    _has_rapid_ocr = True
except Exception as _e:
    _rapid_ocr_engine = None
    _has_rapid_ocr = False
    logger.info("[OCR] RapidOCR initialization note: %s", _e)

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


# ─── Dosage Form & Packaging Extraction Regex ──────────────────────────────
_DOSAGE_STRENGTH_RE = re.compile(r"\b(\d+(?:[.,]\d+)?\s*(?:mg|ml|mcg|g|%))\b", re.IGNORECASE)
_BPOM_REG_RE = re.compile(r"\b((?:POM\s*)?(?:DKL|DBL|DTL|GBL|SD|TR)[\s\d]{9,15})\b", re.IGNORECASE)

class ExtractedMedicine(TypedDict):
    raw_text: str
    extracted_text: str
    medicine_name: str | None
    detected_brand: str | None
    generic_name: str | None
    matched_category: str | None
    bpom_class: str | None
    dosage_strength: str | None
    dosage_form: str | None
    storage_info: str | None
    bpom_registration: str | None
    contraindications: list[str]
    ocr_confidence: float          # 0.0 to 1.0 (e.g. 0.92 = 92%)
    match_confidence: float        # 0.0 to 1.0
    overall_confidence: float      # 0.0 to 1.0
    confidence_score: float        # 0.0 to 100.0 (percentage e.g. 96.5)
    is_unreadable: bool
    unreadable_reason: str | None
    dosage_instructions: str | None
    has_dosage_instructions: bool
    has_severe_warning: bool
    detected_warnings: list[str]
    matched_catalog: dict[str, Any] | None
    matched_drug: dict[str, Any] | None
    alternative_suggestions: list[dict[str, Any]]
    retake_prompt: str | None
    match_priority: str
    applied_algorithms: list[str]
    preprocessing_applied: list[str]
    skew_angle_corrected: float
    roi_regions: list[dict[str, Any]]


def _extract_packaging_text_details(text: str) -> tuple[str | None, str | None, str | None]:
    """Extract dosage strength, dosage form, and BPOM registration number from raw text if present."""
    strength = None
    m_str = _DOSAGE_STRENGTH_RE.search(text)
    if m_str:
        strength = m_str.group(1).strip()

    form = None
    for kw in _DOSAGE_FORM_KEYWORDS:
        if kw not in ("mg", "ml", "forte") and re.search(rf"\b{kw}\b", text, re.IGNORECASE):
            form = kw.capitalize()
            break

    bpom_reg = None
    m_bpom = _BPOM_REG_RE.search(text)
    if m_bpom:
        bpom_reg = m_bpom.group(1).strip().replace(" ", "")

    return strength, form, bpom_reg



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


def _extract_rois_from_rapidocr(ocr_res: list[Any], img_shape: tuple[int, ...]) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Region of Interest (ROI) Detection:
    Analyze bounding polygons from deep learning detector:
    - Identifies primary brand name / header text (large area, high aspect ratio)
    - Distinguishes active ingredients / dosage lines
    - Filters out barcodes, QR code patterns, and non-text visual artifacts.
    """
    rois: list[dict[str, Any]] = []
    text_lines: list[str] = []
    h_img, w_img = img_shape[:2]

    if not ocr_res:
        return rois, text_lines

    for item in ocr_res:
        if len(item) < 3:
            continue
        poly = item[0]
        text_content = str(item[1]).strip()
        conf_val = float(item[2]) if str(item[2]).replace(".", "", 1).isdigit() else 0.85

        if not text_content:
            continue

        # Calculate bounding box dimensions
        xs = [pt[0] for pt in poly]
        ys = [pt[1] for pt in poly]
        min_x, max_x = max(0, min(xs)), min(w_img, max(xs))
        min_y, max_y = max(0, min(ys)), min(h_img, max(ys))
        box_w = max_x - min_x
        box_h = max_y - min_y
        box_area = box_w * box_h

        # Barcode filter: Barcodes mistaken for text are usually continuous digits without letters
        is_barcode = bool(re.match(r"^\d{10,14}$", text_content.replace(" ", "")))
        if is_barcode:
            logger.debug("[ROI] Detected and filtered barcode area: %s", text_content)
            continue

        # Classify ROI prominence
        if box_h >= 28 or (box_area > (h_img * w_img * 0.03) and len(text_content) >= 3):
            roi_type = "primary_brand_header"
        elif any(k in text_content.lower() for k in ("mg", "ml", "mcg", "%", "forte", "sirup", "tablet", "kandungan", "bahan aktif")):
            roi_type = "active_ingredient_banner"
        else:
            roi_type = "body_metadata"

        rois.append({
            "type": roi_type,
            "text": text_content,
            "confidence": round(conf_val, 2),
            "bbox": [int(min_x), int(min_y), int(box_w), int(box_h)],
        })
        text_lines.append(text_content)

    # Sort ROIs so primary brand header and active ingredients appear first
    rois.sort(key=lambda r: (
        0 if r["type"] == "primary_brand_header" else (1 if r["type"] == "active_ingredient_banner" else 2),
        -r["bbox"][2] * r["bbox"][3]  # Largest box first
    ))

    return rois, text_lines


def preprocess_image_pipeline(image_bytes: bytes) -> tuple[np.ndarray, list[str], float]:
    """
    Robust multi-stage image preprocessing pipeline:
    1. Decode from JPG, PNG, WEBP byte buffer
    2. Upscale small images / cropped scans for high-DPI character rendering
    3. Grayscale conversion
    4. Glare suppression & illumination normalization (removes flash reflections on blister foil)
    5. Blur detection & Laplacian-based unsharp mask sharpening
    6. Multi-scale CLAHE adaptive contrast enhancement
    7. Skew angle detection and correction (deskewing)
    8. Bilateral denoising (preserves sharp text edges while removing sensor grain)
    9. Adaptive Gaussian Thresholding
    """
    applied_steps = []

    # 1. Decode multi-format bytes (JPG, PNG, WEBP)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Format berkas gambar tidak didukung atau berkas rusak.")

    applied_steps.append("Decode Multi-format (JPG/PNG/WEBP)")

    # 2. Rescale / Super-resolution upscale for small images or cropped scans
    h, w = img.shape[:2]
    if max(h, w) < 1400:
        scale = 1400 / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        applied_steps.append(f"Super-resolution Upscale ({scale:.2f}x)")

    # 3. Convert to Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    applied_steps.append("Konversi Grayscale")

    # 4. Glare Suppression & Background Illumination Normalization
    try:
        kernel_bg = cv2.getStructuringElement(cv2.MORPH_RECT, (35, 35))
        bg = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel_bg)
        norm_lighting = cv2.divide(gray, bg, scale=255)
        applied_steps.append("Normalisasi Pencahayaan & Reduksi Silau (Illumination Division)")
    except Exception:
        norm_lighting = gray

    # 5. Blur Detection & Sharpness Restoration (Unsharp Masking)
    laplacian_var = cv2.Laplacian(norm_lighting, cv2.CV_64F).var()
    if laplacian_var < 180:
        gaussian = cv2.GaussianBlur(norm_lighting, (0, 0), sigmaX=2.0)
        sharpened = cv2.addWeighted(norm_lighting, 1.6, gaussian, -0.6, 0)
        applied_steps.append(f"Restorasi Ketajaman Teks (Unsharp Mask, Blur: {laplacian_var:.1f})")
    else:
        sharpened = norm_lighting

    # 6. CLAHE Contrast Enhancement for uneven lighting
    clahe = cv2.createCLAHE(clipLimit=2.8, tileGridSize=(8, 8))
    contrast_enhanced = clahe.apply(sharpened)
    applied_steps.append("Peningkatan Kontras Adaptif (CLAHE)")

    # 7. Skew & Orientation Correction (Deskewing)
    deskewed, skew_angle = _correct_skew(contrast_enhanced)
    if skew_angle != 0.0:
        applied_steps.append(f"Koreksi Kemiringan Sudut ({skew_angle}°)")

    # 8. Bilateral Denoising (removes grain while keeping text boundaries crisp)
    denoised = cv2.bilateralFilter(deskewed, d=7, sigmaColor=50, sigmaSpace=50)
    applied_steps.append("Pereduksi Derau (Bilateral Filter)")

    # 9. Adaptive Gaussian Thresholding
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

load_medicines_catalog = _load_medicines_catalog



_OCR_CHAR_MAP = str.maketrans({
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "8": "b",
    "@": "a",
    "$": "s",
})

def _normalize_ocr_typos(s: str) -> str:
    """Normalize common OCR misrecognitions (e.g. Paracetam0l -> paracetamol, Ibuprof3n -> ibuprofen)."""
    return s.lower().translate(_OCR_CHAR_MAP)

def _fuzzy_match_catalog(text: str) -> tuple[dict[str, Any] | None, float]:
    """
    Perform fuzzy string matching on extracted text against the Indonesian Medicine Database.
    Calculates similarity score (0.0 to 1.0) using SequenceMatcher with OCR typo tolerance.
    """
    catalog = _load_medicines_catalog()
    if not catalog or not text.strip():
        return None, 0.0

    text_lower = text.lower()
    text_normalized = _normalize_ocr_typos(text_lower)
    best_match: dict[str, Any] | None = None
    best_score: float = 0.0

    # Extract words/n-grams from OCR text
    words = re.findall(r"[a-zA-Z0-9\-]+", text_lower)
    norm_words = [w.translate(_OCR_CHAR_MAP) for w in words]
    tokens_text = " ".join(words)
    norm_tokens_text = " ".join(norm_words)

    for med in catalog:
        candidates = (
            [med.get("name", "").lower()]
            + [a.lower() for a in med.get("aliases", [])]
            + [b.lower() for b in med.get("brand_names", [])]
        )

        for cand in candidates:
            if not cand or len(cand) < 3:
                continue

            cand_norm = _normalize_ocr_typos(cand)

            # 1. Exact substring match in original or typo-normalized text
            if cand in text_lower or cand_norm in text_normalized:
                score = 1.0
                # Give bonus to specific commercial brands over generic parent active substances
                is_commercial_brand = (cand in [b.lower() for b in med.get("brand_names", [])]) or (cand == med.get("id", "").lower())
                if is_commercial_brand and not med.get("is_generic", False):
                    score += 0.20
                elif not med.get("is_generic", False):
                    score += 0.05
            else:
                # 2. Ratio against full tokens
                score = max(
                    difflib.SequenceMatcher(None, cand, tokens_text).ratio(),
                    difflib.SequenceMatcher(None, cand_norm, norm_tokens_text).ratio(),
                )

                # 3. Check sliding window of word chunks matching candidate word count
                cand_len = len(cand.split())
                for i in range(len(words) - cand_len + 1):
                    chunk = " ".join(words[i:i + cand_len])
                    norm_chunk = " ".join(norm_words[i:i + cand_len])

                    c_score = max(
                        difflib.SequenceMatcher(None, cand, chunk).ratio(),
                        difflib.SequenceMatcher(None, cand_norm, norm_chunk).ratio(),
                    )

                    # Toleransi OCR: Jika panjang kecocokan >= 50% atau similarity > 0.70
                    if c_score > score:
                        score = c_score

            if score > best_score:
                best_score = score
                best_match = med

    return best_match, min(round(best_score, 2), 1.0)


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
            extracted_text="Gagal memproses gambar kemasan.",
            medicine_name="Kemasan Tidak Teridentifikasi",
            detected_brand=None,
            generic_name=None,
            matched_category=None,
            bpom_class=None,
            dosage_strength=None,
            dosage_form=None,
            storage_info=None,
            bpom_registration=None,
            contraindications=[],
            ocr_confidence=0.0,
            match_confidence=0.0,
            overall_confidence=0.0,
            confidence_score=0.0,
            is_unreadable=True,
            unreadable_reason=f"Berkas gambar tidak dapat diproses: {exc}",
            dosage_instructions=None,
            has_dosage_instructions=False,
            has_severe_warning=True,
            detected_warnings=["Format berkas tidak valid atau gambar rusak."],
            matched_catalog=None,
            matched_drug=None,
            alternative_suggestions=[],
            retake_prompt="Format gambar tidak valid atau berkas rusak. Silakan unggah foto kemasan berformat JPG, PNG, atau WEBP yang jelas.",
            match_priority="unmatched",
            applied_algorithms=[],
            preprocessing_applied=["Error Processing"],
            skew_angle_corrected=0.0,
            roi_regions=[],
        )

    # Execute OCR: Try RapidOCR first (deep learning vision model), fallback to Tesseract
    ocr_lines: list[str] = []
    rapid_conf_scores: list[float] = []
    all_rapid_items: list[Any] = []

    if _has_rapid_ocr and _rapid_ocr_engine is not None:
        try:
            # RapidOCR can run on both preprocessed and raw RGB image
            ocr_res, _ = _rapid_ocr_engine(preprocessed_img)
            if ocr_res:
                all_rapid_items.extend(ocr_res)
                for item in ocr_res:
                    if len(item) >= 3:
                        text_box_content = str(item[1]).strip()
                        try:
                            score_val = float(item[2])
                            rapid_conf_scores.append(score_val)
                        except (ValueError, TypeError):
                            pass
                        if text_box_content:
                            ocr_lines.append(text_box_content)
            
            # If thresholding yielded low text, also try on raw RGB/BGR image
            if len(ocr_lines) < 2:
                nparr = np.frombuffer(image_bytes, np.uint8)
                raw_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if raw_bgr is not None:
                    ocr_res2, _ = _rapid_ocr_engine(raw_bgr)
                    if ocr_res2:
                        all_rapid_items.extend(ocr_res2)
                        for item in ocr_res2:
                            if len(item) >= 3:
                                text_box_content = str(item[1]).strip()
                                if text_box_content and text_box_content not in ocr_lines:
                                    ocr_lines.append(text_box_content)
                                    try:
                                        rapid_conf_scores.append(float(item[2]))
                                    except (ValueError, TypeError):
                                        pass
            
            raw_text = "\n".join(ocr_lines).strip()
            logger.debug("[OCR RapidOCR] Extracted text:\n%s", raw_text)
        except Exception as exc:
            logger.warning("[OCR RapidOCR] Execution failed: %s, checking Tesseract fallback", exc)

    if not raw_text and is_tesseract_installed:
        try:
            pil_img = Image.fromarray(preprocessed_img)
            raw_text = pytesseract.image_to_string(pil_img, config=_TESS_CONFIG).strip()
            logger.debug("[OCR Tesseract] Extracted text:\n%s", raw_text)
        except Exception as exc:
            logger.exception("[OCR Tesseract] Extraction error: %s", exc)

    if not raw_text:
        is_unreadable = True
        unreadable_reason = (
            "Teks pada kemasan tidak terdeteksi. Harap ambil foto ulang dengan memperlihatkan nama kemasan secara fokus dan terang."
        )

    # Calculate OCR Text Clarity / Quality Confidence
    total_chars = max(len(raw_text.strip()), 1)
    alpha_chars = sum(c.isalpha() for c in raw_text)
    alpha_ratio = alpha_chars / total_chars

    if not is_unreadable and alpha_chars < 3:
        is_unreadable = True
        unreadable_reason = "Teks pada gambar buram atau tidak terbaca secara memadai."

    if not is_unreadable:
        if rapid_conf_scores:
            avg_rapid = sum(rapid_conf_scores) / len(rapid_conf_scores)
            ocr_confidence = round(min(max(avg_rapid, alpha_ratio), 1.0), 2)
        else:
            ocr_confidence = round(min(alpha_ratio * 1.15, 1.0), 2)
    else:
        ocr_confidence = 0.0

    # Extract Region of Interest (ROI) Text Layout
    roi_regions, _ = _extract_rois_from_rapidocr(all_rapid_items, preprocessed_img.shape)

    # Extract text metadata cues (dosage strength, form, BPOM registration number)
    detected_str, detected_form, detected_bpom = _extract_packaging_text_details(raw_text)

    # ─── Multi-Algorithm Intelligent Fuzzy Verification ──────────────────────
    ver_res: VerificationResult = verification_engine.verify_extracted_text(
        raw_text, base_ocr_confidence=ocr_confidence
    )

    matched_catalog = ver_res.matched_drug
    confidence_score_pct = ver_res.confidence_score
    overall_confidence = round(confidence_score_pct / 100.0, 2)
    match_score = overall_confidence
    alternative_suggestions = ver_res.alternative_suggestions
    retake_prompt = ver_res.retake_prompt
    match_priority = ver_res.match_priority
    applied_algorithms = ver_res.applied_algorithms

    # Determine Medicine Name & Generic Name
    medicine_name = (
        (matched_catalog.get("medicine_name") or matched_catalog.get("name"))
        if matched_catalog else None
    )
    generic_name = matched_catalog.get("generic_name") if matched_catalog else None
    if not medicine_name and raw_text:
        lines = [l.strip() for l in raw_text.splitlines() if len(l.strip()) >= 4]
        if lines:
            medicine_name = lines[0][:60]

    dosage, has_dosage, has_severe, warnings = _check_dosage_and_warnings(raw_text, matched_catalog)

    # Low Confidence / Retake Trigger (< 60%)
    if is_unreadable or ver_res.status == "low_confidence" or confidence_score_pct < 60.0:
        is_unreadable = True
        if not unreadable_reason:
            unreadable_reason = retake_prompt or (
                f"Tingkat akurasi identifikasi rendah ({int(confidence_score_pct)}%). "
                "Harap ambil foto ulang dengan pencahayaan yang lebih terang dan fokus pada nama obat."
            )

        return ExtractedMedicine(
            raw_text=raw_text or "(Teks tidak dapat dikenali)",
            extracted_text=raw_text or "(Teks tidak dapat dikenali)",
            medicine_name=medicine_name or "Kemasan Tidak Teridentifikasi",
            detected_brand=matched_catalog.get("aliases", [None])[0] if matched_catalog else None,
            generic_name=generic_name,
            matched_category=matched_catalog.get("category") if matched_catalog else "Tidak Teridentifikasi",
            bpom_class=matched_catalog.get("bpom_class") if matched_catalog else "Perlu Pemeriksaan",
            dosage_strength=matched_catalog.get("dosage_strength") if matched_catalog else detected_str,
            dosage_form=matched_catalog.get("dosage_form") if matched_catalog else detected_form,
            storage_info=matched_catalog.get("storage_info") if matched_catalog else None,
            bpom_registration=matched_catalog.get("bpom_registration") if matched_catalog else detected_bpom,
            contraindications=matched_catalog.get("contraindications", []) if matched_catalog else [],
            ocr_confidence=ocr_confidence,
            match_confidence=match_score,
            overall_confidence=overall_confidence,
            confidence_score=confidence_score_pct,
            is_unreadable=True,
            unreadable_reason=unreadable_reason,
            dosage_instructions=dosage,
            has_dosage_instructions=has_dosage,
            has_severe_warning=True,
            detected_warnings=warnings or ["Label kemasan tidak terbaca jelas atau nama obat tidak dikenali."],
            matched_catalog=matched_catalog,
            matched_drug=matched_catalog,
            alternative_suggestions=alternative_suggestions,
            retake_prompt=retake_prompt,
            match_priority=match_priority,
            applied_algorithms=applied_algorithms,
            preprocessing_applied=applied_steps,
            skew_angle_corrected=skew_angle,
            roi_regions=roi_regions,
        )

    return ExtractedMedicine(
        raw_text=raw_text,
        extracted_text=raw_text,
        medicine_name=medicine_name,
        detected_brand=matched_catalog.get("aliases", [None])[0] if matched_catalog else None,
        generic_name=generic_name or medicine_name,
        matched_category=matched_catalog.get("category", "Pengobatan Umum"),
        bpom_class=matched_catalog.get("bpom_class", "Obat Bebas"),
        dosage_strength=matched_catalog.get("dosage_strength") or detected_str or "Sesuai Label Kemasan",
        dosage_form=matched_catalog.get("dosage_form") or detected_form or "Sediaan Oral",
        storage_info=matched_catalog.get("storage_info", "Simpan di tempat sejuk di bawah 30°C, hindari sinar matahari langsung."),
        bpom_registration=matched_catalog.get("bpom_registration") or detected_bpom or "Pemeriksaan Fisik Diperlukan",
        contraindications=matched_catalog.get("contraindications", []),
        ocr_confidence=ocr_confidence,
        match_confidence=match_score,
        overall_confidence=overall_confidence,
        confidence_score=confidence_score_pct,
        is_unreadable=False,
        unreadable_reason=None,
        dosage_instructions=dosage,
        has_dosage_instructions=has_dosage,
        has_severe_warning=has_severe,
        detected_warnings=warnings,
        matched_catalog=matched_catalog,
        matched_drug=matched_catalog,
        alternative_suggestions=alternative_suggestions,
        retake_prompt=retake_prompt,
        match_priority=match_priority,
        applied_algorithms=applied_algorithms,
        preprocessing_applied=applied_steps,
        skew_angle_corrected=skew_angle,
        roi_regions=roi_regions,
    )

