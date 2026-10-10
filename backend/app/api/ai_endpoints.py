"""
app/api/ai_endpoints.py
PharmaShield — AI Vision Scanner & Chatbot API Endpoints.

POST /api/ai/scan-vision    — Analyze medicine packaging photo with Gemini Vision
POST /api/ai/chat           — Interactive chatbot consultation with drug context
GET  /api/ai/status         — Check AI service availability (API key configured?)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services.ai_service import analyze_medicine_image, chat_with_ai
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Vision & Chatbot"])


# ─── Request / Response Models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    scan_context: dict | None = None
    conversation_history: list[dict] | None = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/status", summary="Check AI service status")
async def ai_status():
    """Check whether GEMINI_API_KEY is configured and AI features are active."""
    key = settings.gemini_api_key.strip()
    is_configured = bool(key) and key != "YOUR_GEMINI_API_KEY_HERE"
    return JSONResponse(
        content={
            "ai_enabled": is_configured,
            "model": "gemini-1.5-flash",
            "features": {
                "vision_scanner": is_configured,
                "chatbot": is_configured,
            },
            "setup_url": "https://aistudio.google.com/app/apikey",
            "message": (
                "AI aktif dan siap digunakan."
                if is_configured
                else (
                    "AI belum dikonfigurasi. Tambahkan GEMINI_API_KEY pada backend/.env. "
                    "Dapatkan API key gratis di https://aistudio.google.com/app/apikey"
                )
            ),
        }
    )


@router.post("/scan-vision", summary="AI Vision: Analyze medicine packaging photo")
async def vision_scan_medicine(
    file: UploadFile = File(..., description="Foto kemasan depan obat (JPG/PNG/WEBP)"),
):
    """
    Analisis foto kemasan obat menggunakan Google Gemini Vision AI.
    Mengembalikan informasi obat, status warna keamanan, dan pertanyaan konsultasi yang disarankan.
    """
    # Validate file
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/jpg"}
    content_type = file.content_type or "image/jpeg"
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Format file tidak didukung: '{content_type}'. Gunakan JPEG, PNG, atau WEBP.",
        )

    try:
        image_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Gagal membaca file: {exc}")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="File gambar kosong.")

    if len(image_bytes) > 20 * 1024 * 1024:  # 20 MB
        raise HTTPException(status_code=413, detail="Ukuran file terlalu besar (maks. 20 MB).")

    # Analyze with Gemini Vision
    result = analyze_medicine_image(image_bytes, mime_type=content_type)

    logger.info(
        "[API AI Vision] status=%s drug=%s color=%s",
        result.get("detection_status"),
        result.get("data", {}).get("drug_name", "—") if result.get("data") else "—",
        result.get("data", {}).get("status_color", "—") if result.get("data") else "—",
    )

    return JSONResponse(content=result, status_code=200)


@router.post("/chat", summary="AI Chatbot: Interactive drug consultation")
async def chatbot_consult(request: ChatRequest):
    """
    Layani pertanyaan bebas pengguna terkait obat yang dipindai terakhir.
    Chatbot akan menjawab dengan konteks obat yang relevan menggunakan Bahasa Indonesia.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Pesan tidak boleh kosong.")

    if len(request.message) > 2000:
        raise HTTPException(status_code=400, detail="Pesan terlalu panjang (maks. 2000 karakter).")

    result = chat_with_ai(
        user_message=request.message.strip(),
        scan_context=request.scan_context,
        conversation_history=request.conversation_history,
    )

    return JSONResponse(content=result, status_code=200)
