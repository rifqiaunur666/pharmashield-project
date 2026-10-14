"""
app/main.py
PharmaShield — FastAPI application entrypoint.

Registers:
  - Strict CORS middleware (allows http://localhost:3000 and http://127.0.0.1:3000)
  - /api/scan-medicine   (POST)
  - /api/history         (GET, DELETE)
  - /api/history/{id}    (DELETE)
  - /api/stats           (GET)
  - Health check         (GET /)
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure the backend root is on Python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.api.endpoints import router as api_router
from app.api.ai_endpoints import router as ai_router

# ─── Logging Setup ────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.is_dev() else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("pharmashield")

# ─── FastAPI Application ──────────────────────────────────────────────────────
app = FastAPI(
    title="PharmaShield API",
    description="Medicine Packaging OCR Date Extraction, 3-Level Safety Evaluation, and WhatsApp Alerts.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── CORS Middleware ──────────────────────────────────────────────────────────
# Permissive CORS supporting localhost, Vercel deployments (*.vercel.app), and custom origins
cors_origins = list(set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "https://pharmashield-project.vercel.app",
] + settings.cors_origins))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?:\/\/.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

from app.api.reminder_endpoints import router as reminder_router, webhook_router
from app.services.scheduler_worker import scheduler_worker

@app.on_event("startup")
async def startup_event():
    await scheduler_worker.start()

@app.on_event("shutdown")
async def shutdown_event():
    await scheduler_worker.stop()

# ─── Routers ──────────────────────────────────────────────────────────────────
# Primary strict prefix: /api/scan-medicine, /api/history, /api/stats
app.include_router(api_router, prefix="/api", tags=["PharmaShield API"])

# AI Vision Scanner & Chatbot: /api/ai/scan-vision, /api/ai/chat, /api/ai/status
app.include_router(ai_router, prefix="/api", tags=["AI Vision & Chatbot"])

# Medicine Reminder & Meta WhatsApp Webhook: /api/reminders, /api/webhook
app.include_router(reminder_router, prefix="/api", tags=["Medicine Reminder Engine"])
app.include_router(webhook_router, prefix="/api", tags=["Meta WhatsApp Webhook"])

# Direct fallback without /api prefix for maximum client resilience
app.include_router(api_router, tags=["Direct Routes (Convenience)"])


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
@app.head("/", tags=["Health"])
@app.head("/health", tags=["Health"])
@app.head("/api/health", tags=["Health"])
async def root_health():
    return {
        "status": "ok",
        "service": "PharmaShield API",
        "version": "2.0.0",
        "env": settings.app_env,
        "endpoints": {
            "scan": "/api/scan-medicine",
            "history": "/api/history",
            "stats": "/api/stats",
            "docs": "/docs",
        },
    }



# ─── Dev Runner ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.port,
        reload=settings.is_dev(),
        workers=1,
    )
