#!/usr/bin/env python3
"""SonicSentinel Admin Creator — Secure server-side tool.

Usage:
    python -m app.create_admin

Environment variables (set in ml-service/.env):
    ADMIN_USERNAME   — display name for the admin account
    ADMIN_EMAIL      — email address for the admin account
    ADMIN_PASSWORD   — strong password (min 12 characters recommended)

SECURITY:
  - Password is NEVER printed, logged, or stored in plaintext.
  - Will NOT create duplicate admin accounts (idempotent).
  - Admin accounts CANNOT be created through the public signup page.
  - This script must be run manually by a system administrator.

Example:
    cd ml-service
    ADMIN_EMAIL=admin@sonicsentinel.com ADMIN_PASSWORD=MyStr0ng!Pass python -m app.create_admin
"""
from __future__ import annotations

import hashlib
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv

# Load environment from ml-service/.env
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def encode_password(password: str, salt: str | None = None) -> str:
    """PBKDF2-SHA256 password hashing with 310,000 iterations."""
    salt = salt or secrets.token_hex(16)
    return salt + "$" + hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 310_000
    ).hex()


def main() -> None:
    print("=" * 60)
    print("  SonicSentinel Admin Account Creator")
    print("=" * 60)

    # Read credentials from environment variables
    admin_email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    admin_name = os.getenv("ADMIN_USERNAME", "Admin").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "").strip()

    # Validate inputs
    errors = []
    if not admin_email:
        errors.append("ADMIN_EMAIL environment variable is not set")
    if not admin_password:
        errors.append("ADMIN_PASSWORD environment variable is not set")
    elif len(admin_password) < 8:
        errors.append("ADMIN_PASSWORD must be at least 8 characters")
    if not admin_name:
        admin_name = "Admin"

    if errors:
        print("\n[ERROR] Cannot create admin account:")
        for e in errors:
            print(f"  - {e}")
        print("\nSet these in ml-service/.env or as environment variables:")
        print("  ADMIN_EMAIL=admin@yourcompany.com")
        print("  ADMIN_PASSWORD=<strong-password>")
        print("  ADMIN_USERNAME=Admin (optional, defaults to 'Admin')")
        sys.exit(1)

    # Import database after environment is loaded
    from app.sqlite_db import get_sqlite_db

    USE_SQLITE = os.getenv("USE_SQLITE", "true").lower() in {"true", "1", "yes"}

    if USE_SQLITE:
        db = get_sqlite_db()
    else:
        from pymongo import MongoClient
        MONGO_URI = os.getenv("MONGO_URI", "")
        MONGO_DB = os.getenv("MONGO_DB", "sonic_sentinel")
        if not MONGO_URI:
            print("[ERROR] MONGO_URI is not set in .env")
            sys.exit(1)
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=6000)
        db = client[MONGO_DB]

    print(f"\nChecking for existing admin account: {admin_email}")

    # Check if admin already exists
    existing = db.users.find_one({"email": admin_email})
    if existing:
        if existing.get("role") == "admin":
            print(f"\n[OK] Admin account already exists for: {admin_email}")
            print("     No duplicate was created. (Idempotent — safe to re-run.)")
            sys.exit(0)
        else:
            # Upgrade existing user to admin
            print(f"\n[INFO] Found existing user account with this email.")
            print(f"       Upgrading role to admin...")
            db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"role": "admin", "name": admin_name}},
            )
            print(f"\n[SUCCESS] User account upgraded to admin: {admin_email}")
            sys.exit(0)

    # Hash password — NEVER store or print plaintext
    print("\nHashing password (PBKDF2-SHA256, 310,000 iterations)...")
    password_hash = encode_password(admin_password)

    # Create admin user document
    admin_doc = {
        "_id": ObjectId(secrets.token_hex(12)),
        "name": admin_name,
        "email": admin_email,
        "password_hash": password_hash,
        "role": "admin",   # Server-assigned — never from client
        "active": True,
        "created_at": now(),
    }

    # Ensure collections exist
    db.create_collection("users")

    try:
        result = db.users.insert_one(admin_doc)
        print(f"\n[SUCCESS] Admin account created successfully!")
        print(f"  Name  : {admin_name}")
        print(f"  Email : {admin_email}")
        print(f"  Role  : admin")
        print(f"  ID    : {result.inserted_id}")
        print(f"\nAdmin login URL: http://localhost:5173/admin/login")
        print("\nIMPORTANT: Do not share or log the ADMIN_PASSWORD.")
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            print(f"\n[OK] Admin account already exists (concurrent creation detected).")
        else:
            print(f"\n[ERROR] Failed to create admin account: {e}")
            sys.exit(1)

    print("=" * 60)


if __name__ == "__main__":
    main()
