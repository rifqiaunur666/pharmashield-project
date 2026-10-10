"""
app/config.py
PharmaShield — Centralised settings loaded from .env.
"""

from __future__ import annotations

import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Locate and load the .env file (backend/.env)
_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / ".env")


class Settings:
    # ── Fonnte / WhatsApp ────────────────────────────────────────────────────
    fonnte_token: str        = os.getenv("FONNTE_TOKEN", "")
    wa_target_number: str   = os.getenv("WA_TARGET_NUMBER", "")

    # ── Google Gemini AI ──────────────────────────────────────────────────────
    gemini_api_key: str      = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY_HERE")

    # ── Application ──────────────────────────────────────────────────────────
    app_env: str             = os.getenv("APP_ENV", "development")
    port: int                = int(os.getenv("PORT", "8000"))

    # ── Tesseract ────────────────────────────────────────────────────────────
    tesseract_cmd: str       = os.getenv(
        "TESSERACT_CMD",
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: list[str]  = [
        o.strip()
        for o in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
        ).split(",")
        if o.strip()
    ]

    # ── Paths ────────────────────────────────────────────────────────────────
    base_dir: Path           = _BASE_DIR
    uploads_dir: Path        = _BASE_DIR / "uploads"
    data_dir: Path           = _BASE_DIR / "data"
    history_file: Path       = _BASE_DIR / "data" / "scan_history.json"
    database_dir: Path       = _BASE_DIR / "database"
    legacy_history_file: Path = _BASE_DIR / "database" / "scan_history.json"

    def is_dev(self) -> bool:
        return self.app_env.lower() in ("development", "dev")


# Singleton instance — import this everywhere
settings = Settings()

# Ensure directories and initial data files exist
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.database_dir.mkdir(parents=True, exist_ok=True)

if not settings.history_file.exists():
    # If legacy file has valid JSON, copy it; otherwise initialize empty list []
    if settings.legacy_history_file.exists():
        try:
            content = settings.legacy_history_file.read_text(encoding="utf-8").strip()
            if content:
                json.loads(content)
                settings.history_file.write_text(content, encoding="utf-8")
            else:
                settings.history_file.write_text("[]", encoding="utf-8")
        except Exception:
            settings.history_file.write_text("[]", encoding="utf-8")
    else:
        settings.history_file.write_text("[]", encoding="utf-8")
