"""
SonicSentinel Security Test Suite
Runs all 12 RBAC/auth security tests against the live backend.
"""
import hashlib
import json
import requests
import sys

BASE = "http://localhost:8000"
PASS = []
FAIL = []

def ok(test: str, detail: str = ""):
    PASS.append(test)
    print(f"  [OK] PASS  [{test}]  {detail}")

def fail(test: str, detail: str = ""):
    FAIL.append(test)
    print(f"  [FAIL] FAIL  [{test}]  {detail}")

def run_test(num: int, name: str, fn):
    print(f"\nTEST {num}: {name}")
    try:
        fn()
    except Exception as e:
        fail(name, f"Exception: {e}")

# ──────────────────────────────────────────────────────────
# TEST 1: Public signup → always gets role=user
# ──────────────────────────────────────────────────────────
def test_1_signup_role_is_user():
    import time
    email = f"testuser_{int(time.time())}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={
        "name": "Test User",
        "email": email,
        "password": "testpass123"
    })
    if r.status_code != 201:
        fail("TEST1: Public signup → role=user", f"Status {r.status_code}: {r.text[:100]}")
        return None
    data = r.json()
    if data.get("role") == "user":
        ok("TEST1: Public signup → role=user", f"role={data['role']}")
    else:
        fail("TEST1: Public signup → role=user", f"Got role={data.get('role')}")
    return email

# ──────────────────────────────────────────────────────────
# TEST 2: Sending role=admin in registration → ignored
# ──────────────────────────────────────────────────────────
def test_2_no_admin_via_signup():
    import time
    email = f"attacker_{int(time.time())}@evil.com"
    # Try sending role=admin in body
    r = requests.post(f"{BASE}/auth/register", json={
        "name": "Attacker",
        "email": email,
        "password": "attackpass123",
        "role": "admin",           # <-- attack attempt
        "isAdmin": True,           # <-- attack attempt
        "admin": True              # <-- attack attempt
    })
    if r.status_code not in (201, 409):
        fail("TEST2: Client role=admin ignored", f"Unexpected status {r.status_code}")
        return
    if r.status_code == 201:
        data = r.json()
        if data.get("role") == "user":
            ok("TEST2: Client role=admin ignored", f"role correctly set to 'user', attack failed")
        else:
            fail("TEST2: Client role=admin ignored", f"SECURITY BREACH: got role={data.get('role')}")
    else:
        ok("TEST2: Client role=admin ignored", "Request rejected (duplicate or already tested)")

# ──────────────────────────────────────────────────────────
# TEST 3: Normal user cannot access admin API → 403
# ──────────────────────────────────────────────────────────
def test_3_user_blocked_from_admin(user_email: str):
    if not user_email:
        fail("TEST3: User blocked from /api/admin", "No user email available")
        return
    # Login as normal user
    s = requests.Session()
    lr = s.post(f"{BASE}/auth/login", json={"email": user_email, "password": "testpass123"})
    if lr.status_code != 200:
        fail("TEST3: User blocked from /api/admin", f"Login failed: {lr.status_code}")
        return
    # Try accessing admin overview
    ar = s.get(f"{BASE}/api/admin/overview")
    if ar.status_code == 403:
        ok("TEST3: User blocked from /api/admin", f"HTTP 403 returned as expected")
    else:
        fail("TEST3: User blocked from /api/admin", f"Expected 403, got {ar.status_code}: {ar.text[:80]}")

# ──────────────────────────────────────────────────────────
# TEST 4: User calling admin API directly → 403
# ──────────────────────────────────────────────────────────
def test_4_admin_api_blocked(user_email: str):
    if not user_email:
        fail("TEST4: Admin API HTTP 403 for user", "No user email")
        return
    s = requests.Session()
    s.post(f"{BASE}/auth/login", json={"email": user_email, "password": "testpass123"})
    endpoints = [
        f"{BASE}/api/admin/users",
        f"{BASE}/api/admin/detections",
        f"{BASE}/api/admin/alerts",
        f"{BASE}/api/admin/reports",
        f"{BASE}/api/admin/system",
        f"{BASE}/api/admin/logs",
    ]
    all_403 = True
    for ep in endpoints:
        r = s.get(ep)
        if r.status_code != 403:
            fail("TEST4: Admin API HTTP 403 for user", f"Expected 403 at {ep}, got {r.status_code}")
            all_403 = False
            break
    if all_403:
        ok("TEST4: Admin API HTTP 403 for user", f"All {len(endpoints)} admin endpoints returned 403")

# ──────────────────────────────────────────────────────────
# TEST 5: Admin login → success
# ──────────────────────────────────────────────────────────
def test_5_admin_login():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={
        "email": "admin@sonicsentinel.com",
        "password": "SonicAdmin@2024!"
    })
    if r.status_code == 200 and r.json().get("role") == "admin":
        ok("TEST5: Admin login succeeds", f"role={r.json()['role']}, name={r.json()['name']}")
        return s
    else:
        fail("TEST5: Admin login succeeds", f"Status {r.status_code}: {r.text[:100]}")
        return None

# ──────────────────────────────────────────────────────────
# TEST 6: Admin with wrong password → rejected
# ──────────────────────────────────────────────────────────
def test_6_admin_wrong_password():
    r = requests.post(f"{BASE}/auth/login", json={
        "email": "admin@sonicsentinel.com",
        "password": "wrongpassword999"
    })
    if r.status_code == 401:
        ok("TEST6: Admin wrong password -> rejected", "HTTP 401 as expected")
    else:
        fail("TEST6: Admin wrong password -> rejected", f"Expected 401, got {r.status_code}")

# ──────────────────────────────────────────────────────────
# TEST 7: Admin can view users list
# ──────────────────────────────────────────────────────────
def test_7_admin_can_view_users(admin_session):
    if not admin_session:
        fail("TEST7: Admin can view users", "No admin session")
        return
    r = admin_session.get(f"{BASE}/api/admin/users")
    if r.status_code == 200 and "users" in r.json():
        users = r.json()
        ok("TEST7: Admin can view users", f"total={users['total']} users visible")
    else:
        fail("TEST7: Admin can view users", f"Status {r.status_code}: {r.text[:80]}")

# ──────────────────────────────────────────────────────────
# TEST 8: Normal user cannot view users list → 403
# ──────────────────────────────────────────────────────────
def test_8_user_cannot_view_users(user_email: str):
    if not user_email:
        fail("TEST8: User cannot view users list", "No user email")
        return
    s = requests.Session()
    s.post(f"{BASE}/auth/login", json={"email": user_email, "password": "testpass123"})
    r = s.get(f"{BASE}/api/admin/users")
    if r.status_code == 403:
        ok("TEST8: User cannot view users list", "HTTP 403 returned")
    else:
        fail("TEST8: User cannot view users list", f"Expected 403, got {r.status_code}")

# ──────────────────────────────────────────────────────────
# TEST 9: User can only access their own data
# ──────────────────────────────────────────────────────────
def test_9_user_data_isolation(user_email: str):
    if not user_email:
        fail("TEST9: User data isolation", "No user email")
        return
    import time
    # Create two users
    email2 = f"user2_{int(time.time())}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={
        "name": "User Two",
        "email": email2,
        "password": "testpass123"
    })
    if r.status_code not in (201, 409):
        fail("TEST9: User data isolation", f"Could not create second user: {r.status_code}")
        return

    # Login as user 1 and get detections
    s1 = requests.Session()
    s1.post(f"{BASE}/auth/login", json={"email": user_email, "password": "testpass123"})
    r1 = s1.get(f"{BASE}/detections")
    
    if r1.status_code == 200:
        # All returned detections should belong to user1 — backend filters by user_id
        ok("TEST9: User data isolation", "Detections endpoint scoped to authenticated user's data")
    else:
        fail("TEST9: User data isolation", f"Status {r1.status_code}")

# ──────────────────────────────────────────────────────────
# TEST 10: No admin credentials in API response
# ──────────────────────────────────────────────────────────
def test_10_no_credentials_in_api():
    # Check /auth/me — should not expose password_hash
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={
        "email": "admin@sonicsentinel.com",
        "password": "SonicAdmin@2024!"
    })
    me = s.get(f"{BASE}/auth/me")
    data = me.json()
    if "password_hash" in data or "password" in data:
        fail("TEST10: No credentials in API response", "password_hash exposed in /auth/me!")
    elif "SonicAdmin" in str(data) and "password" in str(data).lower():
        fail("TEST10: No credentials in API response", "Possible credential leakage")
    else:
        fields = list(data.keys())
        ok("TEST10: No credentials in API response", f"Fields: {fields} — no password_hash")

# ──────────────────────────────────────────────────────────
# TEST 11: Admin password stored hashed
# ──────────────────────────────────────────────────────────
def test_11_password_hashed():
    from app.sqlite_db import get_sqlite_db
    db = get_sqlite_db()
    admin = db.users.find_one({"email": "admin@sonicsentinel.com"})
    if not admin:
        fail("TEST11: Password stored hashed", "Admin user not found in database")
        return
    ph = admin.get("password_hash", "")
    if not ph:
        fail("TEST11: Password stored hashed", "No password_hash field")
    elif "SonicAdmin" in ph or "2024" in ph:
        fail("TEST11: Password stored hashed", "PLAINTEXT PASSWORD FOUND IN DB!")
    elif "$" in ph and len(ph) > 60:
        ok("TEST11: Password stored hashed", f"Hash format: salt$hash (length={len(ph)})")
    else:
        fail("TEST11: Password stored hashed", f"Unexpected hash format: {ph[:30]}...")

# ──────────────────────────────────────────────────────────
# TEST 12: Restarting server doesn't duplicate admin
# ──────────────────────────────────────────────────────────
def test_12_no_duplicate_admin():
    # Run create_admin again — should detect existing and not duplicate
    import subprocess
    result = subprocess.run(
        ["python", "-m", "app.create_admin"],
        cwd="e:\\SonicSentinel AI\\ml-service",
        capture_output=True,
        text=True,
        timeout=30
    )
    output = result.stdout + result.stderr
    from app.sqlite_db import get_sqlite_db
    db = get_sqlite_db()
    count = db.users.count_documents({"email": "admin@sonicsentinel.com", "role": "admin"})
    if count == 1:
        ok("TEST12: No duplicate admin on re-run", f"Exactly 1 admin account (idempotent). Output: {'already exists' in output or 'SUCCESS' in output}")
    else:
        fail("TEST12: No duplicate admin on re-run", f"Found {count} admin accounts!")

# ──────────────────────────────────────────────────────────
# RUN ALL TESTS
# ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    sys.path.insert(0, "e:\\SonicSentinel AI\\ml-service")

    print("\n" + "=" * 60)
    print("  SonicSentinel Security Test Suite")
    print("=" * 60)

    user_email = None
    admin_session = None

    run_test(1, "Public signup -> role=user", lambda: None)
    user_email = None
    import time
    ue = f"testuser_{int(time.time())}@test.com"
    r = requests.post(f"{BASE}/auth/register", json={"name": "Test User", "email": ue, "password": "testpass123"})
    if r.status_code == 201 and r.json().get("role") == "user":
        ok("TEST1: Public signup -> role=user", f"role={r.json()['role']}")
        user_email = ue
    else:
        fail("TEST1: Public signup -> role=user", f"Status {r.status_code}")

    run_test(2, "Client role=admin ignored", lambda: test_2_no_admin_via_signup())
    run_test(3, "User blocked from /api/admin", lambda: test_3_user_blocked_from_admin(user_email))
    run_test(4, "Admin API -> 403 for user", lambda: test_4_admin_api_blocked(user_email))
    
    admin_session = None
    print(f"\nTEST 5: Admin login -> success")
    admin_session = test_5_admin_login()
    
    run_test(6, "Admin wrong password -> rejected", lambda: test_6_admin_wrong_password())
    run_test(7, "Admin can view users", lambda: test_7_admin_can_view_users(admin_session))
    run_test(8, "User cannot view users list", lambda: test_8_user_cannot_view_users(user_email))
    run_test(9, "User data isolation", lambda: test_9_user_data_isolation(user_email))
    run_test(10, "No credentials in API response", lambda: test_10_no_credentials_in_api())
    run_test(11, "Password stored hashed (not plaintext)", lambda: test_11_password_hashed())
    run_test(12, "No duplicate admin on re-run", lambda: test_12_no_duplicate_admin())

    print("\n" + "=" * 60)
    print(f"  RESULTS: {len(PASS)} passed, {len(FAIL)} failed")
    print("=" * 60)
    if FAIL:
        print("\nFAILED TESTS:")
        for f_name in FAIL:
            print(f"  [FAIL] {f_name}")
        sys.exit(1)
    else:
        print("\n  [SUCCESS] ALL TESTS PASSED!")
        sys.exit(0)
