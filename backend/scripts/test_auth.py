"""
Full auth system test — register, login, duplicate check, wrong password, persist across sessions.
"""
import sys, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.auth_service import (
    register_user, authenticate_user,
    UserRegisterRequest, UserLoginRequest,
    _db_get_user_by_email, get_password_hash, verify_password,
    _migrate_json_to_db, _load_users
)

PRINT_SEP = "─" * 55

def ok(cond, msg):
    status = "PASS" if cond else "FAIL"
    print(f"  [{status}] {msg}")
    return cond

print(PRINT_SEP)
print(" TEST 1: Register fresh account")
print(PRINT_SEP)
# Clean up any existing test user first
import sqlite3, json
from pathlib import Path
from app.config import settings
db_path = settings.data_dir / "pharmashield_users.db"
if db_path.exists():
    conn = sqlite3.connect(str(db_path))
    conn.execute("DELETE FROM users WHERE email = 'athaillahr62@gmail.com'")
    conn.commit()
    conn.close()

req = UserRegisterRequest(
    full_name="Athaillah Ramadhan",
    email="athaillahr62@gmail.com",
    password="Atha120907",
    accept_terms=True
)
success, msg, data = register_user(req)
ok(success, f"Register succeeds: {msg}")
ok(data is not None, "Returns user data")
ok(data and "token" in data, "Returns JWT token")
ok(data and data.get("email") == "athaillahr62@gmail.com", "Email stored correctly")

print(PRINT_SEP)
print(" TEST 2: Verify user is in DB")
print(PRINT_SEP)
stored = _db_get_user_by_email("athaillahr62@gmail.com")
ok(stored is not None, "User found in SQLite DB")
ok(stored and stored["full_name"] == "Athaillah Ramadhan", f"Name correct: {stored['full_name'] if stored else 'N/A'}")
ok(stored and stored["hashed_password"].startswith("pbkdf2sha256$"), "Hash uses new stdlib format")
ok(stored and stored["status"] == "active", "Status is active")

print(PRINT_SEP)
print(" TEST 3: Login with correct credentials")
print(PRINT_SEP)
ok_login, msg_login, user_data = authenticate_user(
    UserLoginRequest(email="athaillahr62@gmail.com", password="Atha120907")
)
ok(ok_login, f"Login succeeds: {msg_login}")
ok(user_data is not None and "token" in user_data, "Login returns JWT token")

print(PRINT_SEP)
print(" TEST 4: Duplicate email registration blocked")
print(PRINT_SEP)
dup_ok, dup_msg, _ = register_user(req)
ok(not dup_ok, f"Duplicate blocked: {dup_msg}")
ok("Silakan login" in dup_msg, f"Correct error message: '{dup_msg}'")

print(PRINT_SEP)
print(" TEST 5: Wrong password rejected")
print(PRINT_SEP)
bad_ok, bad_msg, _ = authenticate_user(
    UserLoginRequest(email="athaillahr62@gmail.com", password="WrongPass999")
)
ok(not bad_ok, f"Wrong password rejected: {bad_msg}")

print(PRINT_SEP)
print(" TEST 6: Unknown email rejected")
print(PRINT_SEP)
unk_ok, unk_msg, _ = authenticate_user(
    UserLoginRequest(email="notexist@test.com", password="Atha120907")
)
ok(not unk_ok, f"Unknown email rejected: {unk_msg}")

print(PRINT_SEP)
print(" TEST 7: Password strength validation")
print(PRINT_SEP)
short_ok, short_msg, _ = register_user(UserRegisterRequest(
    full_name="Test", email="test2@test.com", password="abc123", accept_terms=True
))
ok(not short_ok, f"Short password blocked: {short_msg}")

nonum_ok, nonum_msg, _ = register_user(UserRegisterRequest(
    full_name="Test", email="test2@test.com", password="abcdefgh", accept_terms=True
))
ok(not nonum_ok, f"No-digit password blocked: {nonum_msg}")

print(PRINT_SEP)
print(" TEST 8: Simulated server restart (re-read from SQLite)")
print(PRINT_SEP)
# Simulate a fresh module re-import by reading directly from DB
fresh_user = _db_get_user_by_email("athaillahr62@gmail.com")
ok(fresh_user is not None, "User survives server restart (SQLite persistence)")
ok(fresh_user and verify_password("Atha120907", fresh_user["hashed_password"]),
   "Password verifies correctly after restart")

print(PRINT_SEP)
print(" TEST 9: JSON backup mirror exists")
print(PRINT_SEP)
json_path = settings.data_dir / "users.json"
ok(json_path.exists(), "users.json backup file exists")
if json_path.exists():
    users_json = json.loads(json_path.read_text(encoding="utf-8"))
    ok("athaillahr62@gmail.com" in users_json, "User in JSON backup too")

print(PRINT_SEP)
print(" ALL TESTS COMPLETE")
print(PRINT_SEP)
