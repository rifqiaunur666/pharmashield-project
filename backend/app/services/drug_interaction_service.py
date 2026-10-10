"""
app/services/drug_interaction_service.py
PharmaShield — Drug-Drug Interaction Analyzer & Clinical Safety Evaluator.

Provides clinical screening for combinations of 2 or more drugs, analyzing:
- Exact active ingredient duplication
- NSAID + NSAID duplicate toxicity
- Pharmacodynamic & pharmacokinetic drug-drug interactions
- Severity rating: 'Aman' (Green), 'Perhatian' (Yellow / Moderat), 'Berbahaya' (Red / Kontraindikasi)
"""

from __future__ import annotations

import re
from typing import Any, Optional
from app.services.ocr_service import load_medicines_catalog

# Clinical Interaction Knowledge Base (Indonesian Pharmacopeia & BNF Guidelines)
DRUG_INTERACTIONS_KB: list[dict[str, Any]] = [
    {
        "drug_a": "ibuprofen",
        "drug_b": "aspirin",
        "severity": "Berbahaya",
        "severity_level": "critical",
        "title": "Kombinasi Ganda NSAID / Antiplatelet",
        "mechanism": "Penghambatan COX ganda meningkatkan risiko perdarahan lambung, tukak lambung, dan perdarahan sistemik secara signifikan.",
        "recommendation": "Hindari konsumsi bersamaan. Jika membutuhkan pereda nyeri dan sedang rutin mengonsumsi aspirin, konsultasikan penggunaan Parasetamol sebagai alternatif yang lebih aman bagi lambung.",
    },
    {
        "drug_a": "ibuprofen",
        "drug_b": "asam mefenamat",
        "severity": "Berbahaya",
        "severity_level": "critical",
        "title": "Duplikasi Obat Golongan NSAID",
        "mechanism": "Keduanya merupakan antiinflamasi non-steroid (NSAID). Penggunaan bersama tidak meningkatkan efektivitas antinyeri namun melipatgandakan toksisitas ginjal dan saluran cerna.",
        "recommendation": "Gunakan salah satu saja sesuai anjuran. Jangan menduplikasi obat antinyeri golongan NSAID.",
    },
    {
        "drug_a": "paracetamol",
        "drug_b": "paracetamol",
        "severity": "Berbahaya",
        "severity_level": "critical",
        "title": "Duplikasi Zat Aktif Parasetamol",
        "mechanism": "Mengonsumsi dua produk berbeda yang sama-sama mengandung Parasetamol (misal: Sanmol + Panadol atau Panadol + Obat Flu campuran) berisiko fatal memicu overdosis hepatotoksik (kerusakan hati akut).",
        "recommendation": "Hentikan salah satu produk. Pastikan total asupan Parasetamol harian tidak melebihi 4000 mg (4 gram) untuk orang dewasa.",
    },
    {
        "drug_a": "ibuprofen",
        "drug_b": "amlodipine",
        "severity": "Perhatian",
        "severity_level": "moderate",
        "title": "Penurunan Efek Obat Antihipertensi",
        "mechanism": "NSAID seperti Ibuprofen dapat mereduksi sintesis prostaglandin ginjal yang menyebabkan retensi natrium dan cairan, sehingga menurunkan efektivitas penurunan tekanan darah oleh Amlodipine.",
        "recommendation": "Bila memerlukan antinyeri jangka pendek, gunakan Parasetamol. Jika harus mengonsumsi Ibuprofen, pantau tekanan darah secara berkala.",
    },
    {
        "drug_a": "ibuprofen",
        "drug_b": "captopril",
        "severity": "Perhatian",
        "severity_level": "moderate",
        "title": "Interaksi ACE-Inhibitor & Penurunan Fungsi Ginjal",
        "mechanism": "Kombinasi NSAID dengan ACE inhibitor dapat mengganggu hemodinamik glomerulus ginjal dan memicu hiperkalemia.",
        "recommendation": "Gunakan pereda nyeri non-NSAID atau batasi penggunaan jangka pendek di bawah pengawasan dokter.",
    },
    {
        "drug_a": "omeprazole",
        "drug_b": "clopidogrel",
        "severity": "Berbahaya",
        "severity_level": "critical",
        "title": "Penurunan Efek Proteksi Kardiovaskular Clopidogrel",
        "mechanism": "Omeprazole menghambat enzim sitokrom CYP2C19 yang dibutuhkan untuk mengaktifkan Clopidogrel menjadi metabolit aktifnya, meningkatkan risiko stroke atau serangan jantung berulang.",
        "recommendation": "Ganti PPI ke Pantoprazole yang memiliki interaksi CYP2C19 lebih rendah, atau gunakan H2 blocker (Famotidine) setelah berdiskusi dengan dokter spesialis jantung.",
    },
    {
        "drug_a": "metformin",
        "drug_b": "cimetidine",
        "severity": "Perhatian",
        "severity_level": "moderate",
        "title": "Peningkatan Kadar Metformin dalam Darah",
        "mechanism": "Cimetidine menghambat sekresi tubular ginjal metformin, meningkatkan kadar metformin plasma dan potensi hipoglikemia.",
        "recommendation": "Pertimbangkan obat maag golongan antasida atau sukralfat yang tidak memengaruhi eliminasi ginjal metformin.",
    },
    {
        "drug_a": "antasida",
        "drug_b": "ciprofloxacin",
        "severity": "Perhatian",
        "severity_level": "moderate",
        "title": "Kelasi & Kegagalan Penyerapan Antibiotik",
        "mechanism": "Kation polivalen (Aluminium & Magnesium) dalam antasida mengikat fluorokuinolon sehingga menurunkan bioavailabilitas dan penyerapan antibiotik hingga 85%.",
        "recommendation": "Beri jeda minimal 2 jam sebelum atau 4 jam setelah meminum antasida.",
    },
    {
        "drug_a": "antasida",
        "drug_b": "amoxicillin",
        "severity": "Perhatian",
        "severity_level": "minor",
        "title": "Potensi Perlambatan Penyerapan",
        "mechanism": "Perubahan pH lambung oleh antasida dapat sedikit memperlambat absorpsi amoksisilin.",
        "recommendation": "Sebaiknya berikan jarak waktu 1–2 jam antara antasida dan antibiotik.",
    },
    {
        "drug_a": "ctm",
        "drug_b": "dextromethorphan",
        "severity": "Perhatian",
        "severity_level": "moderate",
        "title": "Aditif Efek Sedasi & Depresi SSP",
        "mechanism": "Penggunaan bersamaan antihistamin generasi 1 (CTM) dan antitusif dapat meningkatkan rasa kantuk berat dan menurunkan konsentrasi.",
        "recommendation": "Hindari mengemudikan kendaraan atau mengoperasikan mesin saat mengonsumsi kombinasi ini.",
    },
    {
        "drug_a": "paracetamol",
        "drug_b": "ibuprofen",
        "severity": "Aman",
        "severity_level": "low",
        "title": "Kombinasi Sinergis Multimodal (Sesuai Aturan)",
        "mechanism": "Parasetamol bekerja di SSP sedangkan Ibuprofen bekerja secara perifer/antiinflamasi. Kedua zat ini memiliki mekanisme metabolisme berbeda dan umum diresepkan bersamaan/bergantian untuk nyeri demam berat.",
        "recommendation": "Aman dikonsumsi bersamaan atau selang-seling asalkan mematuhi dosis harian masing-masing obat dan tidak memiliki riwayat tukak lambung.",
    },
    {
        "drug_a": "antasida",
        "drug_b": "paracetamol",
        "severity": "Aman",
        "severity_level": "low",
        "title": "Tidak Ada Interaksi Merugikan Signifikan",
        "mechanism": "Antasida tidak mengganggu efektivitas antipiretik/analgesik Parasetamol secara klinis.",
        "recommendation": "Dapat dikonsumsi sesuai petunjuk kemasan masing-masing.",
    },
    {
        "drug_a": "cetirizine",
        "drug_b": "paracetamol",
        "severity": "Aman",
        "severity_level": "low",
        "title": "Aman Digunakan Bersamaan",
        "mechanism": "Cetirizine (antihistamin gen-2 non-sedatif) dan Parasetamol aman dikombinasikan untuk mengatasi gejala flu/alergi yang disertai demam atau sakit kepala.",
        "recommendation": "Minum sesuai aturan penggunaan pada kemasan.",
    },
]


def resolve_medicine_substance(query_or_name: str) -> dict[str, Any]:
    """
    Resolve user input (brand or generic name) to active substance and catalog entry.
    """
    clean_q = query_or_name.strip().lower()
    catalog = load_medicines_catalog() or []

    for med in catalog:
        name_lower = med.get("name", "").lower()
        gen_lower = med.get("generic_name", "").lower()
        aliases = [str(a).lower() for a in med.get("aliases", [])]
        brands = [str(b).lower() for b in med.get("brand_names", [])]

        if clean_q == name_lower or clean_q in aliases or clean_q in brands or clean_q == gen_lower:
            return {
                "input": query_or_name,
                "resolved_name": med.get("name"),
                "substance": gen_lower or name_lower,
                "category": med.get("category"),
                "bpom_class": med.get("bpom_class"),
                "found_in_catalog": True,
                "catalog_id": med.get("id"),
            }

    # Partial substring search in catalog
    for med in catalog:
        name_lower = med.get("name", "").lower()
        gen_lower = med.get("generic_name", "").lower()
        if clean_q in name_lower or clean_q in gen_lower:
            return {
                "input": query_or_name,
                "resolved_name": med.get("name"),
                "substance": gen_lower or name_lower,
                "category": med.get("category"),
                "bpom_class": med.get("bpom_class"),
                "found_in_catalog": True,
                "catalog_id": med.get("id"),
            }

    return {
        "input": query_or_name,
        "resolved_name": query_or_name,
        "substance": clean_q,
        "category": "Pengobatan Umum",
        "bpom_class": "Perlu Pemeriksaan",
        "found_in_catalog": False,
        "catalog_id": None,
    }


def check_drug_interactions(drug_names: list[str]) -> dict[str, Any]:
    """
    Analyze pair-wise interactions among 2 or more medicines.
    Returns overall safety status, interaction details, and medical disclaimer.
    """
    cleaned_names = [d.strip() for d in drug_names if d and d.strip()]
    if len(cleaned_names) < 2:
        return {
            "status": "Kurang Input",
            "status_code": "insufficient_input",
            "status_emoji": "ℹ️",
            "summary": "Masukkan minimal 2 nama obat untuk melakukan pengecekan interaksi.",
            "total_drugs": len(cleaned_names),
            "drugs": [],
            "interactions": [],
            "disclaimer": "Informasi ini bersifat edukatif dan bukan pengganti keputusan klinis dokter/apoteker.",
        }

    resolved_drugs = [resolve_medicine_substance(name) for name in cleaned_names]
    found_interactions: list[dict[str, Any]] = []

    # Check pair-wise combinations
    has_critical = False
    has_moderate = False

    for i in range(len(resolved_drugs)):
        for j in range(i + 1, len(resolved_drugs)):
            drug1 = resolved_drugs[i]
            drug2 = resolved_drugs[j]

            sub1 = drug1["substance"].lower()
            sub2 = drug2["substance"].lower()

            matched_rules = []

            # Check duplicate active ingredients
            if ("paracetamol" in sub1 and "paracetamol" in sub2) or (drug1["catalog_id"] and drug1["catalog_id"] == drug2["catalog_id"]):
                if drug1["input"].lower() != drug2["input"].lower():
                    matched_rules.append({
                        "drug_a": drug1["resolved_name"],
                        "drug_b": drug2["resolved_name"],
                        "severity": "Berbahaya",
                        "severity_level": "critical",
                        "title": f"Duplikasi Zat Aktif: {drug1['resolved_name']} & {drug2['resolved_name']}",
                        "mechanism": "Kedua produk mengandung zat aktif yang sama. Mengonsumsi bersamaan berisiko overdosis dan toksisitas organ.",
                        "recommendation": "Hentikan salah satu obat. Konsumsi hanya satu produk dengan zat aktif serupa.",
                    })

            # Check against KB
            for rule in DRUG_INTERACTIONS_KB:
                ra = rule["drug_a"].lower()
                rb = rule["drug_b"].lower()

                match_forward = (ra in sub1 or ra in drug1["input"].lower()) and (rb in sub2 or rb in drug2["input"].lower())
                match_reverse = (rb in sub1 or rb in drug1["input"].lower()) and (ra in sub2 or ra in drug2["input"].lower())

                if match_forward or match_reverse:
                    matched_rules.append({
                        "drug_a": drug1["resolved_name"],
                        "drug_b": drug2["resolved_name"],
                        "severity": rule["severity"],
                        "severity_level": rule["severity_level"],
                        "title": rule["title"],
                        "mechanism": rule["mechanism"],
                        "recommendation": rule["recommendation"],
                    })

            for m in matched_rules:
                if m["severity_level"] == "critical":
                    has_critical = True
                elif m["severity_level"] == "moderate":
                    has_moderate = True

                # Avoid duplicate insertion
                already = any(
                    x["title"] == m["title"] and
                    ((x["drug_a"] == m["drug_a"] and x["drug_b"] == m["drug_b"]) or (x["drug_a"] == m["drug_b"] and x["drug_b"] == m["drug_a"]))
                    for x in found_interactions
                )
                if not already:
                    found_interactions.append(m)

    # Determine Overall Safety Status
    if has_critical:
        overall_status = "Berbahaya / Kontraindikasi"
        status_code = "dangerous"
        status_emoji = "🔴"
        summary_text = "Ditemukan interaksi atau duplikasi berisiko tinggi. Kombinasi obat ini TIDAK DIANJURKAN untuk dikonsumsi bersamaan tanpa instruksi dokter."
    elif has_moderate:
        overall_status = "Perhatian / Moderat"
        status_code = "caution"
        status_emoji = "🟡"
        summary_text = "Terdapat interaksi moderat atau potensi penurunan efektivitas obat. Diperlukan penyesuaian jadwal konsumsi atau pemantauan klinis."
    elif len(found_interactions) > 0 and all(x["severity_level"] == "low" for x in found_interactions):
        overall_status = "Aman Dikonsumsi Bersamaan"
        status_code = "safe"
        status_emoji = "🟢"
        summary_text = "Kombinasi obat ini diketahui aman dikonsumsi bersamaan berdasarkan panduan klinis dan literatur farmasi resmi."
    else:
        overall_status = "Tidak Ditemukan Interaksi Signifikan"
        status_code = "safe"
        status_emoji = "🟢"
        summary_text = "Berdasarkan basis data farmasi PharmaShield, tidak ditemukan interaksi berbahaya langsung antara obat-obatan yang Anda pilih. Tetap patuhi dosis aturan pakai."

    return {
        "status": overall_status,
        "status_code": status_code,
        "status_emoji": status_emoji,
        "summary": summary_text,
        "total_drugs": len(resolved_drugs),
        "drugs": resolved_drugs,
        "interactions": found_interactions,
        "disclaimer": (
            "PERINGATAN MEDIS: Fitur pengecekan interaksi obat ini bersifat informatif dan edukatif. "
            "Hasil skrining ini tidak menggantikan penilaian profesional dari dokter atau apoteker. "
            "Jangan mengubah atau menghentikan terapi obat resep tanpa petunjuk dokter yang merawat Anda."
        ),
    }
