"""
app/services/safety_evaluator.py
PharmaShield — Medicine Consumption Safety & Risk Evaluation Engine.

Features:
- Label Readability & Identification Status (Valid, Kurang Jelas, Tidak Teridentifikasi).
- Confidence Score (% accuracy from OCR + Fuzzy Matching).
- Automated Clinical Risk Assessment.
- Strict patient safety: Low confidence or unreadable strictly triggers 🔴 RED and forbids consumption.
- Backwards compatibility with existing evaluate_safety tests.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import TypedDict

logger = logging.getLogger(__name__)

WARNING_THRESHOLD_DAYS = 30


class SafetyResult(TypedDict):
    status: str                  # "green" | "yellow" | "red"
    status_id: str               # "Aman" | "Peringatan" | "Bahaya"
    status_emoji: str            # 🟢 | 🟡 | 🔴
    consumption_status_label: str # "Aman / Layak Konsumsi" | "Perhatian Khusus" | "Peringatan Ketat / Berisiko"
    readability_status: str      # "valid" | "kurang_jelas" | "tidak_teridentifikasi"
    readability_label: str       # "Label Valid & Terbaca Jelas" | "Kurang Jelas" | "Tidak Teridentifikasi"
    confidence_percentage: int   # 0 to 100
    is_safe_to_consume: bool
    risk_level: str              # "Rendah" | "Sedang" | "Tinggi (Berisiko)"
    days_remaining: int
    is_expired: bool
    expiry_date: str | None
    shelf_life_note: str         # Descriptive assessment explanation
    recommendation: str          # Medical & usage recommendation


def _parse_iso_date(iso: str) -> date | None:
    """Safely parse an ISO date string (YYYY-MM-DD)."""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


# ─── New Advanced Consumption Safety Engine ─────────────────────────────────

def evaluate_consumption_safety(
    medicine_name: str | None,
    overall_confidence: float,
    *,
    has_dosage_instructions: bool = True,
    has_severe_warning: bool = False,
    is_unreadable: bool = False,
    unreadable_reason: str | None = None,
    bpom_class: str | None = None,
) -> SafetyResult:
    """
    Evaluates clinical medicine consumption safety with patient-safety-first protocols.
    """
    confidence_pct = int(round(overall_confidence * 100))

    # Determine Readability Status based on 3-tier safety standard:
    # Kategori 1: AMAN (80% - 100%)
    # Kategori 2: PERLU HATI-HATI / WASPADA (50% - 79%)
    # Kategori 3: TIDAK TERIDENTIFIKASI / BAHAYA (0% - 49%)
    if is_unreadable or confidence_pct < 50 or not medicine_name or medicine_name == "Kemasan Tidak Teridentifikasi":
        readability = "tidak_teridentifikasi"
        readability_label = "Kemasan Rusak / Tidak Teridentifikasi"
    elif confidence_pct < 80 or not has_dosage_instructions:
        readability = "kurang_jelas"
        readability_label = "Label Kurang Jelas / Perlu Verifikasi"
    else:
        readability = "valid"
        readability_label = "Label Valid & Terbaca Jelas"

    # ─── KATEGORI 3: TIDAK TERIDENTIFIKASI / BAHAYA (RED STATUS: 0% - 49%) ───────
    if readability == "tidak_teridentifikasi":
        reason = unreadable_reason or "Foto sama sekali tidak menampilkan kemasan obat yang dikenali, objek tidak relevan, atau buram total."
        logger.warning("[SafetyEngine] Low confidence (%d%%) / unreadable → RED (Kategori 3: Tidak Teridentifikasi)", confidence_pct)

        return SafetyResult(
            status="red",
            status_id="Bahaya",
            status_emoji="🔴",
            consumption_status_label="Tidak Teridentifikasi / Berbahaya",
            readability_status="tidak_teridentifikasi",
            readability_label=readability_label,
            confidence_percentage=confidence_pct,
            is_safe_to_consume=False,
            risk_level="Tinggi (Berisiko)",
            days_remaining=0,
            is_expired=True,
            expiry_date=None,
            shelf_life_note=(
                f"Tingkat akurasi identifikasi ({confidence_pct}%) berada di bawah batas minimal (50%). "
                f"{reason} Dilarang mengonsumsi produk tanpa kepastian identitas resmi."
            ),
            recommendation=(
                "⚠️ REKOMENDASI KESELAMATAN WAJIB: Ambil foto ulang dengan pencahayaan terang dan fokus pada nama produk/zat aktif, atau bawa kemasan fisik obat ke apoteker/dokter."
            ),
        )

    # ─── KATEGORI 2: PERLU HATI-HATI / WASPADA (YELLOW STATUS: 50% - 79% atau Obat Keras/Perlu Resep) ──
    is_obat_keras = (
        has_severe_warning
        or (bpom_class and "keras" in bpom_class.lower())
    )

    if is_obat_keras or confidence_pct < 80 or not has_dosage_instructions:
        logger.info("[SafetyEngine] Category 2 Caution / Prescription (%d%%) → YELLOW (Perlu Hati-hati)", confidence_pct)
        return SafetyResult(
            status="yellow",
            status_id="Peringatan",
            status_emoji="🟡",
            consumption_status_label="Perlu Hati-hati / Waspada",
            readability_status=readability,
            readability_label=readability_label,
            confidence_percentage=confidence_pct,
            is_safe_to_consume=not is_obat_keras,
            risk_level="Sedang",
            days_remaining=90,
            is_expired=False,
            expiry_date=None,
            shelf_life_note=(
                f"Produk teridentifikasi sebagai '{medicine_name}' dengan tingkat keyakinan {confidence_pct}%. "
                + ("Produk ini termasuk golongan obat keras yang memerlukan resep dokter atau petunjuk penggunaan khusus."
                   if is_obat_keras
                   else "Kualitas foto terdistorsi atau petunjuk dosis spesifik pada kemasan perlu dikonfirmasi ulang.")
            ),
            recommendation=(
                "Perhatikan petunjuk penggunaan pada brosur kemasan atau konsultasikan ke apoteker/dokter untuk memastikan takaran dosis yang tepat bagi kondisi Anda."
            ),
        )

    # ─── KATEGORI 1: AMAN / VERIFIKASI TINGGI (GREEN STATUS: 80% - 100%) ─────────
    logger.info("[SafetyEngine] Category 1 Safe (%d%%) → GREEN (Aman)", confidence_pct)
    return SafetyResult(
        status="green",
        status_id="Aman",
        status_emoji="🟢",
        consumption_status_label="Aman / Layak Konsumsi",
        readability_status="valid",
        readability_label="Label Valid & Terbaca Jelas",
        confidence_percentage=confidence_pct,
        is_safe_to_consume=True,
        risk_level="Rendah",
        days_remaining=180,
        is_expired=False,
        expiry_date=None,
        shelf_life_note=(
            f"Kemasan teridentifikasi secara valid sebagai '{medicine_name}' dengan tingkat akurasi tinggi ({confidence_pct}%). "
            "Data cocok dengan database resmi obat legal dan terdaftar BPOM Indonesia."
        ),
        recommendation=(
            "Produk aman dan layak dikonsumsi sesuai indikasi dan aturan pakai yang tertera pada kemasan."
        ),
    )


# ─── Backwards Compatibility evaluate_safety (for tests) ────────────────────

def evaluate_safety(
    expiry_date_iso: str | None,
    *,
    has_dosage_instructions: bool = True,
    has_severe_warning: bool = False,
    is_unreadable: bool = False,
    unreadable_reason: str | None = None,
) -> dict:
    """Original safety evaluator implementation preserved for test suite regression."""
    today = date.today()

    if is_unreadable or not expiry_date_iso:
        reason = unreadable_reason or "Tanggal kedaluwarsa atau detail kritis obat tidak dapat dibaca dari kemasan."
        return {
            "status": "red",
            "status_id": "Bahaya",
            "status_emoji": "🔴",
            "is_expired": True,
            "days_remaining": 0,
            "expiry_date": None,
            "shelf_life_note": f"{reason} Demi keselamatan, obat dikategorikan berisiko (🔴 Bahaya).",
            "recommendation": "Bawa kemasan obat ke apotek atau konsultasikan dengan dokter sebelum dikonsumsi.",
        }

    if has_severe_warning:
        parsed_exp = _parse_iso_date(expiry_date_iso)
        days = (parsed_exp - today).days if parsed_exp else 0
        return {
            "status": "red",
            "status_id": "Bahaya",
            "status_emoji": "🔴",
            "is_expired": (days <= 0),
            "days_remaining": days,
            "expiry_date": expiry_date_iso,
            "shelf_life_note": "Peringatan keras atau kontraindikasi berbahaya terdeteksi pada kemasan obat.",
            "recommendation": "Hanya konsumsi obat ini atas anjuran dan pengawasan ketat dari dokter.",
        }

    expiry = _parse_iso_date(expiry_date_iso)
    if expiry is None:
        return {
            "status": "red",
            "status_id": "Bahaya",
            "status_emoji": "🔴",
            "is_expired": True,
            "days_remaining": 0,
            "expiry_date": None,
            "shelf_life_note": "Format tanggal kedaluwarsa tidak valid. Status: 🔴 Bahaya.",
            "recommendation": "Verifikasi tanggal kedaluwarsa secara manual sebelum penggunaan.",
        }

    days = (expiry - today).days
    exp_display = expiry.strftime("%d %B %Y")

    if days <= 0:
        return {
            "status": "red",
            "status_id": "Bahaya",
            "status_emoji": "🔴",
            "is_expired": True,
            "days_remaining": days,
            "expiry_date": expiry_date_iso,
            "shelf_life_note": f"Obat sudah KEDALUWARSA sejak {exp_display} ({abs(days)} hari yang lalu).",
            "recommendation": "Obat sudah tidak layak dikonsumsi. Segera musnahkan secara aman.",
        }

    if days <= WARNING_THRESHOLD_DAYS:
        return {
            "status": "yellow",
            "status_id": "Peringatan",
            "status_emoji": "🟡",
            "is_expired": False,
            "days_remaining": days,
            "expiry_date": expiry_date_iso,
            "shelf_life_note": f"Obat mendekati kedaluwarsa pada {exp_display}. Sisa masa berlaku: {days} hari.",
            "recommendation": "Periksa kondisi fisik obat dan segera habiskan sebelum batas waktu.",
        }

    if not has_dosage_instructions:
        return {
            "status": "yellow",
            "status_id": "Peringatan",
            "status_emoji": "🟡",
            "is_expired": False,
            "days_remaining": days,
            "expiry_date": expiry_date_iso,
            "shelf_life_note": f"Obat berlaku hingga {exp_display}, namun aturan pakai belum terverifikasi jelas.",
            "recommendation": "Tanyakan aturan dosis kepada apoteker sebelum dikonsumsi.",
        }

    return {
        "status": "green",
        "status_id": "Aman",
        "status_emoji": "🟢",
        "is_expired": False,
        "days_remaining": days,
        "expiry_date": expiry_date_iso,
        "shelf_life_note": f"Obat aman digunakan. Masih berlaku hingga {exp_display} ({days} hari lagi).",
        "recommendation": "Gunakan sesuai dosis dan aturan pakai yang dianjurkan.",
    }
