"""
app/services/ai_service.py
PharmaShield — AI Vision Scanner & Interactive Chatbot Engine.

Powered by Google Gemini API:
  - Module 1: Vision Scanner → Analyze medicine packaging photo → Structured JSON
  - Module 2: Interactive Chatbot → Context-aware drug consultation in Indonesian
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import warnings
from typing import Any

# Filter deprecated SDK notice from cluttering log streams
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", message=".*google.generativeai.*")

import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)

# ─── Gemini Model Configuration ──────────────────────────────────────────────
_VISION_MODEL = "gemini-1.5-flash"
_CHAT_MODEL   = "gemini-1.5-flash"

# ─── Safety Settings for Medical Content ─────────────────────────────────────
_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT",       "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH",      "threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","threshold": "BLOCK_NONE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT","threshold": "BLOCK_NONE"},
]

# ─── Vision Scanner System Prompt ────────────────────────────────────────────
_VISION_SYSTEM_PROMPT = """
Anda adalah "MedikaGuard AI", sistem AI Pakar Farmasi, OCR Vision Analisis Kemasan Obat, dan Verifikator Produk Kesehatan berbasis BPOM Indonesia.

TUGAS UTAMA:
Menganalisis foto kemasan obat/produk kesehatan yang diunggah, mengekstrak data teks serta atribut visualnya, melakukan pencocokan cerdas (fuzzy matching) dengan database obat terdaftar di Indonesia, dan mengembalikan hasil analisis keamanan produk secara akurat.

==================================================
1. ALUR PENALARAN & KLASIFIKASI KEAMANAN (SAFETY LOGIC)
==================================================

Lakukan analisis visual dan identifikasi dengan urutan aturan berikut:

[KATEGORI 1: AMAN / VERIFIKASI TINGGI (GREEN STATUS)]
- Syarat Utama: Merek, zat aktif, atau nama produk dikenali sebagai obat/produk kesehatan legal yang umum dan terdaftar resmi di Indonesia (BPOM).
- Cakupan Produk Termasuk (namun tidak terbatas pada):
  * Obat Bebas & Bebas Terbatas: Paracetamol, Ibuprofen, Antasida, Promag, Bodrex, Panadol, Oskadon, Mixagrip, Procold, Decolgen, Diapet, Entrostop, Siladex, OBH, CTM, Cetirizine, Asam Mafenamat, Amoxicillin, dll.
  * Herbal / Jamu Terstandar / OHT / Fitofarmaka: Tolak Angin, Antangin, Herbakof, Laxing, Sangobion, dll.
  * Antiseptik & Perawatan Luar: Betadine, Kalpanax, Salep 88, Hansaplast, Counterpain, Salonpas, dll.
  * Vitamin & Suplemen: Enervon-C, Vitacimin, Renovit, CDR, Ester-C, Imboost, Hemaviton, dll.
- Kriteria Visual: Teks merek/zat aktif terbaca jelas, atau minimal 50% huruf dari nama produk utama dapat diidentifikasi secara pasti.
- Confidence Score: 80% - 100%.
- status_keamanan: "AMAN"

[KATEGORI 2: PERLU HATI-HATI / WASPADA (YELLOW STATUS)]
- Syarat Utama: 
  * Nama/merek obat kurang dikenal luas, obat impor tanpa label bahasa Indonesia yang jelas, atau produk obat keras khusus yang membutuhkan resep dokter secara ketat.
  * Kualitas foto terdistorsi (sedikit buram, terpotong, atau terkena pantulan cahaya), namun konteks visual (seperti potongan kata, bentuk blister/botol, atau indikasi dosis misal '500 mg') memberikan petunjuk kuat mengenai identitas obat.
- Confidence Score: 50% - 79%.
- status_keamanan: "PERLU HATI-HATI"

[KATEGORI 3: TIDAK TERIDENTIFIKASI / BAHAYA (RED STATUS)]
- Syarat Utama: Foto sama sekali tidak menampilkan kemasan obat, objek tidak relevan, atau foto buram total (blur 100%) sehingga tidak ada satu pun kata/angka yang dapat diekstrak.
- Confidence Score: 0% - 49%.
- status_keamanan: "TIDAK TERIDENTIFIKASI"

==================================================
2. INSTRUKSI EKSTRAKSI & TOLERANSI OCR (FUZZY MATCHING)
==================================================
- JANGAN PERNAH mengembalikan "Kemasan Tidak Teridentifikasi" jika pada gambar masih terdapat teks nama produk, bentuk sediaan, atau merek obat yang umum di Indonesia.
- Toleransi ejaan minor akibat pantulan cahaya (contoh: "Paracetam0l" -> Paracetamol, "Ibuprof3n" -> Ibuprofen, "Pr0mag" -> Promag).
- Jika nama merek tidak terbaca penuh tetapi zat aktifnya terlihat (misal: "Mefenamic Acid 500mg"), langsung kategorikan sebagai AMAN dan kelompokkan ke obat antinyeri/generic.

==================================================
3. FORMAT OUTPUT (STRICT JSON ONLY)
==================================================
Kembalikan respon HANYA dalam format JSON valid tanpa tanda markdown pembungkus (tanpa ```json ... ```) atau teks lainnya:

{
  "status_keamanan": "AMAN",
  "confidence_score": 95,
  "nama_produk": "Panadol Extra",
  "nama_generik": "Paracetamol 500 mg, Caffeine 65 mg",
  "golongan_bpom": "Obat Bebas",
  "kekuatan_dosis": "500 mg / 65 mg per kaplet",
  "bentuk_sediaan": "Kaplet",
  "nomor_registrasi_bpom": "Terdaftar Resmi BPOM (DBLxxxxx)",
  "status_registrasi": "Terverifikasi",
  "indikasi_medis": "Meredakan sakit kepala, sakit gigi, dan demam yang disertai nyeri.",
  "aturan_penggunaan": "Dewasa dan anak >12 tahun: 1 kaplet 3-4 kali sehari sesudah makan. Maksimal 8 kaplet dalam 24 jam.",
  "kandungan_zat_aktif": "Paracetamol, Caffeine",
  "informasi_penyimpanan": "Simpan di bawah suhu 30°C, hindari sinar matahari langsung dan jangkauan anak-anak.",
  "peringatan_keselamatan": "Tidak dianjurkan untuk penderita penderita penyakit hati berat dan hipersensitif terhadap paracetamol."
}
"""

# ─── Chatbot System Prompt Template ──────────────────────────────────────────
_CHATBOT_SYSTEM_TEMPLATE = """
Kamu adalah Asisten Konsultasi Kesehatan Digital MedikaGuard yang empatik, ramah, dan profesional.

KONTEKS OBAT YANG SEDANG DIKONSULTASIKAN:
- Nama Obat    : {drug_name}
- Zat Aktif    : {active_ingredient}
- Kategori     : {drug_category}
- Status       : {status_color} — {status_label}

PERANMU:
Bantu pengguna memahami obat tersebut secara mendalam dan aman. Jawab APA SAJA yang relevan:
dosis, aturan pakai, efek samping, interaksi obat/makanan, pantangan, cara penyimpanan, dll.

ATURAN WAJIB:
1. Selalu gunakan Bahasa Indonesia yang empatik, ramah, dan mudah dipahami masyarakat awam.
2. Setiap jawaban WAJIB diakhiri dengan disclaimer:
   "ℹ️ Informasi ini bersifat edukasi. Selalu konsultasikan dengan dokter atau apoteker untuk penanganan medis yang tepat."
3. Jika obat berstatus MERAH (Obat Keras/Antibiotik), SELALU ingatkan:
   "⚠️ Obat ini termasuk Obat Keras. Jangan membeli atau mengonsumsinya tanpa resep dokter untuk mencegah resistensi obat dan efek samping berbahaya."
4. DILARANG mendiagnosis penyakit pengguna.
5. DILARANG merekomendasikan merk dagang lain di luar konteks.
6. Jawaban singkat, terstruktur, dan menggunakan poin-poin bila perlu.
"""


def _sanitize_error_message(msg: str) -> str:
    """Ensure no API keys, tokens, or private credentials are leaked in error responses."""
    if not msg:
        return "Unknown error"
    # Redact Google API key patterns (AIzaSy...)
    redacted = re.sub(r"AIza[0-9A-Za-z\-_]{35}", "[REDACTED_API_KEY]", msg)
    # Redact query parameters like ?key=... or &key=...
    redacted = re.sub(r"[?&]key=[^&\s'\"]+", "?key=[REDACTED]", redacted)
    return redacted


def _configure_gemini() -> bool:
    """Configure Gemini API key. Returns True if key is available."""
    api_key = (os.getenv("GEMINI_API_KEY") or settings.gemini_api_key or "").strip()
    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        logger.info("[AI] GEMINI_API_KEY not configured. Features requiring AI will notify user.")
        return False
    try:
        genai.configure(api_key=api_key)
        return True
    except Exception as exc:
        logger.error("[AI] Failed to configure Gemini API: %s", _sanitize_error_message(str(exc)))
        return False


# ─── Module 1: Vision Scanner ─────────────────────────────────────────────────

def analyze_medicine_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    """
    Analyze medicine packaging image using Gemini Vision.
    Returns structured JSON with drug info, safety color, and suggested questions.
    """
    if not image_bytes:
        return _failed_detection("File gambar kosong atau tidak valid.")

    if not _configure_gemini():
        return _response_api_key_missing()

    try:
        model = genai.GenerativeModel(
            model_name=_VISION_MODEL,
            safety_settings=_SAFETY_SETTINGS,
            system_instruction=_VISION_SYSTEM_PROMPT,
        )

        image_part = {
            "mime_type": mime_type,
            "data": image_bytes,
        }

        response = model.generate_content(
            [
                image_part,
                "Analisis kemasan obat dalam gambar ini dan kembalikan JSON terstruktur sesuai format yang ditentukan.",
            ],
            request_options={"timeout": 30.0},
        )

        # Check if response candidates exist
        if not response.candidates:
            block_reason = getattr(response.prompt_feedback, "block_reason", None)
            logger.warning("[AI Vision] No response candidate returned. Block reason: %s", block_reason)
            return _failed_detection(
                "AI tidak dapat memberikan hasil analisis untuk gambar ini (kebijakan keamanan konten atau gambar buram)."
            )

        try:
            raw_text = response.text.strip()
        except ValueError as val_err:
            logger.warning("[AI Vision] response.text extraction error: %s", val_err)
            return _failed_detection(
                "Respons AI diblokir oleh filter keamanan atau tidak menghasilkan teks."
            )

        if not raw_text:
            logger.warning("[AI Vision] Empty response text from Gemini API")
            return _failed_detection("Respons AI kosong. Coba ambil foto ulang dengan kemasan terlihat jelas.")

        logger.debug("[AI Vision] Raw response:\n%s", raw_text)

        # Extract JSON from response (remove markdown code fences if present)
        clean_text = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
        clean_text = re.sub(r"\s*```$", "", clean_text, flags=re.MULTILINE).strip()

        json_match = re.search(r"\{.*\}", clean_text, re.DOTALL)
        if not json_match:
            logger.warning("[AI Vision] Could not find valid JSON in response: %s", clean_text[:200])
            return _failed_detection("Respons AI tidak menghasilkan format JSON yang valid. Coba foto ulang.")

        result = json.loads(json_match.group())

        if not isinstance(result, dict):
            logger.warning("[AI Vision] Invalid JSON schema returned: %s", result)
            return _failed_detection("Format data yang diterima dari AI tidak sesuai standar.")

        # Check if direct new schema (status_keamanan, nama_produk, etc.) is returned
        if "status_keamanan" in result or "nama_produk" in result:
            status_raw = str(result.get("status_keamanan", "AMAN")).upper()
            if "AMAN" in status_raw or "HIJAU" in status_raw or "GREEN" in status_raw:
                color = "Hijau"
                label = "Aman (Bebas)"
            elif "HATI" in status_raw or "WASPADA" in status_raw or "KUNING" in status_raw or "YELLOW" in status_raw:
                color = "Kuning"
                label = "Hati-hati (Perhatikan Dosis/Resep)"
            else:
                color = "Merah"
                label = "Tidak Teridentifikasi / Berbahaya"

            prod_name = result.get("nama_produk") or "Obat Terdeteksi"
            active_ing = result.get("kandungan_zat_aktif") or result.get("nama_generik") or "-"
            desc = result.get("indikasi_medis") or "Informasi kemasan produk kesehatan terdaftar."
            warning = result.get("peringatan_keselamatan") or "Gunakan sesuai aturan pakai."

            # Construct normalized response that satisfies both the strict JSON schema and legacy consumers
            normalized_result = {
                "detection_status": "SUCCESS" if color != "Merah" else "SUCCESS",
                "status_keamanan": result.get("status_keamanan", "AMAN"),
                "confidence_score": result.get("confidence_score", 95),
                "nama_produk": prod_name,
                "nama_generik": result.get("nama_generik") or active_ing,
                "golongan_bpom": result.get("golongan_bpom") or "Obat Bebas",
                "kekuatan_dosis": result.get("kekuatan_dosis") or "-",
                "bentuk_sediaan": result.get("bentuk_sediaan") or "Sediaan Obat",
                "nomor_registrasi_bpom": result.get("nomor_registrasi_bpom") or "Terdaftar Resmi BPOM",
                "status_registrasi": result.get("status_registrasi") or "Terverifikasi",
                "indikasi_medis": desc,
                "aturan_penggunaan": result.get("aturan_penggunaan") or "-",
                "kandungan_zat_aktif": active_ing,
                "informasi_penyimpanan": result.get("informasi_penyimpanan") or "Simpan di bawah suhu 30°C.",
                "peringatan_keselamatan": warning,
                "data": {
                    "drug_name": prod_name,
                    "active_ingredient": active_ing,
                    "drug_category": result.get("golongan_bpom") or "Obat Bebas",
                    "status_color": color,
                    "status_label": label,
                    "description": desc,
                    "quick_warning": warning,
                    "confidence_score": result.get("confidence_score", 95),
                    "dosage_strength": result.get("kekuatan_dosis") or "-",
                    "dosage_form": result.get("bentuk_sediaan") or "Sediaan Obat",
                    "bpom_registration": result.get("nomor_registrasi_bpom") or "Terdaftar Resmi BPOM",
                    "bpom_status": result.get("status_registrasi") or "Terverifikasi",
                    "usage": result.get("aturan_penggunaan") or "-",
                    "storage_info": result.get("informasi_penyimpanan") or "Simpan di bawah suhu 30°C.",
                    "suggested_questions": [
                        f"Bagaimana aturan minum {prod_name} yang benar?",
                        f"Apakah ada efek samping dari {active_ing}?",
                        f"Kapan waktu terbaik mengonsumsi {prod_name}?",
                    ],
                },
                "error_message": None,
            }
            logger.info(
                "[AI Vision] PharmaShield AI schema parsed: %s | Status: %s (%s)",
                prod_name,
                result.get("status_keamanan"),
                color,
            )
            return normalized_result

        if "detection_status" not in result:
            logger.warning("[AI Vision] Invalid JSON schema returned: %s", result)
            return _failed_detection("Format data yang diterima dari AI tidak sesuai standar.")

        logger.info(
            "[AI Vision] Detection: %s | Drug: %s | Status: %s",
            result.get("detection_status"),
            result.get("data", {}).get("drug_name", "N/A") if result.get("data") else "N/A",
            result.get("data", {}).get("status_color", "N/A") if result.get("data") else "N/A",
        )
        return result

    except json.JSONDecodeError as exc:
        logger.error("[AI Vision] JSON parse error: %s", exc)
        return _failed_detection("Gagal memproses struktur data AI. Coba foto ulang dengan pencahayaan lebih baik.")
    except Exception as exc:
        sanitized = _sanitize_error_message(str(exc))
        logger.exception("[AI Vision] Unexpected error: %s", sanitized)
        if "timed out" in sanitized.lower() or "deadline" in sanitized.lower():
            return _failed_detection("Waktu pemrosesan AI habis (timeout). Silakan periksa koneksi dan coba lagi.")
        return _failed_detection(f"Terjadi kesalahan saat menganalisis gambar: {sanitized[:120]}")


# ─── Module 2: Interactive Chatbot ───────────────────────────────────────────

def chat_with_ai(
    user_message: str,
    scan_context: dict | None,
    conversation_history: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Process a user message in the context of the last medicine scan.
    Returns AI response for interactive chatbot widget.
    """
    if not _configure_gemini():
        return {
            "success": False,
            "reply": (
                "⚠️ Fitur Chatbot AI belum aktif karena GEMINI_API_KEY belum dikonfigurasi.\n\n"
                "Tambahkan `GEMINI_API_KEY` pada file `backend/.env` untuk mengaktifkan chatbot konsultasi."
            ),
            "requires_api_key": True,
        }

    # Build system context from last scan result
    drug_name = "Obat yang Dipindai"
    active_ingredient = "Tidak diketahui"
    drug_category = "Tidak diketahui"
    status_color = "Tidak diketahui"
    status_label = "Tidak diketahui"

    if scan_context:
        data = scan_context.get("data") or scan_context
        drug_name         = data.get("drug_name")         or scan_context.get("drug_name", drug_name)
        active_ingredient = data.get("active_ingredient") or scan_context.get("active_ingredient", active_ingredient)
        drug_category     = data.get("drug_category")     or scan_context.get("drug_category", drug_category)
        status_color      = data.get("status_color")      or scan_context.get("status_color", status_color)
        status_label      = data.get("status_label")      or scan_context.get("status_label", status_label)

    system_prompt = _CHATBOT_SYSTEM_TEMPLATE.format(
        drug_name=drug_name,
        active_ingredient=active_ingredient,
        drug_category=drug_category,
        status_color=status_color,
        status_label=status_label,
    )

    try:
        model = genai.GenerativeModel(
            model_name=_CHAT_MODEL,
            safety_settings=_SAFETY_SETTINGS,
            system_instruction=system_prompt,
        )

        # Build conversation history for multi-turn context
        gemini_history = []
        if conversation_history:
            for turn in conversation_history[-10:]:  # Keep last 10 turns for context
                role = "user" if turn.get("role") == "user" else "model"
                content = str(turn.get("content", "")).strip()
                if content:
                    gemini_history.append({"role": role, "parts": [content]})

        chat = model.start_chat(history=gemini_history)
        response = chat.send_message(user_message, request_options={"timeout": 30.0})

        if not response.candidates:
            return {
                "success": False,
                "reply": "Maaf, pesan Anda tidak dapat dijawab karena kebijakan keamanan konten.",
            }

        try:
            reply_text = response.text.strip()
        except ValueError:
            return {
                "success": False,
                "reply": "Maaf, tanggapan AI tidak dapat ditampilkan karena filter keamanan.",
            }

        if not reply_text:
            return {
                "success": False,
                "reply": "Maaf, AI tidak memberikan balasan teks. Silakan ajukan pertanyaan lain.",
            }

        logger.info("[AI Chat] User: %s... | Reply length: %d", user_message[:40], len(reply_text))

        return {
            "success": True,
            "reply": reply_text,
            "drug_context": {
                "drug_name": drug_name,
                "active_ingredient": active_ingredient,
                "status_color": status_color,
            },
        }

    except Exception as exc:
        sanitized = _sanitize_error_message(str(exc))
        logger.exception("[AI Chat] Error: %s", sanitized)
        if "timed out" in sanitized.lower() or "deadline" in sanitized.lower():
            return {
                "success": False,
                "reply": "Waktu respon habis (timeout). Silakan periksa koneksi internet Anda dan coba lagi.",
            }
        return {
            "success": False,
            "reply": f"Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Silakan coba lagi. ({sanitized[:80]})",
        }


# ─── Response Helpers ─────────────────────────────────────────────────────────

def _failed_detection(error_msg: str) -> dict[str, Any]:
    return {
        "detection_status": "FAILED",
        "data": None,
        "error_message": error_msg,
    }


def _response_api_key_missing() -> dict[str, Any]:
    """Return when GEMINI_API_KEY is not configured — instructs user to add key."""
    return {
        "detection_status": "FAILED",
        "data": None,
        "error_message": (
            "Fitur Google Gemini AI belum aktif karena GEMINI_API_KEY belum dikonfigurasi. "
            "Tambahkan GEMINI_API_KEY pada file backend/.env untuk mengaktifkan AI Vision Scanner. "
            "Dapatkan API key di https://aistudio.google.com/app/apikey"
        ),
        "requires_api_key": True,
    }
