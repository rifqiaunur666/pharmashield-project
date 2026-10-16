"""
app/services/auth_service.py
PharmaShield — User Authentication with SQLite persistence.

Storage strategy (dual-layer):
  PRIMARY  → SQLite DB  (pharmashield_users.db) — survives restarts & redeploys
  FALLBACK → JSON file  (users.json) — used when DB unavailable, migrated on startup

Password hashing: Python stdlib hashlib.pbkdf2_hmac (zero external dependency).
Legacy passlib hashes ($pbkdf2-sha256$...) are verified transparently via fallback.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from jose import JWTError, jwt
from pydantic import BaseModel, Field, field_validator

from app.config import settings

logger = logging.getLogger(__name__)

# ─── Password Hashing (Python stdlib — zero external deps) ────────────────────
_ITERATIONS = 260_000  # OWASP 2023 minimum

def get_password_hash(password: str) -> str:
    """Hash password with PBKDF2-SHA256 (stdlib). Always uses a fresh random salt."""
    salt = os.urandom(32)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"pbkdf2sha256${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(plain: str, stored_hash: str) -> bool:
    """Timing-safe password verification. Supports new stdlib format and legacy passlib format."""
    if not stored_hash or not plain:
        return False

    # ── New format: "pbkdf2sha256$<iters>$<salt_hex>$<hash_hex>" ─────────────
    if stored_hash.startswith("pbkdf2sha256$"):
        try:
            _, iters_str, salt_hex, hash_hex = stored_hash.split("$", 3)
            iters = int(iters_str)
            salt = bytes.fromhex(salt_hex)
            expected = bytes.fromhex(hash_hex)
            actual = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, iters)
            return hmac.compare_digest(actual, expected)
        except Exception:
            return False

    # ── Legacy passlib format: "$pbkdf2-sha256$..." ───────────────────────────
    if stored_hash.startswith("$pbkdf2-sha256$"):
        try:
            from passlib.context import CryptContext
            ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
            return bool(ctx.verify(plain, stored_hash))
        except Exception:
            return False

    return False


# ─── JWT ──────────────────────────────────────────────────────────────────────
JWT_SECRET_KEY = "pharmashield-ultra-secure-jwt-key-change-in-prod-2026"
JWT_ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days


def create_access_token(data: dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None


# ─── File paths ───────────────────────────────────────────────────────────────
_DATA_DIR        = settings.data_dir
_DB_PATH         = _DATA_DIR / "pharmashield_users.db"
_USERS_JSON      = _DATA_DIR / "users.json"
_RESET_JSON      = _DATA_DIR / "password_resets.json"

_db_lock = threading.Lock()


# ─── Pydantic models ──────────────────────────────────────────────────────────

class MedicalProfile(BaseModel):
    allergies: list[str]              = Field(default_factory=list)
    adverse_reactions: list[str]      = Field(default_factory=list)
    current_prescriptions: list[str]  = Field(default_factory=list)
    otc_medications: list[str]        = Field(default_factory=list)
    supplements: list[str]            = Field(default_factory=list)
    medical_conditions: list[str]     = Field(default_factory=list)
    pregnancy_status: bool            = False
    breastfeeding_status: bool        = False
    profile_completed: bool           = False
    updated_at: Optional[str]         = None


class UserRecord(BaseModel):
    id: str
    full_name: str
    email: str
    hashed_password: str
    is_verified: bool                          = True
    status: str                                = "active"
    created_at: str
    medical_profile: MedicalProfile            = Field(default_factory=MedicalProfile)


class UserRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    accept_terms: bool = True

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v.strip()):
            raise ValueError("Format email tidak valid.")
        return v.strip().lower()


class UserLoginRequest(BaseModel):
    email: str
    password: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    reset_token: str
    new_password: str


# ─── SQLite database layer ────────────────────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    """Open (or create) the SQLite database and ensure schema exists."""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # safe concurrent writes
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id               TEXT PRIMARY KEY,
            email            TEXT UNIQUE NOT NULL,
            full_name        TEXT NOT NULL,
            hashed_password  TEXT NOT NULL,
            is_verified      INTEGER NOT NULL DEFAULT 1,
            status           TEXT NOT NULL DEFAULT 'active',
            created_at       TEXT NOT NULL,
            medical_profile  TEXT NOT NULL DEFAULT '{}'
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    conn.commit()
    return conn


@contextmanager
def _db():
    with _db_lock:
        conn = _get_db()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    try:
        d["medical_profile"] = json.loads(d.get("medical_profile") or "{}")
    except Exception:
        d["medical_profile"] = {}
    d["is_verified"] = bool(d.get("is_verified", 1))
    return d


# ─── Migration: JSON → SQLite (runs once on first import) ────────────────────

def _migrate_json_to_db() -> None:
    """Import all users from users.json into SQLite (skips duplicates)."""
    if not _USERS_JSON.exists():
        return
    try:
        raw = _USERS_JSON.read_text(encoding="utf-8").strip()
        if not raw:
            return
        users_json: dict[str, Any] = json.loads(raw)
    except Exception as exc:
        logger.warning("[Auth] Could not read users.json for migration: %s", exc)
        return

    migrated = 0
    with _db() as conn:
        for email_key, u in users_json.items():
            try:
                mp = u.get("medical_profile", {})
                conn.execute(
                    """INSERT OR IGNORE INTO users
                       (id, email, full_name, hashed_password, is_verified, status, created_at, medical_profile)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        u.get("id", str(uuid.uuid4())),
                        email_key,
                        u.get("full_name", ""),
                        u.get("hashed_password", ""),
                        1 if u.get("is_verified", True) else 0,
                        u.get("status", "active"),
                        u.get("created_at", datetime.now(timezone.utc).isoformat()),
                        json.dumps(mp, ensure_ascii=False),
                    ),
                )
                migrated += 1
            except Exception as ex:
                logger.debug("[Auth] Migration skip %s: %s", email_key, ex)

    if migrated:
        logger.info("[Auth] Migrated %d users from users.json → SQLite", migrated)


# Run migration at module load time
try:
    _migrate_json_to_db()
except Exception as _e:
    logger.warning("[Auth] Migration error (non-fatal): %s", _e)


# ─── Internal DB helpers ──────────────────────────────────────────────────────

def _db_get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    email = email.lower().strip()
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return _row_to_dict(row) if row else None


def _db_get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_dict(row) if row else None


def _db_insert_user(user: dict[str, Any]) -> None:
    with _db() as conn:
        conn.execute(
            """INSERT INTO users (id, email, full_name, hashed_password, is_verified, status, created_at, medical_profile)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user["id"],
                user["email"],
                user["full_name"],
                user["hashed_password"],
                1 if user.get("is_verified", True) else 0,
                user.get("status", "active"),
                user["created_at"],
                json.dumps(user.get("medical_profile", {}), ensure_ascii=False),
            ),
        )
    # Also mirror to JSON for backup
    _mirror_to_json(user)


def _db_update_profile(user_id: str, profile: dict[str, Any]) -> None:
    with _db() as conn:
        conn.execute(
            "UPDATE users SET medical_profile = ? WHERE id = ?",
            (json.dumps(profile, ensure_ascii=False), user_id),
        )


def _db_update_password(email: str, new_hash: str) -> None:
    with _db() as conn:
        conn.execute(
            "UPDATE users SET hashed_password = ? WHERE email = ?",
            (new_hash, email.lower().strip()),
        )


def _mirror_to_json(user: dict[str, Any]) -> None:
    """Mirror SQLite insert/update to users.json as a human-readable backup."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        if _USERS_JSON.exists():
            existing = json.loads(_USERS_JSON.read_text(encoding="utf-8") or "{}")
        else:
            existing = {}
        existing[user["email"]] = user
        _USERS_JSON.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.debug("[Auth] JSON mirror write failed (non-fatal): %s", exc)


# ─── Public API ───────────────────────────────────────────────────────────────

def _build_user_out(u: dict[str, Any], token: str) -> dict[str, Any]:
    return {
        "id":             u["id"],
        "full_name":      u.get("full_name", ""),
        "email":          u["email"],
        "is_verified":    u.get("is_verified", True),
        "status":         u.get("status", "active"),
        "created_at":     u.get("created_at", ""),
        "medical_profile": u.get("medical_profile", {}),
        "token":          token,
    }


def register_user(req: UserRegisterRequest) -> tuple[bool, str, Optional[dict[str, Any]]]:
    email_key = req.email.lower().strip()

    # Validate password strength
    if len(req.password) < 8:
        return False, "Password minimal 8 karakter.", None
    if not re.search(r"[A-Za-z]", req.password):
        return False, "Password harus mengandung huruf dan angka.", None
    if not re.search(r"\d", req.password):
        return False, "Password harus mengandung huruf dan angka.", None
    if not req.accept_terms:
        return False, "Anda harus menyetujui syarat & ketentuan layanan.", None

    # Check duplicate email
    if _db_get_user_by_email(email_key):
        return False, "Email sudah terdaftar. Silakan login.", None

    user_id  = str(uuid.uuid4())
    now_iso  = datetime.now(timezone.utc).isoformat()
    mp_empty = MedicalProfile().model_dump()

    user_record = {
        "id":              user_id,
        "email":           email_key,
        "full_name":       req.full_name.strip(),
        "hashed_password": get_password_hash(req.password),
        "is_verified":     True,
        "status":          "active",
        "created_at":      now_iso,
        "medical_profile": mp_empty,
    }

    try:
        _db_insert_user(user_record)
        logger.info("[Auth] New user registered: %s", email_key)
    except Exception as exc:
        logger.error("[Auth] Failed to save new user %s: %s", email_key, exc)
        return False, "Gagal menyimpan akun. Silakan coba lagi.", None

    token = create_access_token({"sub": user_id, "email": email_key, "name": req.full_name})
    return True, "Pendaftaran berhasil.", _build_user_out(user_record, token)


def authenticate_user(req: UserLoginRequest) -> tuple[bool, str, Optional[dict[str, Any]]]:
    email_key = req.email.lower().strip()
    u = _db_get_user_by_email(email_key)

    if not u:
        logger.warning("[Auth] Login attempt for unknown email: %s", email_key)
        return False, "Email atau password salah.", None

    if not verify_password(req.password, u.get("hashed_password", "")):
        logger.warning("[Auth] Wrong password for: %s", email_key)
        return False, "Email atau password salah.", None

    token = create_access_token({
        "sub":   u["id"],
        "email": email_key,
        "name":  u.get("full_name", ""),
    })
    logger.info("[Auth] Login success: %s", email_key)
    return True, "Login berhasil.", _build_user_out(u, token)


def get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    return _db_get_user_by_id(user_id)


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    return _db_get_user_by_email(email)


def update_medical_profile(
    user_id: str, profile_data: MedicalProfile
) -> tuple[bool, str, Optional[dict[str, Any]]]:
    u = _db_get_user_by_id(user_id)
    if not u:
        return False, "Pengguna tidak ditemukan.", None

    profile_dict = profile_data.model_dump()
    profile_dict["profile_completed"] = bool(
        profile_dict["allergies"]
        or profile_dict["current_prescriptions"]
        or profile_dict["medical_conditions"]
    )
    profile_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        _db_update_profile(user_id, profile_dict)
    except Exception as exc:
        logger.error("[Auth] Failed to update profile for %s: %s", user_id, exc)
        return False, "Gagal memperbarui profil.", None

    return True, "Profil medis berhasil diperbarui.", profile_dict


def create_password_reset_token(email: str) -> str:
    tokens = _load_reset_tokens()
    reset_token = str(uuid.uuid4())
    tokens[reset_token] = {
        "email":      email.lower().strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
    }
    _save_reset_tokens(tokens)
    return reset_token


def reset_password_with_token(reset_token: str, new_password: str) -> tuple[bool, str]:
    if len(new_password) < 8:
        return False, "Kata sandi baru minimal 8 karakter."
    if not re.search(r"[A-Za-z]", new_password) or not re.search(r"\d", new_password):
        return False, "Kata sandi harus mengandung huruf dan angka."

    tokens = _load_reset_tokens()
    entry = tokens.get(reset_token)
    if not entry:
        return False, "Tautan pemulihan tidak valid atau sudah kedaluwarsa."

    email = entry.get("email", "")
    u = _db_get_user_by_email(email)
    if not u:
        return False, "Akun tidak ditemukan."

    try:
        _db_update_password(email, get_password_hash(new_password))
    except Exception as exc:
        logger.error("[Auth] Password reset failed for %s: %s", email, exc)
        return False, "Gagal memperbarui kata sandi."

    tokens.pop(reset_token, None)
    _save_reset_tokens(tokens)
    return True, "Kata sandi berhasil diatur ulang. Silakan login."


# ─── Reset token helpers (still JSON-based, small & transient data) ───────────

def _load_reset_tokens() -> dict[str, Any]:
    if not _RESET_JSON.exists():
        return {}
    try:
        raw = _RESET_JSON.read_text(encoding="utf-8").strip()
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


def _save_reset_tokens(tokens: dict[str, Any]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _RESET_JSON.write_text(json.dumps(tokens, indent=2), encoding="utf-8")


# ─── Legacy shims (used by endpoints.py that still reference _load_users) ─────

def _load_users() -> dict[str, Any]:
    """Legacy shim: read from SQLite, return as email-keyed dict."""
    try:
        with _db() as conn:
            rows = conn.execute("SELECT * FROM users").fetchall()
        return {dict(r)["email"]: _row_to_dict(r) for r in rows}
    except Exception:
        # Absolute fallback to JSON
        if _USERS_JSON.exists():
            try:
                return json.loads(_USERS_JSON.read_text(encoding="utf-8") or "{}")
            except Exception:
                pass
        return {}


def _save_users(users: dict[str, Any]) -> None:
    """Legacy shim: save a users dict back to both SQLite and JSON."""
    for email_key, u in users.items():
        try:
            existing = _db_get_user_by_email(email_key)
            if existing:
                _db_update_password(email_key, u.get("hashed_password", existing["hashed_password"]))
            else:
                _db_insert_user({**u, "email": email_key})
        except Exception as exc:
            logger.debug("[Auth] _save_users error for %s: %s", email_key, exc)
    # Also write JSON backup
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _USERS_JSON.write_text(json.dumps(users, indent=2, ensure_ascii=False), encoding="utf-8")
