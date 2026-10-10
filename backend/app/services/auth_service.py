"""
app/services/auth_service.py
PharmaShield — User Authentication, JWT Tokens, Password Hashing,
User Profiles, and Persistent File Storage.
"""

from __future__ import annotations

import json
import logging
import uuid
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field, field_validator

from app.config import settings

logger = logging.getLogger(__name__)

# Password hashing: use pbkdf2_sha256 which is safe, robust, and free from bcrypt 4.1+ 72-byte init bug
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# JWT Configuration
JWT_SECRET_KEY = "pharmashield-ultra-secure-jwt-key-change-in-prod-2026"
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

USERS_FILE: Path = settings.data_dir / "users.json"
RESET_TOKENS_FILE: Path = settings.data_dir / "password_resets.json"


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
    is_verified: bool = True
    created_at: str
    medical_profile: MedicalProfile = Field(default_factory=MedicalProfile)


class UserRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
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


# ─── Storage Operations ──────────────────────────────────────────────────────

def _load_users() -> dict[str, dict[str, Any]]:
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


def _save_users(users: dict[str, dict[str, Any]]) -> None:
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(users, indent=2, ensure_ascii=False), encoding="utf-8")


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

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


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
    email_key = req.email.lower().strip()
    if len(req.password) < 6:
        return False, "Kata sandi minimal 6 karakter.", None

    if not req.accept_terms:
        return False, "Anda harus menyetujui syarat & ketentuan layanan.", None

    users = _load_users()
    if email_key in users:
        return False, "Alamat email ini sudah terdaftar.", None

    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    new_user = UserRecord(
        id=user_id,
        full_name=req.full_name.strip(),
        email=req.email,
        hashed_password=get_password_hash(req.password),
        is_verified=True,
        created_at=now_iso,
        medical_profile=MedicalProfile(),
    )

    users[email_key] = new_user.model_dump()
    _save_users(users)

    token = create_access_token({"sub": user_id, "email": email_key, "name": req.full_name})
    user_out = {
        "id": user_id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "is_verified": new_user.is_verified,
        "created_at": new_user.created_at,
        "medical_profile": new_user.medical_profile.model_dump(),
        "token": token,
    }
    return True, "Pendaftaran berhasil.", user_out


def authenticate_user(req: UserLoginRequest) -> tuple[bool, str, Optional[dict[str, Any]]]:
    email_key = req.email.lower().strip()
    users = _load_users()

    user_data = users.get(email_key)
    if not user_data:
        return False, "Email atau kata sandi tidak valid.", None

    if not verify_password(req.password, user_data.get("hashed_password", "")):
        return False, "Email atau kata sandi tidak valid.", None

    token = create_access_token({
        "sub": user_data["id"],
        "email": email_key,
        "name": user_data.get("full_name", ""),
    })

    user_out = {
        "id": user_data["id"],
        "full_name": user_data.get("full_name", ""),
        "email": user_data["email"],
        "is_verified": user_data.get("is_verified", True),
        "created_at": user_data.get("created_at", ""),
        "medical_profile": user_data.get("medical_profile", MedicalProfile().model_dump()),
        "token": token,
    }
    return True, "Login berhasil.", user_out


def get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    users = _load_users()
    for _, u in users.items():
        if u.get("id") == user_id:
            return u
    return None


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    users = _load_users()
    return users.get(email.lower().strip())


def update_medical_profile(user_id: str, profile_data: MedicalProfile) -> tuple[bool, str, Optional[dict[str, Any]]]:
    users = _load_users()
    target_key = None
    for k, u in users.items():
        if u.get("id") == user_id:
            target_key = k
            break

    if not target_key:
        return False, "Pengguna tidak ditemukan.", None

    profile_dict = profile_data.model_dump()
    profile_dict["profile_completed"] = bool(
        profile_dict["allergies"] or
        profile_dict["current_prescriptions"] or
        profile_dict["medical_conditions"]
    )
    profile_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    users[target_key]["medical_profile"] = profile_dict
    _save_users(users)

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
    if len(new_password) < 6:
        return False, "Kata sandi baru minimal 6 karakter."

    tokens = _load_reset_tokens()
    entry = tokens.get(reset_token)
    if not entry:
        return False, "Tautan pemulihan tidak valid atau sudah kedaluwarsa."

    email = entry.get("email")
    users = _load_users()
    if email not in users:
        return False, "Akun tidak ditemukan."

    users[email]["hashed_password"] = get_password_hash(new_password)
    _save_users(users)

    # Invalidate token
    tokens.pop(reset_token, None)
    _save_reset_tokens(tokens)

    return True, "Kata sandi berhasil diatur ulang. Silakan login."
