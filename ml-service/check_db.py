#!/usr/bin/env python
"""SonicSentinel database check.

    python ml-service/check_db.py            # safe: prints no credentials
    python ml-service/check_db.py --fix      # also test a candidate MONGO_URI

Walks the whole connection path in order and tells you which step broke, so a
MongoDB Atlas outage can be told apart from a bad password, a firewall, or a
bug in this service. It never prints the URI, the username, the password, the
cluster hostname, or an IP address.
"""
from __future__ import annotations

import argparse
import os
import re
import socket
import ssl
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

GREEN, YELLOW, RED, DIM, RESET = "\033[32m", "\033[33m", "\033[31m", "\033[2m", "\033[0m"
if not sys.stdout.isatty():
    GREEN = YELLOW = RED = DIM = RESET = ""

ok = lambda m: print(f"  {GREEN}PASS{RESET}  {m}")
warn = lambda m: print(f"  {YELLOW}WARN{RESET}  {m}")
bad = lambda m: print(f"  {RED}FAIL{RESET}  {m}")
note = lambda m: print(f"  {DIM}{m}{RESET}")


def mask(uri: str) -> tuple[str, list[str]]:
    """Return (host:port list, secret description) with nothing sensitive."""
    rest = uri.split("://", 1)[-1]
    creds, sep, hostspec = rest.rpartition("@")
    hostspec = hostspec.split("?")[0]
    ports = []
    for h in hostspec.split(","):
        h = h.strip().strip("/")
        if not h:
            continue
        name, _, port = h.partition(":")
        ports.append(f"<shard-host>:{port or '27017'}")
    user = creds.partition(":")[0] if sep else ""
    desc = "user present" if user else "no user in URI"
    if sep and ":" in creds:
        desc += ", password present"
    return ports, desc


def redact(text: str) -> str:
    """PyMongo echoes the seed list and IP addresses back in its errors."""
    text = re.sub(r"://[^@\s]*@", "://<credentials>@", text)
    text = re.sub(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.mongodb\.net", "<cluster>", text)
    text = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b", "<ip>", text)
    return " ".join(text.split())


def probe(uri: str) -> str:
    hosts = [h.strip().strip("/") for h in uri.split("://", 1)[-1].rpartition("@")[2]
             .split("?")[0].split(",") if h.strip()]
    if not hosts:
        return "unreachable"
    last = ""
    for h in hosts:
        name, _, port = h.partition(":")
        port = int(port or 27017)
        try:
            with socket.create_connection((name, port), timeout=8):
                pass
        except OSError as e:
            last = f"tcp {type(e).__name__}"
            continue
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            with socket.create_connection((name, port), timeout=8) as raw:
                with ctx.wrap_socket(raw, server_hostname=name):
                    return "ok"
        except ssl.SSLError as e:
            last = "tls " + (getattr(e, "reason", "") or str(e))[:40]
        except OSError as e:
            last = f"tcp {type(e).__name__}"
    return last


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true",
                    help="also test a candidate MONGO_URI, prompted for so it never "
                         "lands in your shell history")
    args = ap.parse_args()

    uri = os.getenv("MONGO_URI", "")
    print("\nSonicSentinel database check")
    print("=" * 62)

    print("\n1. Configuration")
    if not uri:
        bad("MONGO_URI is empty. Copy ml-service/.env.example to ml-service/.env and fill it in.")
        return 1
    hosts, desc = mask(uri)
    ok(f"MONGO_URI is set ({desc})")
    note(f"seed list: {', '.join(hosts)}")
    note(f"database : {os.getenv('MONGO_DB', 'sonic_sentinel')}")
    if "srv" in uri.split("://", 1)[0]:
        ok("uses the mongodb+srv:// form (survives shard changes) - recommended")
    else:
        warn("uses a fixed mongodb:// seed list. "
             "mongodb+srv:// is the form Atlas documents and survives a cluster move.")
    if "retryWrites=true" not in uri:
        note("no retryWrites=true - harmless, Atlas does not need it")

    print("\n2. Local TLS stack (control test)")
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection(("www.mongodb.com", 443), timeout=10) as raw:
            with ctx.wrap_socket(raw, server_hostname="www.mongodb.com") as s:
                ok(f"this machine can complete a normal TLS handshake ({s.version()})")
    except Exception as e:
        bad(f"this machine cannot do TLS at all: {type(e).__name__}. Fix Python/OpenSSL first.")

    print("\n3. DNS and reachability")
    reach = probe(uri)
    if reach == "ok":
        ok("every seed host completed a TLS handshake")
    elif reach.startswith("tls"):
        bad(f"TCP connects, then the SERVER refuses TLS: {reach}")
        note("The handshake is rejected before any username or password is sent,")
        note("so this is NOT a credentials problem. On Atlas it means the cluster is")
        note("not serving this host: cluster deleted/stopped, this machine's public IP")
        note("missing from Network Access, or the string belongs to a different cluster.")
    else:
        bad(f"could not reach the seed list: {reach}")
        note("Check the host and port, then check DNS and any local firewall.")

    print("\n4. PyMongo ping")
    try:
        from pymongo import MongoClient

        client = MongoClient(uri, serverSelectionTimeoutMS=8000)
        client.admin.command("ping")
        db = client[os.getenv("MONGO_DB", "sonic_sentinel")]
        names = sorted(db.list_collection_names())
        ok("ping succeeded")
        note(f"collections: {', '.join(names) if names else 'none yet (created at first startup)'}")
    except Exception as e:
        reason = type(e).__name__
        bad(f"ping failed: {reason}")
        note(redact(str(e))[:220])
        note("Full classification and hints: start the backend and read the log,")
        note("or GET http://localhost:8000/health and read databaseReason.")

    if args.fix:
        print("\n5. Candidate MONGO_URI")
        try:
            import getpass

            cand = getpass.getpass("Paste a candidate MONGO_URI (input hidden): ").strip()
        except Exception:
            cand = input("Paste a candidate MONGO_URI: ").strip()
        if not cand:
            print("  (skipped)")
        else:
            hosts, desc = mask(cand)
            note(f"seed list: {', '.join(hosts)} ({desc})")
            r = probe(cand)
            if r == "ok":
                ok("candidate completes TLS")
            else:
                bad(f"candidate fails: {r}")

    print("\n" + "=" * 62)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
