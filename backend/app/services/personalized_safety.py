"""
app/services/personalized_safety.py
PharmaShield — Multi-Layered Drug Safety Screening & Verification Engine.

Layers:
1. Candidate Extraction & Cross-Modal Consistency Check (OCR text vs Visual features vs Packaging).
2. Official Reference Cross-Matching against BPOM Database.
3. Personalized Clinical Screening (Allergies, Interactions, Contraindications, Pregnancy/Lactation).
4. Four-State Classification (🟢 GREEN, 🟡 YELLOW, 🔴 RED, ⚪ GRAY / Unable to Verify).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


# Standard Indonesian Drug Contraindication & Interaction Rules
INTERACTION_DATABASE: list[dict[str, Any]] = [
    {
        "drug_a": "ibuprofen",
        "drug_b": "aspirin",
        "severity": "major",
        "title": "Interaksi NSAID Ganda",
        "description": "Penggunaan bersamaan meningkatkan risiko perdarahan saluran cerna dan tukak lambung.",
    },
    {
        "drug_a": "ibuprofen",
        "drug_b": "amlodipine",
        "severity": "moderate",
        "title": "Penurunan Efek Antihipertensi",
        "description": "NSAID dapat menurunkan efektivitas penurunan tekanan darah oleh Amlodipine dan membebani ginjal.",
    },
    {
        "drug_a": "paracetamol",
        "drug_b": "paracetamol",
        "severity": "critical",
        "title": "Duplikasi Zat Aktif Parasetamol",
        "description": "Risiko overdosis parasetamol dapat menyebabkan kerusakan hati fatal jika total dosis > 4000mg/hari.",
    },
    {
        "drug_a": "asam mefenamat",
        "drug_b": "ibuprofen",
        "severity": "major",
        "title": "Duplikasi Obat Golongan NSAID",
        "description": "Dua obat antiinflamasi nonsteroid tidak boleh dikonsumsi bersamaan karena risiko toksisitas lambung dan ginjal.",
    },
    {
        "drug_a": "omeprazole",
        "drug_b": "clopidogrel",
        "severity": "major",
        "title": "Penurunan Aktivasi Clopidogrel",
        "description": "Omeprazole menghambat enzim CYP2C19 sehingga menurunkan bioaktivitas antiplatelet Clopidogrel.",
    },
    {
        "drug_a": "metformin",
        "drug_b": "alkohol",
        "severity": "critical",
        "title": "Risiko Asidosis Laktat",
        "description": "Konsumsi alkohol bersama metformin sangat meningkatkan risiko asidosis laktat yang mengancam nyawa.",
    },
]

CONDITION_CONTRAINDICATIONS: list[dict[str, Any]] = [
    {
        "drug_keyword": "ibuprofen",
        "condition_keyword": "maag",
        "severity": "critical",
        "title": "Kontraindikasi Tukak Lambung / Gastritis",
        "description": "Ibuprofen merupakan NSAID yang dapat memicu perdarahan lambung hebat pada penderita sakit maag/gastritis aktif.",
    },
    {
        "drug_keyword": "ibuprofen",
        "condition_keyword": "gerd",
        "severity": "critical",
        "title": "Kontraindikasi Tukak Lambung / GERD",
        "description": "NSAID dapat memperparah iritasi mukosa lambung dan refluks asam.",
    },
    {
        "drug_keyword": "asam mefenamat",
        "condition_keyword": "maag",
        "severity": "critical",
        "title": "Kontraindikasi Gastritis / Tukak Peptik",
        "description": "Asam Mefenamat dilarang keras bagi penderita riwayat luka/tukak saluran cerna.",
    },
    {
        "drug_keyword": "asam mefenamat",
        "condition_keyword": "ginjal",
        "severity": "critical",
        "title": "Kontraindikasi Gangguan Ginjal",
        "description": "Ekskresi asam mefenamat melalui ginjal; berbahaya bagi penderita gagal ginjal.",
    },
    {
        "drug_keyword": "paracetamol",
        "condition_keyword": "hati",
        "severity": "critical",
        "title": "Kontraindikasi Gangguan Hati",
        "description": "Parasetamol dimetabolisme di hati; penderita gangguan fungsi hati berisiko hepatotoksisitas.",
    },
    {
        "drug_keyword": "dextromethorphan",
        "condition_keyword": "asma",
        "severity": "major",
        "title": "Perhatian Penderita Asma",
        "description": "Penekan batuk dapat menghambat pengeluaran dahak pada bronkus penderita asma.",
    },
    {
        "drug_keyword": "ctm",
        "condition_keyword": "glaukoma",
        "severity": "major",
        "title": "Peringatan Glaukoma Sudut Tertutup",
        "description": "Efek antikolinergik antihistamin generasi pertama dapat meningkatkan tekanan intraokular.",
    },
]


def assess_personalized_safety(
    medicine_info: dict[str, Any],
    user_medical_profile: Optional[dict[str, Any]] = None,
    image_quality_score: int = 90,
) -> dict[str, Any]:
    """
    Run comprehensive multi-step clinical screening.
    """
    profile = user_medical_profile or {}
    allergies = [a.lower().strip() for a in profile.get("allergies", [])]
    current_prescriptions = [p.lower().strip() for p in profile.get("current_prescriptions", [])]
    otc_meds = [o.lower().strip() for o in profile.get("otc_medications", [])]
    all_current_drugs = current_prescriptions + otc_meds
    conditions = [c.lower().strip() for c in profile.get("medical_conditions", [])]
    is_pregnant = bool(profile.get("pregnancy_status", False))
    is_breastfeeding = bool(profile.get("breastfeeding_status", False))
    profile_completed = bool(profile.get("profile_completed", False))

    med_name = (medicine_info.get("medicine_name") or medicine_info.get("name") or "").lower()
    ingredients = [i.lower() for i in medicine_info.get("ingredients", [])]
    raw_text = (medicine_info.get("raw_text") or "").lower()
    overall_conf = medicine_info.get("overall_confidence", 0.0)
    conf_pct = int(round(overall_conf * 100))
    bpom_class = (medicine_info.get("bpom_class") or "").lower()

    # Evidence collections
    critical_risks: list[dict[str, str]] = []
    caution_warnings: list[dict[str, str]] = []
    verification_checks: list[dict[str, Any]] = []

    # ── 1. Image Quality Check ──
    img_ok = image_quality_score >= 70
    verification_checks.append({
        "layer": "Image Quality Gate",
        "score": image_quality_score,
        "status": "PASS" if img_ok else "FAIL",
        "detail": "Kualitas visual memadai untuk analisis OCR" if img_ok else "Gambar kurang jernih atau pencahayaan minim",
    })

    # ── 2. Identity Verification & BPOM Cross-Reference ──
    has_bpom = bool(medicine_info.get("matched_catalog")) or ("bpom" in raw_text) or ("pom" in raw_text)
    is_verified_match = bool(medicine_info.get("matched_catalog")) and conf_pct >= 80

    identity_decision = "Verified Match" if is_verified_match else (
        "Ambiguous Match" if conf_pct >= 60 else "Identification Failed"
    )

    verification_checks.append({
        "layer": "Official Reference Matching (BPOM)",
        "status": "VERIFIED" if is_verified_match else "UNVERIFIED",
        "decision": identity_decision,
        "confidence": conf_pct,
        "detail": f"Terverifikasi pada basis data obat Indonesia (Skor: {conf_pct}%)" if is_verified_match else "Belum terverifikasi sempurna dengan katalog resmi",
    })

    # ── 3. Allergy Screening ──
    allergy_hit = False
    for allergy in allergies:
        if allergy and (allergy in med_name or any(allergy in ing for ing in ingredients) or allergy in raw_text):
            allergy_hit = True
            critical_risks.append({
                "type": "ALERGI_KRITIS",
                "title": f"Konflik Riwayat Alergi: '{allergy.upper()}'",
                "description": f"Obat ini mengandung atau terkait dengan '{allergy}', zat yang tercatat menimbulkan reaksi alergi pada profil medis Anda.",
                "action": "JANGAN KONSUMSI obat ini. Hubungi dokter segera jika telah tertelan.",
            })

    # ── 4. Drug-Drug Interactions ──
    for rule in INTERACTION_DATABASE:
        drug_a = rule["drug_a"].lower()
        drug_b = rule["drug_b"].lower()

        # Check if scanned drug matches drug_a and user is taking drug_b, or vice versa
        matches_a = drug_a in med_name or any(drug_a in ing for ing in ingredients)
        matches_b = any(drug_b in cur for cur in all_current_drugs)

        if matches_a and matches_b:
            item = {
                "type": "INTERAKSI_OBAT",
                "title": rule["title"],
                "description": rule["description"],
                "action": "Konsultasikan penyesuaian jadwal minum atau obat alternatif kepada dokter/apoteker.",
            }
            if rule["severity"] == "critical":
                critical_risks.append(item)
            else:
                caution_warnings.append(item)

    # ── 5. Medical Condition Contraindications ──
    for rule in CONDITION_CONTRAINDICATIONS:
        drug_kw = rule["drug_keyword"].lower()
        cond_kw = rule["condition_keyword"].lower()

        matches_drug = drug_kw in med_name or any(drug_kw in ing for ing in ingredients)
        matches_cond = any(cond_kw in c for c in conditions)

        if matches_drug and matches_cond:
            item = {
                "type": "KONTRAINDIKASI_KONDISI",
                "title": rule["title"],
                "description": rule["description"],
                "action": "Hindari konsumsi tanpa izin tertulis dari dokter penanggung jawab Anda.",
            }
            if rule["severity"] == "critical":
                critical_risks.append(item)
            else:
                caution_warnings.append(item)

    # ── 6. Pregnancy & Breastfeeding Considerations ──
    if is_pregnant:
        # Check pregnancy warnings
        if "ibuprofen" in med_name or "aspirin" in med_name or "asam mefenamat" in med_name:
            critical_risks.append({
                "type": "KONTRAINDIKASI_KEHAMILAN",
                "title": "Bahaya NSAID Trimester Kehamilan",
                "description": "NSAID dikontraindikasikan pada kehamilan trimester 3 karena risiko penutupan prematur duktus arteriosus janin.",
                "action": "Jangan dikonsumsi oleh ibu hamil.",
            })
        elif "omeprazole" in med_name or "keras" in bpom_class:
            caution_warnings.append({
                "type": "PERINGATAN_KEHAMILAN",
                "title": "Kategori Kehamilan Perlu Evaluasi Dokter",
                "description": "Obat ini memerlukan pertimbangan rasio manfaat dan risiko oleh dokter kandungan.",
                "action": "Konsultasikan dengan dokter kandungan Anda sebelum memulai konsumsi.",
            })

    if is_breastfeeding:
        if "ctm" in med_name or "dextromethorphan" in med_name:
            caution_warnings.append({
                "type": "PERINGATAN_MENYUSUI",
                "title": "Dapat Terekskresi dalam ASI",
                "description": "Kandungan obat dapat terserap ke air susu ibu dan menimbulkan efek sedasi pada bayi.",
                "action": "Diskusikan dengan apoteker mengenai alternatif yang lebih aman bagi ibu menyusui.",
            })

    # ── 7. Prescription / Severe Warning Flag ──
    if "keras" in bpom_class or medicine_info.get("has_severe_warning"):
        caution_warnings.append({
            "type": "OBAT_KERAS",
            "title": "Golongan Obat Keras (Resep Dokter)",
            "description": "Obat memiliki tanda lingkaran merah (K) dan wajib digunakan sesuai dosis resep dokter spesialis.",
            "action": "Pastikan Anda memiliki resep yang sah dari dokter untuk obat ini.",
        })

    # ── 8. Safety Decision Routing (GREEN, YELLOW, RED, GRAY) ──
    if not img_ok or conf_pct < 50 or not medicine_info.get("identified"):
        final_status = "gray"
        status_id = "Tidak Dapat Diverifikasi"
        status_emoji = "⚪"
        headline = "Unable to verify this medication reliably. Do not rely on this scan to determine whether the product is safe to use. Consult a pharmacist or qualified healthcare professional."
    elif len(critical_risks) > 0:
        final_status = "red"
        status_id = "Bahaya Kritis"
        status_emoji = "🔴"
        headline = "DO NOT USE UNTIL THE IDENTIFIED RISK HAS BEEN RESOLVED."
    elif len(caution_warnings) > 0 or conf_pct < 80 or "keras" in bpom_class:
        final_status = "yellow"
        status_id = "Perhatian Khusus"
        status_emoji = "🟡"
        headline = "Perhatian: Terdapat hal yang perlu dievaluasi lebih lanjut sebelum konsumsi."
    else:
        final_status = "green"
        status_id = "Aman Teridentifikasi"
        status_emoji = "🟢"
        headline = "No identified safety concern based on the information available."

    return {
        "final_status": final_status,           # green | yellow | red | gray
        "status_id": status_id,
        "status_emoji": status_emoji,
        "headline": headline,
        "confidence_percentage": conf_pct,
        "image_quality_score": image_quality_score,
        "identity_decision": identity_decision,
        "is_officially_verified": is_verified_match,
        "critical_risks": critical_risks,
        "caution_warnings": caution_warnings,
        "verification_checks": verification_checks,
        "profile_completed": profile_completed,
        "allergy_screen_passed": not allergy_hit,
        "interaction_screen_passed": len([r for r in critical_risks if r["type"] == "INTERAKSI_OBAT"]) == 0,
        "assessed_at": datetime.now(timezone.utc).isoformat(),
        "limitations_notice": (
            "Hasil skrining AI ini bukan merupakan pengganti nasihat medis profesional, "
            "resep dokter, atau konsultasi resmi dengan apoteker berlisensi."
        ),
    }
