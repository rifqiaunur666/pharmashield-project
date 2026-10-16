"""
app/services/auth_service.py
PharmaShield — User Authentication, JWT Tokens, Secure Password Hashing,
SQLite Users Database Architecture & Persistent Storage.
"""

from __future__ import annotations

import json
import logging
import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import bcrypt
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field, field_validator

from app.config import settings

logger = logging.getLogger(__name__)

# Fallback passlib context for legacy pbkdf2 hashes in existing users.json
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# JWT Configuration
JWT_SECRET_KEY = "pharmashield-ultra-secure-jwt-key-change-in-prod-2026"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

USERS_FILE: Path = settings.data_dir / "users.json"
RESET_TOKENS_FILE: Path = settings.data_dir / "password_resets.json"
DB_FILE: Path = settings.database_dir / "pharmashield.db"


# ─── Data Models ─────────────────────────────────────────────────────────────

class MedicalProfile(BaseModel):
    allergies: list[str] = Field(default_factory=list)
    adverse_reactions: list[str] = Field(default_factory=list)
    current_prescriptions: list[str] = Field(default_factory=list)
    otc_medications: list[str] = Field(default_factory=list)
    supplements: list[str] = Field(default_factory=list)
    medical_conditions: list[str] = Field(default_factory=list)
    pregnancy_status: bool = False
    breastfeeding_status: bool = False
    profile_completed: bool = False
    updated_at: Optional[str] = None


class UserRecord(BaseModel):
    id: str
    full_name: str
    email: str
    hashed_password: str
    status: str = "active"
    is_verified: bool = True
    created_at: str
    updated_at: Optional[str] = None
    medical_profile: MedicalProfile = Field(default_factory=MedicalProfile)


class UserRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    confirm_password: Optional[str] = None
    accept_terms: bool = True

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
        if not re.match(pattern, v.strip()):
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


# ─── Database Operations (SQLite `users` Table) ──────────────────────────────

def _get_db_connection() -> sqlite3.Connection:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_FILE), timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Initialize the SQLite `users` table and indexes, and migrate legacy JSON users if needed."""
    try:
        with _get_db_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    hashed_password TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    is_verified INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT,
                    medical_profile TEXT
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
            conn.commit()

        # Check if legacy users in users.json should be migrated
        _migrate_legacy_users()
    except Exception as exc:
        logger.error("[Auth] Database initialization error: %s", exc)


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["is_verified"] = bool(d.get("is_verified", 1))
    if isinstance(d.get("medical_profile"), str):
        try:
            d["medical_profile"] = json.loads(d["medical_profile"])
        except Exception:
            d["medical_profile"] = MedicalProfile().model_dump()
    elif not d.get("medical_profile"):
        d["medical_profile"] = MedicalProfile().model_dump()
    return d


def _load_users_from_db() -> dict[str, dict[str, Any]]:
    """Return dict of email -> user dict from SQLite."""
    try:
        with _get_db_connection() as conn:
            cursor = conn.execute("SELECT * FROM users")
            rows = cursor.fetchall()
            return {r["email"].lower().strip(): _row_to_dict(r) for r in rows}
    except Exception as exc:
        logger.error("[Auth] Error reading users from DB: %s", exc)
        return _load_users_from_json()


def _save_user_to_db(user_dict: dict[str, Any]) -> None:
    """Insert or replace user record in SQLite users table."""
    try:
        with _get_db_connection() as conn:
            med_profile_json = json.dumps(
                user_dict.get("medical_profile") or MedicalProfile().model_dump(),
                ensure_ascii=False
            )
            conn.execute("""
                INSERT INTO users (id, full_name, email, hashed_password, status, is_verified, created_at, updated_at, medical_profile)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                    full_name = excluded.full_name,
                    hashed_password = excluded.hashed_password,
                    status = excluded.status,
                    is_verified = excluded.is_verified,
                    updated_at = excluded.updated_at,
                    medical_profile = excluded.medical_profile;
            """, (
                user_dict["id"],
                user_dict["full_name"],
                user_dict["email"].lower().strip(),
                user_dict["hashed_password"],
                user_dict.get("status", "active"),
                1 if user_dict.get("is_verified", True) else 0,
                user_dict["created_at"],
                user_dict.get("updated_at"),
                med_profile_json,
            ))
            conn.commit()
    except Exception as exc:
        logger.error("[Auth] Error saving user to SQLite: %s", exc)


def _load_users_from_json() -> dict[str, dict[str, Any]]:
    if not USERS_FILE.exists():
        return {}
    try:
        content = USERS_FILE.read_text(encoding="utf-8").strip()
        if not content:
            return {}
        return json.loads(content)
    except Exception as exc:
        logger.error("[Auth] Error reading users file: %s", exc)
        return {}


def _save_users_to_json(users: dict[str, dict[str, Any]]) -> None:
    try:
        USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        USERS_FILE.write_text(json.dumps(users, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.error("[Auth] Error saving users JSON mirror: %s", exc)


def _migrate_legacy_users() -> None:
    """Seed SQLite from users.json if database table is empty or missing accounts."""
    json_users = _load_users_from_json()
    if not json_users:
        return

    try:
        with _get_db_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if count == 0:
                logger.info("[Auth] Migrating %d legacy users from JSON into SQLite...", len(json_users))
                for email_key, u in json_users.items():
                    med_profile_json = json.dumps(
                        u.get("medical_profile") or MedicalProfile().model_dump(),
                        ensure_ascii=False
                    )
                    conn.execute("""
                        INSERT OR IGNORE INTO users (id, full_name, email, hashed_password, status, is_verified, created_at, updated_at, medical_profile)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, (
                        u.get("id", str(uuid.uuid4())),
                        u.get("full_name", "User"),
                        email_key.lower().strip(),
                        u.get("hashed_password", ""),
                        u.get("status", "active"),
                        1 if u.get("is_verified", True) else 0,
                        u.get("created_at", datetime.now(timezone.utc).isoformat()),
                        u.get("updated_at"),
                        med_profile_json,
                    ))
                conn.commit()
                logger.info("[Auth] Successfully migrated users to SQLite.")
    except Exception as exc:
        logger.error("[Auth] Migration error: %s", exc)


def _load_reset_tokens() -> dict[str, dict[str, Any]]:
    if not RESET_TOKENS_FILE.exists():
        return {}
    try:
        content = RESET_TOKENS_FILE.read_text(encoding="utf-8").strip()
        return json.loads(content) if content else {}
    except Exception:
        return {}


def _save_reset_tokens(tokens: dict[str, dict[str, Any]]) -> None:
    RESET_TOKENS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESET_TOKENS_FILE.write_text(json.dumps(tokens, indent=2), encoding="utf-8")


# ─── Password & Token Utilities ──────────────────────────────────────────────

def get_password_hash(password: str) -> str:
    """Hash password using robust bcrypt with 12 salt rounds."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8")[:72], salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash or fallback to legacy pbkdf2 hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8"))
        # Fallback for pbkdf2 hashes in existing users.json
        if hashed_password.startswith("$pbkdf2-sha256$"):
            return pwd_context.verify(plain_password, hashed_password)
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as exc:
        logger.error("[Auth] Password verification error: %s", exc)
        return False


def validate_password_strength(password: str) -> tuple[bool, str]:
    """Ensure password is >= 8 characters and contains a combination of letters and numbers."""
    if len(password) < 8:
        return False, "Password minimal 8 karakter."
    has_letter = bool(re.search(r"[a-zA-Z]", password))
    has_digit = bool(re.search(r"\d", password))
    if not (has_letter and has_digit):
        return False, "Password harus berupa kombinasi huruf dan angka minimal 8 karakter."
    return True, ""


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


# ─── User Lifecycle ──────────────────────────────────────────────────────────

def register_user(req: UserRegisterRequest) -> tuple[bool, str, Optional[dict[str, Any]]]:
    """
    Registers a new user:
    - Validates full name and email format.
    - Validates password strength (min 8 characters, letters + digits).
    - Checks confirm_password if provided.
    - Checks for duplicate email in database.
    - Hashes password using bcrypt.
    - Stores into database `users` table with status='active'.
    """
    full_name = req.full_name.strip()
    if not full_name:
        return False, "Nama lengkap wajib diisi.", None

    email_key = req.email.lower().strip()
    email_pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    if not re.match(email_pattern, email_key):
        return False, "Format email tidak valid.", None

    if req.confirm_password is not None and req.confirm_password != req.password:
        return False, "Password dan Konfirmasi Password tidak cocok.", None

    valid_pwd, pwd_err = validate_password_strength(req.password)
    if not valid_pwd:
        return False, pwd_err, None

    if not req.accept_terms:
        return False, "Anda harus menyetujui syarat & ketentuan layanan.", None

    # Check duplicate email in SQLite and JSON
    existing = get_user_by_email(email_key)
    if existing:
        return False, "Email sudah terdaftar. Silakan login.", None

    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    hashed = get_password_hash(req.password)

    new_user = UserRecord(
        id=user_id,
        full_name=full_name,
        email=email_key,
        hashed_password=hashed,
        status="active",
        is_verified=True,
        created_at=now_iso,
        updated_at=None,
        medical_profile=MedicalProfile(),
    )

    user_dict = new_user.model_dump()

    # Save to SQLite users table
    _save_user_to_db(user_dict)

    # Keep users.json synchronized as mirror
    users = _load_users_from_json()
    users[email_key] = user_dict
    _save_users_to_json(users)

    token = create_access_token({
        "sub": user_id,
        "email": email_key,
        "name": full_name,
        "status": "active",
    })

    user_out = {
        "id": user_id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "status": new_user.status,
        "is_verified": new_user.is_verified,
        "created_at": new_user.created_at,
        "medical_profile": new_user.medical_profile.model_dump(),
        "token": token,
    }
    return True, "Pendaftaran berhasil! Silakan login.", user_out


def authenticate_user(req: UserLoginRequest) -> tuple[bool, str, Optional[dict[str, Any]]]:
    """
    Authenticates user:
    - Finds user by email in database.
    - If not found: 'Email atau password salah.'
    - Verifies password hash.
    - If mismatch: 'Email atau password salah.'
    - Generates JWT token upon success.
    """
    email_key = req.email.lower().strip()
    user_data = get_user_by_email(email_key)

    if not user_data:
        return False, "Email atau password salah.", None

    if not verify_password(req.password, user_data.get("hashed_password", "")):
        return False, "Email atau password salah.", None

    if user_data.get("status") and user_data.get("status") != "active":
        return False, "Akun Anda saat ini tidak aktif. Silakan hubungi admin.", None

    user_id = user_data["id"]
    token = create_access_token({
        "sub": user_id,
        "email": email_key,
        "name": user_data.get("full_name", ""),
        "status": user_data.get("status", "active"),
    })

    user_out = {
        "id": user_id,
        "full_name": user_data.get("full_name", ""),
        "email": user_data["email"],
        "status": user_data.get("status", "active"),
        "is_verified": user_data.get("is_verified", True),
        "created_at": user_data.get("created_at", ""),
        "medical_profile": user_data.get("medical_profile", MedicalProfile().model_dump()),
        "token": token,
    }
    return True, "Login berhasil.", user_out


def get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    try:
        with _get_db_connection() as conn:
            cursor = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            if row:
                return _row_to_dict(row)
    except Exception as exc:
        logger.error("[Auth] DB lookup by id failed: %s", exc)

    # Fallback to users.json
    users = _load_users_from_json()
    for _, u in users.items():
        if u.get("id") == user_id:
            return u
    return None


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    email_key = email.lower().strip()
    try:
        with _get_db_connection() as conn:
            cursor = conn.execute("SELECT * FROM users WHERE LOWER(email) = ?", (email_key,))
            row = cursor.fetchone()
            if row:
                return _row_to_dict(row)
    except Exception as exc:
        logger.error("[Auth] DB lookup by email failed: %s", exc)

    # Fallback to users.json
    users = _load_users_from_json()
    return users.get(email_key)


def update_medical_profile(user_id: str, profile_data: MedicalProfile) -> tuple[bool, str, Optional[dict[str, Any]]]:
    user = get_user_by_id(user_id)
    if not user:
        return False, "Pengguna tidak ditemukan.", None

    profile_dict = profile_data.model_dump()
    profile_dict["profile_completed"] = bool(
        profile_dict.get("allergies") or
        profile_dict.get("current_prescriptions") or
        profile_dict.get("medical_conditions")
    )
    profile_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    user["medical_profile"] = profile_dict
    user["updated_at"] = profile_dict["updated_at"]

    # Save to SQLite
    _save_user_to_db(user)

    # Save to JSON
    users = _load_users_from_json()
    users[user["email"].lower().strip()] = user
    _save_users_to_json(users)

    return True, "Profil medis berhasil diperbarui.", profile_dict


def create_password_reset_token(email: str) -> str:
    tokens = _load_reset_tokens()
    reset_token = str(uuid.uuid4())
    tokens[reset_token] = {
        "email": email.lower().strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
    }
    _save_reset_tokens(tokens)
    return reset_token


def reset_password_with_token(reset_token: str, new_password: str) -> tuple[bool, str]:
    valid_pwd, pwd_err = validate_password_strength(new_password)
    if not valid_pwd:
        return False, pwd_err

    tokens = _load_reset_tokens()
    entry = tokens.get(reset_token)
    if not entry:
        return False, "Tautan pemulihan tidak valid atau sudah kedaluwarsa."

    email = entry.get("email")
    user = get_user_by_email(email)
    if not user:
        return False, "Akun tidak ditemukan."

    user["hashed_password"] = get_password_hash(new_password)
    user["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_user_to_db(user)

    users = _load_users_from_json()
    if email in users:
        users[email]["hashed_password"] = user["hashed_password"]
        users[email]["updated_at"] = user["updated_at"]
        _save_users_to_json(users)

    # Invalidate token
    tokens.pop(reset_token, None)
    _save_reset_tokens(tokens)

    return True, "Kata sandi berhasil diatur ulang. Silakan login."


# Initialize table on module load
init_db()
