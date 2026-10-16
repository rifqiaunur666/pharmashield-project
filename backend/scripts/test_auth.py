"""Test registration + login for specific user from screenshot."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.auth_service import (
    register_user, authenticate_user,
    UserRegisterRequest, UserLoginRequest,
    _load_users, get_password_hash, verify_password
)

# Step 1: Test if registration saves correctly
print("=== Step 1: Test Register ===")
req = UserRegisterRequest(
    full_name='Athaillah Ramadhan',
    email='athaillahr62@gmail.com',
    password='Atha120907',
    accept_terms=True
)
success, msg, data = register_user(req)
print(f"Register: success={success}, msg={msg}")

# Step 2: Verify it's in DB
users = _load_users()
print(f"In DB: {'athaillahr62@gmail.com' in users}")

# Step 3: Test login immediately
print("\n=== Step 2: Test Login ===")
login_req = UserLoginRequest(email='athaillahr62@gmail.com', password='Atha120907')
ok, msg2, user_data = authenticate_user(login_req)
print(f"Login: success={ok}, msg={msg2}")

# Step 4: Direct hash test
print("\n=== Step 3: Direct Hash Test ===")
h = get_password_hash('Atha120907')
print(f"Hash of 'Atha120907': {h[:40]}")
print(f"Verify back: {verify_password('Atha120907', h)}")
