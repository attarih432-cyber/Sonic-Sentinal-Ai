"""Prod-parity smoke test: the built SPA served by the backend at :8000.

The built frontend bases every API call on "/api/..." (admin double-prefixed
as "/api/api/admin/..."). In dev the Vite proxy strips the prefix; on Railway
the backend itself must serve those paths. This script exercises the exact
URLs the deployed app produces, directly against the backend.
"""
import re
import sys

import requests

BASE = "http://127.0.0.1:8000"
PASS = 0
FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name}  {extra}")


s = requests.Session()

r = s.get(f"{BASE}/health", timeout=30)
check("health 200", r.status_code == 200, str(r.status_code))
check("health says ok", '"status":"ok"' in r.text, r.text[:120])

r = s.get(f"{BASE}/", timeout=30)
check("root serves SPA", r.status_code == 200 and "<div id=\"root\">" in r.text,
      f"{r.status_code} {r.text[:80]}")

r = s.get(f"{BASE}/tm-model/model.json", timeout=30)
check("tm-model model.json 200", r.status_code == 200 and '"modelTopology"' in r.text[:2000],
      str(r.status_code))

r = s.get(f"{BASE}/v1/models", timeout=30)
check("/v1/models is honest 404", r.status_code == 404, str(r.status_code))

# --- login through the /api prefix exactly like the built SPA ---
r = s.post(f"{BASE}/api/auth/login", json={
    "email": "admin@sonicsentinel.com",
    "password": "SonicAdmin@2024!",
}, timeout=30)
check("POST /api/auth/login 200 (middleware strips /api)", r.status_code == 200, str(r.status_code))

r = s.get(f"{BASE}/api/auth/me", timeout=30)
check("/api/auth/me 200 role=admin",
      r.status_code == 200 and r.json().get("role") == "admin", f"{r.status_code} {r.text[:120]}")

r = s.get(f"{BASE}/auth/me", timeout=30)
check("native /auth/me 200", r.status_code == 200 and r.json().get("role") == "admin", str(r.status_code))

# Admin APIs both as the cloud calls them (/api/api/admin/...) and natively
r = s.get(f"{BASE}/api/admin/overview", timeout=30)
c1 = r.status_code == 200 and "totalUsers" in r.json() and "totalDetections" in r.json()
check("/api/admin/overview 200 with counts", c1, f"{r.status_code} {r.text[:120]}")

r = s.get(f"{BASE}/api/api/admin/overview", timeout=30)
c2 = r.status_code == 200 and "totalUsers" in r.json() and "totalDetections" in r.json()
check("/api/api/admin/overview 200 (doubled prefix, built-SPA path)", c2, f"{r.status_code} {r.text[:120]}")

r = s.get(f"{BASE}/api/admin/system", timeout=30)
check("/api/admin/system 200", r.status_code == 200, str(r.status_code))

# Static asset referenced by the built index.html
html = s.get(f"{BASE}/", timeout=30).text
m = re.search(r'src="(/assets/[^"]+\.js)"', html)
if m:
    r = s.get(f"{BASE}{m.group(1)}", timeout=30)
    check(f"asset {m.group(1)} 200", r.status_code == 200 and len(r.content) > 10000,
          f"{r.status_code} {len(r.content)}B")
else:
    check("built index references /assets/*.js", False, html[:160])

# Non-admin must be blocked from /api/admin/*
s2 = requests.Session()
r = s2.post(f"{BASE}/api/auth/login", json={
    "email": "live.tester@sonicsentinel-ai.com",
    "password": "LiveTester@2026!",
}, timeout=30)
check("tester login 200", r.status_code == 200, str(r.status_code))
r = s2.get(f"{BASE}/api/admin/overview", timeout=30)
check("tester blocked from admin (403)", r.status_code == 403, str(r.status_code))

print(f"\nprod-parity: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)