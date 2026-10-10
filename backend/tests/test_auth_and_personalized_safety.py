"""
backend/tests/test_auth_and_personalized_safety.py
Test suite for Authentication and Personalized Multi-Layered Safety Analysis.
"""

import time
from fastapi.testclient import TestClient
import pytest
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_auth_full_lifecycle(client):
    email = f"dr.safetyscan_{int(time.time())}@pharmashield.id"
    # 1. Register
    reg_payload = {
        "full_name": "Dr. Safety Scanner",
        "email": email,
        "password": "SecretPassword123",
        "accept_terms": True,
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code == 200
    user_data = reg_res.json()["user"]
    token = user_data["token"]
    assert token is not None

    # 2. Login
    login_payload = {
        "email": email,
        "password": "SecretPassword123",
    }
    login_res = client.post("/api/auth/login", json=login_payload)
    assert login_res.status_code == 200
    login_token = login_res.json()["user"]["token"]

    # 3. Get /auth/me
    headers = {"Authorization": f"Bearer {login_token}"}
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    # 4. Update Medical Profile
    profile_payload = {
        "allergies": ["paracetamol"],
        "adverse_reactions": ["ruam kulit"],
        "current_prescriptions": ["amlodipine 5mg"],
        "otc_medications": [],
        "supplements": ["vitamin c"],
        "medical_conditions": ["hipertensi"],
        "pregnancy_status": False,
        "breastfeeding_status": False,
    }
    put_res = client.put("/api/auth/profile", json=profile_payload, headers=headers)
    assert put_res.status_code == 200
    assert put_res.json()["medical_profile"]["profile_completed"] is True
    assert "paracetamol" in put_res.json()["medical_profile"]["allergies"]
