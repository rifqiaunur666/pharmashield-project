"""
tests/test_auth_system.py
PharmaShield — Test Suite for User Registration & Authentication System.
"""

import pytest
import sqlite3
import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.services.auth_service import (
    DB_FILE,
    UserLoginRequest,
    UserRegisterRequest,
    authenticate_user,
    decode_access_token,
    get_user_by_email,
    register_user,
    validate_password_strength,
    verify_password,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_password_strength_validator():
    # Less than 8 chars
    ok, msg = validate_password_strength("abc12")
    assert not ok
    assert "minimal 8 karakter" in msg

    # Only letters
    ok, msg = validate_password_strength("abcdefghijkl")
    assert not ok
    assert "kombinasi huruf dan angka" in msg

    # Only digits
    ok, msg = validate_password_strength("123456789012")
    assert not ok
    assert "kombinasi huruf dan angka" in msg

    # Valid letter + number combination
    ok, msg = validate_password_strength("MedikaSecure2026")
    assert ok
    assert msg == ""


def test_user_registration_and_db_persistence():
    unique_email = f"user_db_test_{uuid.uuid4().hex[:8]}@domain.id"

    req = UserRegisterRequest(
        full_name="Budi Santoso",
        email=unique_email,
        password="Password123",
        confirm_password="Password123",
        accept_terms=True,
    )

    success, msg, user_data = register_user(req)
    assert success is True
    assert "Pendaftaran berhasil" in msg
    assert user_data is not None
    assert user_data["status"] == "active"
    assert user_data["token"] is not None

    # Check persistence in SQLite `users` table
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM users WHERE email = ?", (unique_email,)).fetchone()
    conn.close()

    assert row is not None
    assert row["full_name"] == "Budi Santoso"
    assert row["status"] == "active"
    assert row["hashed_password"].startswith("$2b$")
    assert verify_password("Password123", row["hashed_password"]) is True


def test_duplicate_email_registration_rejected():
    unique_email = f"dup_check_{uuid.uuid4().hex[:8]}@domain.id"

    req = UserRegisterRequest(
        full_name="User Pertama",
        email=unique_email,
        password="SecretPassword88",
        confirm_password="SecretPassword88",
    )
    ok1, _, _ = register_user(req)
    assert ok1 is True

    # Register again with same email
    ok2, msg2, _ = register_user(req)
    assert ok2 is False
    assert msg2 == "Email sudah terdaftar. Silakan login."


def test_password_mismatch_rejected():
    req = UserRegisterRequest(
        full_name="User Mismatch",
        email="mismatch@domain.id",
        password="ValidPassword123",
        confirm_password="DifferentPassword456",
    )
    ok, msg, _ = register_user(req)
    assert ok is False
    assert msg == "Password dan Konfirmasi Password tidak cocok."


def test_login_flow_and_error_messages():
    email = f"login_flow_{uuid.uuid4().hex[:8]}@domain.id"
    password = "CorrectPassword123"

    # Register user first
    register_user(UserRegisterRequest(
        full_name="Login Test User",
        email=email,
        password=password,
        confirm_password=password,
    ))

    # Test login success
    ok_login, msg, user_out = authenticate_user(UserLoginRequest(email=email, password=password))
    assert ok_login is True
    assert msg == "Login berhasil."
    assert user_out["token"] is not None

    # Verify JWT claims
    payload = decode_access_token(user_out["token"])
    assert payload is not None
    assert payload["email"] == email

    # Test wrong password
    bad_pwd, bad_pwd_msg, _ = authenticate_user(UserLoginRequest(email=email, password="WrongPassword999"))
    assert bad_pwd is False
    assert bad_pwd_msg == "Email atau password salah."

    # Test wrong email
    bad_email, bad_email_msg, _ = authenticate_user(UserLoginRequest(email="nonexistent@domain.id", password=password))
    assert bad_email is False
    assert bad_email_msg == "Email atau password salah."


def test_api_endpoints_register_and_login_with_cookies(client):
    email = f"api_client_{uuid.uuid4().hex[:8]}@domain.id"
    password = "ClientPass123"

    # POST /api/auth/register
    reg_resp = client.post("/api/auth/register", json={
        "full_name": "Siti Nurhaliza",
        "email": email,
        "password": password,
        "confirm_password": password,
        "accept_terms": True,
    })
    assert reg_resp.status_code == 200
    assert "token" in reg_resp.json()["user"]
    assert "pharmashield_token" in reg_resp.cookies

    # POST /api/auth/login
    login_resp = client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["user"]["token"]
    assert token is not None

    # GET /api/auth/me with Bearer token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == email
    assert me_resp.json()["full_name"] == "Siti Nurhaliza"

    # POST /api/auth/logout
    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    # Clear test client cookies to simulate unauthenticated state
    client.cookies.clear()

    # GET /api/auth/me without auth should fail 401
    unauth_resp = client.get("/api/auth/me")
    assert unauth_resp.status_code == 401
