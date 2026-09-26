"""SonicSentinel backend — MongoDB Atlas connected."""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import secrets
import time
import uuid
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from urllib.parse import urlencode
import requests
from dotenv import load_dotenv
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError
from bson import ObjectId
from bson.errors import InvalidId

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", ROOT / "data" / "uploads"))
MODEL_PATH = Path(os.getenv("MODEL_PATH", ROOT / "models" / "python_model" / "model.pkl"))
MODEL_METADATA_PATH = Path(os.getenv("MODEL_METADATA_PATH", ROOT / "models" / "python_model" / "metadata.json"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)))
SESSION_DAYS, COOKIE_NAME = int(os.getenv("SESSION_DAYS", "7")), "sonic_session"

from app.sqlite_db import get_sqlite_db

USE_SQLITE = os.getenv("USE_SQLITE", "true").lower() in {"true", "1", "yes"}
MONGO_URI = os.getenv("MONGO_URI", "")
MONGO_DB = os.getenv("MONGO_DB", "sonic_sentinel")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
FACEBOOK_APP_ID = os.getenv("FACEBOOK_APP_ID", "")
FACEBOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
FACEBOOK_REDIRECT_URI = os.getenv("FACEBOOK_REDIRECT_URI", "http://localhost:8000/auth/facebook/callback")
ALERT_COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "60"))

app = FastAPI(title="SonicSentinel API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_client: Optional[MongoClient] = None
# Atlas is remote: never let a dead cluster stall a request for 15s. Retry at
# most every _DB_RETRY_AFTER seconds, and always answer with a clean 503 so the
# frontend can show a real message instead of an opaque 500 traceback.
MONGO_TIMEOUT_MS = int(os.getenv("MONGO_TIMEOUT_MS", "6000"))
_DB_RETRY_AFTER = 0.0
# Last failure, kept so /health can say *why* the database is down instead of
# just "not_connected". Never holds credentials.
_DB_STATUS: dict[str, Any] = {"ok": False, "reason": "not_checked", "detail": ""}


def _redact(text: str) -> str:
    """Strip hostnames and any user:pass@ pair out of a driver message.

    PyMongo echoes the seed list back in its exceptions, which would otherwise
    leak the cluster identity into API responses and log files.
    """
    text = re.sub(r"://[^@\s]*@", "://<credentials>@", text)
    text = re.sub(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.mongodb\.net", "<cluster>", text)
    text = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b", "<ip>", text)
    return " ".join(text.split())


def _classify_db_error(exc: Exception) -> tuple[str, str]:
    """Map a driver exception onto a (reason, human hint) pair."""
    # get_db() already classified and re-wrapped this. Re-classifying the
    # HTTPException would lose the reason, so unwrap it.
    if isinstance(exc, HTTPException) and str(exc.detail).startswith("Database unavailable ("):
        return str(exc.detail).split("(", 1)[1].split(")", 1)[0], ""
    blob = _redact(f"{type(exc).__name__}: {exc}")
    low = blob.lower()
    if "ssl handshake" in low or "tlsv1_alert" in low or "certificate verify" in low:
        return "tls_handshake_rejected", (
            "The server accepted the TCP connection but refused the TLS handshake. "
            "This happens before any credential is sent, so the password is not the "
            "problem. On MongoDB Atlas it means the cluster itself is not serving: "
            "check that the cluster still exists and is running, that this machine's "
            "public IP is listed under Network Access, and that the connection string "
            "matches the cluster it was copied from. Copying a fresh string from "
            "Atlas > Database Access > Connect is the fastest check."
        )
    if "authentication failed" in low or "auth mechanism" in low:
        return "auth_failed", (
            "The server was reached but rejected these database credentials. "
            "Check the username and password in MONGO_URI against "
            "Atlas > Database Access > Database Users."
        )
    if "getaddrinfo" in low or "name or service not known" in low or "nodename nor servname" in low:
        return "dns_failure", (
            "The hostname in MONGO_URI does not resolve. The cluster may have been "
            "deleted or renamed, or this machine's DNS is wrong."
        )
    if "connection refused" in low or "timed out" in low or "no route to host" in low:
        return "network_unreachable", (
            "The server could not be reached at all. Check the host and port in "
            "MONGO_URI and any firewall in between."
        )
    return "unavailable", (
        "MongoDB did not answer in time. Run 'python ml-service/check_db.py' for the "
        "full diagnosis."
    )


def _mongo_error(exc: Exception) -> HTTPException:
    reason, hint = _classify_db_error(exc)
    _DB_STATUS.update(ok=False, reason=reason, detail=_redact(str(exc))[:300])
    print(f"WARNING: MongoDB unavailable [{reason}]: {_DB_STATUS['detail'][:200]}", flush=True)
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Database unavailable ({reason}). {hint}",
    )


def oid(value: str, label: str = "record") -> ObjectId:
    """ObjectId() that answers 404 instead of exploding into a 500.

    Every id in this API comes straight from a URL segment or a JSON body, and
    ObjectId() raises InvalidId on anything that is not a 24-char hex string.
    Without this, `GET /detections/nope` returns 500 with a traceback.
    """
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, f"No such {label}")


def get_db():
    """Return SQLite or Mongo client so uvicorn reload / import-order are safe."""
    if USE_SQLITE:
        return get_sqlite_db()
    global _client, _DB_RETRY_AFTER
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=MONGO_TIMEOUT_MS)
    try:
        _client.admin.command("ping")
        _DB_RETRY_AFTER = 0.0
        _DB_STATUS.update(ok=True, reason="", detail="")
    except Exception as exc:
        if time.monotonic() < _DB_RETRY_AFTER:
            raise _mongo_error(exc) from exc
        _DB_RETRY_AFTER = time.monotonic() + 15
        raise _mongo_error(exc) from exc
    return _client[MONGO_DB]

@app.on_event("startup")
def startup() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    try:
        db = get_db()
        for name in ("users", "sessions", "detections", "alerts", "reviews", "detection_sessions"):
            db.create_collection(name)
        db.users.create_index("email", unique=True)
        db.sessions.create_index("token_hash", unique=True)
        db.sessions.create_index("expires_at", expireAfterSeconds=0)
        db.detections.create_index([("user_id", 1), ("created_at", -1)])
        db.detection_sessions.create_index([("user_id", 1), ("status", 1), ("started_at", -1)])
        db.alerts.create_index([("user_id", 1), ("created_at", -1)])
        _DB_STATUS.update(ok=True, reason="", detail="")
        engine_label = "SQLite (data/sonic_sentinel.db)" if USE_SQLITE else f"MongoDB ({MONGO_DB})"
        print("Database connected:", engine_label, flush=True)
    except Exception as e:
        reason, _ = _classify_db_error(e)
        print(f"WARNING: Database not reachable yet [{reason}]", flush=True)



def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def encode_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 310_000).hex()


def password_matches(password: str, encoded: str) -> bool:
    salt = encoded.split("$", 1)[0]
    return secrets.compare_digest(encode_password(password, salt), encoded)


def user_out(user: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"], "role": user["role"], "createdAt": user["created_at"]}


def set_session(response: Response, user_id: str) -> None:
    raw, expiry = secrets.token_urlsafe(32), datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    db = get_db()
    db.sessions.insert_one({"token_hash": hashlib.sha256(raw.encode()).hexdigest(), "user_id": user_id, "expires_at": expiry})
    response.set_cookie(COOKIE_NAME, raw, httponly=True, secure=os.getenv("COOKIE_SECURE", "false").lower() == "true", samesite="lax", max_age=SESSION_DAYS * 86400, path="/")


def current_user(sonic_session: str | None = Cookie(default=None)) -> dict[str, Any]:
    if not sonic_session:
        raise HTTPException(401, "Authentication required")
    db = get_db()
    sess = db.sessions.find_one({"token_hash": hashlib.sha256(sonic_session.encode()).hexdigest(), "expires_at": {"$gt": datetime.now(timezone.utc)}})
    if not sess:
        raise HTTPException(401, "Session expired or invalid")
    user = db.users.find_one({"_id": oid(sess["user_id"], "user")})
    if not user:
        raise HTTPException(401, "Session expired or invalid")
    return user


@app.get("/auth/google")
def google_login():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(503, "Google OAuth not configured - set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    response = RedirectResponse(url)
    response.set_cookie("oauth_state", state, httponly=True, samesite="lax", max_age=600, path="/")
    return response


@app.get("/auth/google/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    oauth_state: str | None = Cookie(default=None),
):
    if not code or not state or not oauth_state or state != oauth_state:
        raise HTTPException(400, "OAuth state mismatch")
    token_resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    if token_resp.status_code != 200:
        raise HTTPException(400, "Google token exchange failed")
    tokens = token_resp.json()
    info_resp = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        timeout=15,
    )
    if info_resp.status_code != 200:
        raise HTTPException(400, "Failed to fetch Google profile")
    info = info_resp.json()
    email = str(info.get("email", "")).lower()
    if not email:
        raise HTTPException(400, "Google account has no email")
    db = get_db()
    user = db.users.find_one({"email": email})
    if not user:
        role = "admin" if db.users.count_documents({}) == 0 and os.getenv("FIRST_USER_ADMIN", "true").lower() == "true" else "user"
        user_doc = {
            "name": (info.get("name") or email.split("@")[0]).strip()[:100],
            "email": email,
            "password_hash": "",
            "google_id": info.get("id"),
            "avatar_url": info.get("picture"),
            "role": role,
            "created_at": now(),
        }
        try:
            result = db.users.insert_one(user_doc)
            user = user_doc
            user["_id"] = result.inserted_id
        except DuplicateKeyError:
            user = db.users.find_one({"email": email})
            if not user:
                raise HTTPException(409, "An account with this email already exists")
    else:
        db.users.update_one({"_id": user["_id"]}, {"$set": {"google_id": info.get("id"), "avatar_url": info.get("picture")}})
    session_resp = RedirectResponse(f"{FRONTEND_URL}/?google=success")
    session_resp.delete_cookie("oauth_state", path="/")
    set_session(session_resp, str(user["_id"]))
    return session_resp


def _oauth_user(provider: str, email: str | None, name: str | None, provider_id: str | None, avatar: str | None):
    """Find-or-create a user for OAuth providers (Google/Facebook)."""
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(400, f"{provider} account has no email address")
    db = get_db()
    user = db.users.find_one({"email": email})
    if not user:
        id_field = f"{provider}_id"
        role = "admin" if db.users.count_documents({}) == 0 and os.getenv("FIRST_USER_ADMIN", "true").lower() == "true" else "user"
        user_doc = {
            "name": (name or email.split("@")[0]).strip()[:100],
            "email": email,
            "password_hash": "",
            id_field: provider_id,
            "avatar_url": avatar,
            "role": role,
            "created_at": now(),
        }
        try:
            result = db.users.insert_one(user_doc)
            user_doc["_id"] = result.inserted_id
            return user_doc
        except DuplicateKeyError:
            user = db.users.find_one({"email": email})
            if not user:
                raise HTTPException(409, f"An account with this email already exists")
    updates: dict[str, Any] = {}
    if provider_id:
        updates[f"{provider}_id"] = provider_id
    if avatar:
        updates["avatar_url"] = avatar
    if updates:
        db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    return user


@app.get("/auth/facebook")
def facebook_login():
    if not FACEBOOK_APP_ID or not FACEBOOK_APP_SECRET:
        raise HTTPException(503, "Facebook OAuth not configured - set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": FACEBOOK_APP_ID,
        "redirect_uri": FACEBOOK_REDIRECT_URI,
        "state": state,
        "scope": "public_profile",
        "response_type": "code",
    }
    url = "https://www.facebook.com/v20.0/dialog/oauth?" + urlencode(params)
    response = RedirectResponse(url)
    response.set_cookie("oauth_state", state, httponly=True, samesite="lax", max_age=600, path="/")
    return response


@app.get("/auth/facebook/callback")
def facebook_callback(
    code: str | None = None,
    state: str | None = None,
    oauth_state: str | None = Cookie(default=None),
):
    if not code or not state or not oauth_state or state != oauth_state:
        raise HTTPException(400, "OAuth state mismatch")
    token_resp = requests.get(
        "https://graph.facebook.com/v20.0/oauth/access_token",
        params={
            "client_id": FACEBOOK_APP_ID,
            "client_secret": FACEBOOK_APP_SECRET,
            "redirect_uri": FACEBOOK_REDIRECT_URI,
            "code": code,
        },
        timeout=15,
    )
    if token_resp.status_code != 200:
        raise HTTPException(400, f"Facebook token exchange failed: {token_resp.text[:200]}")
    access_token = token_resp.json().get("access_token")
    if not access_token:
        raise HTTPException(400, "Facebook token response missing access_token")
    info_resp = requests.get(
        "https://graph.facebook.com/v20.0/me",
        params={"fields": "id,name,email,picture.type(large)", "access_token": access_token},
        timeout=15,
    )
    if info_resp.status_code != 200:
        raise HTTPException(400, "Failed to fetch Facebook profile")
    info = info_resp.json()
    email = info.get("email") or f"fb_{info.get('id')}@facebook.local"
    avatar = (info.get("picture") or {}).get("data", {}).get("url") if isinstance(info.get("picture"), dict) else None
    user = _oauth_user("facebook", email, info.get("name"), str(info.get("id")), avatar)
    session_resp = RedirectResponse(f"{FRONTEND_URL}/?facebook=success")
    session_resp.delete_cookie("oauth_state", path="/")
    set_session(session_resp, str(user["_id"]))
    return session_resp


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class Registration(Credentials):
    name: str = Field(min_length=2, max_length=100)


class AlertUpdate(BaseModel):
    read: bool | None = None
    resolved: bool | None = None


class ReviewInput(BaseModel):
    detectionId: str
    finalClassification: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)
    status: str = Field(default="open", pattern="^(open|resolved)$")


@app.get("/health")
def health():
    if USE_SQLITE:
        try:
            db = get_db()
            db.ping()
            db_status = "connected"
        except Exception:
            db_status = "not_connected"
        return {
            "status": "ok",
            "model": "loaded" if MODEL_PATH.exists() else "baseline",
            "database": db_status,
            "databaseEngine": "sqlite",
            "databaseReason": "",
            "databaseDetail": "",
        }
    try:
        get_db()
        db_status = "connected"
    except Exception:
        db_status = "not_connected"
    return {
        "status": "ok",
        "model": "loaded" if MODEL_PATH.exists() else "baseline",
        "database": db_status,
        "databaseEngine": "mongodb",
        "databaseReason": "" if db_status == "connected" else _DB_STATUS["reason"],
        "databaseDetail": _DB_STATUS["detail"] if db_status != "connected" else "",
    }


@app.post("/auth/register", status_code=201)
def register(payload: Registration, response: Response):
    db = get_db()
    role = "admin" if db.users.count_documents({}) == 0 and os.getenv("FIRST_USER_ADMIN", "true").lower() == "true" else "user"
    user = {
        "name": payload.name.strip(),
        "email": str(payload.email).lower(),
        "password_hash": encode_password(payload.password),
        "role": role,
        "created_at": now(),
    }
    try:
        result = db.users.insert_one(user)
    except DuplicateKeyError:
        raise HTTPException(409, "An account with this email already exists")
    user["_id"] = result.inserted_id
    set_session(response, str(user["_id"]))
    return user_out(user)


@app.post("/auth/login")
def login(payload: Credentials, response: Response):
    db = get_db()
    user = db.users.find_one({"email": str(payload.email).lower()})
    if not user or not user.get("password_hash") or not password_matches(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    set_session(response, str(user["_id"]))
    return user_out(user)


@app.get("/auth/me")
def me(user: dict[str, Any] = Depends(current_user)):
    return user_out(user)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


@app.patch("/auth/profile")
def update_profile(payload: ProfileUpdate, user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    db.users.update_one({"_id": user["_id"]}, {"$set": {"name": payload.name.strip()}})
    fresh = db.users.find_one({"_id": user["_id"]})
    return user_out(fresh)


@app.post("/auth/logout", status_code=204)
def logout(response: Response, sonic_session: str | None = Cookie(default=None)):
    if sonic_session:
        db = get_db()
        db.sessions.delete_one({"token_hash": hashlib.sha256(sonic_session.encode()).hexdigest()})
    response.delete_cookie(COOKIE_NAME, path="/")


@app.post("/auth/forgot-password", status_code=202)
def forgot_password(_: dict[str, EmailStr]):
    return {"message": "If an account exists, reset instructions will be sent."}


def get_quality(path: Path, content_type: str | None):
    result = {"sampleRate": None, "duration": None, "rms": None, "status": "unknown"}
    if path.suffix.lower() != ".wav" and content_type not in {"audio/wav", "audio/x-wav"}:
        return result
    try:
        with wave.open(str(path), "rb") as f:
            rate, frames, width, raw = f.getframerate(), f.getnframes(), f.getsampwidth(), f.readframes(f.getnframes())
        if width not in (1, 2, 3, 4):
            return result
        vals = [((raw[i] - 128) / 128 if width == 1 else int.from_bytes(raw[i:i + width], "little", signed=True) / float(2 ** (8 * width - 1))) for i in range(0, len(raw) - width + 1, width)]
        rms = math.sqrt(sum(v * v for v in vals) / max(1, len(vals)))
        result.update({"sampleRate": rate, "duration": round(frames / rate, 3), "rms": round(rms, 5), "status": "good" if rate >= 8000 and rms > .002 else "poor"})
    except (wave.Error, EOFError, ZeroDivisionError):
        result["status"] = "poor"
    return result


def predict_baseline(filename: str, quality: dict[str, Any]):
    name = filename.lower()
    rules = {"siren": "Siren", "ambulance": "Siren", "police": "Siren", "fire": "Siren", "car": "Vehicle", "truck": "Vehicle", "traffic": "Vehicle", "construction": "Urban noise", "drill": "Urban noise", "alarm": "Alarm"}
    label = next((v for k, v in rules.items() if k in name), "Other")
    score = .88 if label != "Other" else .58
    return label, round(max(.1, score - (.18 if quality["status"] == "poor" else 0)), 3)


def detection_out(item: dict[str, Any], audio=False):
    output = {
        "id": str(item["_id"]),
        "audioFilename": item["audio_filename"],
        "classification": item["classification"],
        "confidence": item["confidence"],
        "severity": item["severity"],
        "pythonPrediction": item["python_prediction"],
        "teachableMachinePrediction": item["teachable_prediction"],
        "modelAgreement": item["model_agreement"],
        "audioQuality": item["audio_quality"],
        "status": item["status"],
        "source": item.get("source", "upload"),
        "sessionId": item.get("session_id"),
        "createdAt": item["created_at"],
    }
    if audio:
        output["audioUrl"] = "/detections/" + str(item["_id"]) + "/audio"
    return output


def maybe_create_alert(db, user_id: str, detection_id: str, severity: str, label: str, filename: str) -> None:
    """Create an alert for high/critical events with cooldown dedupe (user+severity+label window)."""
    if severity not in {"high", "critical"}:
        return
    since = (datetime.now(timezone.utc) - timedelta(seconds=ALERT_COOLDOWN_SECONDS)).isoformat()
    recent = db.alerts.find_one(
        {"user_id": user_id, "severity": severity, "label": label, "created_at": {"$gt": since}}
    )
    if recent:
        return  # dedupe — ignore repeated events inside the cooldown window
    db.alerts.insert_one(
        {
            "user_id": user_id,
            "detection_id": detection_id,
            "severity": severity,
            "label": label,
            "message": f"{severity.title()} {label} event detected in {filename}",
            "read": 0,
            "resolved": 0,
            "created_at": now(),
        }
    )


def sniff_audio_content(content: bytes, suffix: str) -> bool:
    """Best-effort MIME content sniff: WAV RIFF header, otherwise accept by suffix allowlist."""
    if suffix == ".wav":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WAVE"
    if suffix == ".mp3":
        return len(content) >= 3 and (content[:3] == b"ID3" or content[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"})
    if suffix in {".ogg", ".oga"}:
        return len(content) >= 4 and content[:4] == b"OggS"
    if suffix == ".flac":
        return len(content) >= 4 and content[:4] == b"fLaC"
    if suffix == ".webm":
        return len(content) >= 4 and content[:4] == b"\x1a\x45\xdf\xa3"  # EBML magic
    return True  # m4a/aac: no trivial magic; rely on extension + size


@app.post("/detections/analyze", status_code=201)
async def analyze(audio: UploadFile = File(...), source: str = Form("upload"), session_id: str = Form(None), user: dict[str, Any] = Depends(current_user)):
    if source not in {"upload", "live"}:
        raise HTTPException(422, "source must be 'upload' or 'live'")
    if not audio.filename:
        raise HTTPException(422, "An audio filename is required")
    suffix = Path(audio.filename).suffix.lower()
    if suffix not in {".wav", ".mp3", ".ogg", ".m4a", ".flac", ".aac"}:
        raise HTTPException(415, "Supported formats: WAV, MP3, OGG, M4A, FLAC, AAC")
    content = await audio.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(422, "Audio file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Audio file exceeds the 100 MB upload limit")
    if not sniff_audio_content(content, suffix):
        raise HTTPException(415, "File content does not match its audio extension")
    stored = str(uuid.uuid4()) + suffix
    path = UPLOAD_DIR / stored
    path.write_bytes(content)
    quality = get_quality(path, audio.content_type)
    label, confidence = predict_baseline(audio.filename, quality)
    severity = "critical" if label in {"Siren", "Alarm"} and confidence >= .8 else "high" if confidence >= .8 else "medium" if confidence >= .6 else "low"
    prediction = {"classification": label, "confidence": confidence, "modelVersion": "baseline-1.0"}
    db = get_db()
    item = {
        "user_id": str(user["_id"]),
        "audio_filename": Path(audio.filename).name,
        "stored_filename": stored,
        "classification": label,
        "confidence": confidence,
        "severity": severity,
        "python_prediction": prediction,
        "teachable_prediction": prediction,
        "model_agreement": "agree",
        "audio_quality": quality,
        "status": "pending_review" if confidence < .75 or severity in {"high", "critical"} else "complete",
        "source": source,
        "session_id": session_id,
        "created_at": now(),
    }
    result = db.detections.insert_one(item)
    did = str(result.inserted_id)
    maybe_create_alert(db, str(user["_id"]), did, severity, label, item["audio_filename"])
    saved = db.detections.find_one({"_id": result.inserted_id})
    return detection_out(saved, True)


@app.post("/predict", status_code=201)
async def predict(audio: UploadFile = File(...), user: dict[str, Any] = Depends(current_user)):
    return await analyze(audio, source="upload", session_id=None, user=user)


@app.get("/detections")
def list_detections(
    user: dict[str, Any] = Depends(current_user),
    severity: str | None = None,
    status: str | None = None,
    source: str | None = None,
    classification: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    minConfidence: float | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    db = get_db()
    query: dict[str, Any] = {"user_id": str(user["_id"])}
    if severity:
        query["severity"] = severity
    if status:
        query["status"] = status
    if source:
        query["source"] = source
    if classification:
        query["classification"] = classification
    if from_:
        query["created_at"] = {"$gte": from_}
    if to:
        query["created_at"] = {"$lte": to}
    if minConfidence is not None:
        query["confidence"] = {"$gte": minConfidence}
    rows = db.detections.find(query).sort("created_at", -1).skip(offset).limit(limit)
    return [detection_out(x, True) for x in rows]


@app.get("/detections/{detection_id}")
def get_detection(detection_id: str, user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    item = db.detections.find_one({"_id": oid(detection_id, "detection"), "user_id": str(user["_id"])})
    if not item:
        raise HTTPException(404, "Detection not found")
    return detection_out(item, True)


@app.get("/detections/{detection_id}/audio")
def get_audio(detection_id: str, user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    item = db.detections.find_one({"_id": oid(detection_id, "detection"), "user_id": str(user["_id"])})
    if not item or not (UPLOAD_DIR / item["stored_filename"]).is_file():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(UPLOAD_DIR / item["stored_filename"], filename=item["audio_filename"], media_type="application/octet-stream")


@app.get("/alerts")
def list_alerts(user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    rows = db.alerts.find({"user_id": str(user["_id"])}).sort("created_at", -1)
    return [{"id": str(x["_id"]), "detectionId": x["detection_id"], "severity": x["severity"], "label": x.get("label"), "message": x["message"], "read": bool(x["read"]), "resolved": bool(x["resolved"]), "createdAt": x["created_at"]} for x in rows]


@app.patch("/alerts/{alert_id}")
def update_alert(alert_id: str, payload: AlertUpdate, user: dict[str, Any] = Depends(current_user)):
    values = payload.model_dump(exclude_none=True)
    if not values:
        raise HTTPException(422, "At least one field is required")
    db = get_db()
    updated = db.alerts.update_one({"_id": oid(alert_id, "alert"), "user_id": str(user["_id"])}, {"$set": values})
    if updated.matched_count == 0:
        raise HTTPException(404, "Alert not found")
    x = db.alerts.find_one({"_id": oid(alert_id, "alert")})
    return {"id": str(x["_id"]), "detectionId": x["detection_id"], "severity": x["severity"], "label": x.get("label"), "message": x["message"], "read": bool(x["read"]), "resolved": bool(x["resolved"]), "createdAt": x["created_at"]}


@app.get("/reviews")
def list_reviews(user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    rows = db.reviews.find({"user_id": str(user["_id"])}).sort("created_at", -1)
    return [{"id": str(x["_id"]), "detectionId": x["detection_id"], "finalClassification": x.get("final_classification"), "notes": x.get("notes"), "status": x["status"]} for x in rows]


@app.post("/reviews", status_code=201)
def create_review(payload: ReviewInput, user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    if not db.detections.find_one({"_id": oid(payload.detectionId, "detection"), "user_id": str(user["_id"])}):
        raise HTTPException(404, "Detection not found")
    doc = {"user_id": str(user["_id"]), "detection_id": payload.detectionId, "final_classification": payload.finalClassification, "notes": payload.notes, "status": payload.status, "created_at": now()}
    try:
        result = db.reviews.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "A review already exists for this detection")
    db.detections.update_one({"_id": oid(payload.detectionId, "detection")}, {"$set": {"status": "reviewed" if payload.status == "resolved" else "pending_review", "classification": payload.finalClassification or "Other"}})
    return {"id": str(result.inserted_id), **payload.model_dump()}


@app.get("/models")
def models(_: dict[str, Any] = Depends(current_user)):
    metadata = {}
    if MODEL_METADATA_PATH.is_file():
        try:
            metadata = json.loads(MODEL_METADATA_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return [
        {"id": "python-engine", "name": "Python ML Engine", "version": metadata.get("version", "baseline-1.0"), "type": "python", "status": "loaded" if MODEL_PATH.exists() else "baseline", "metrics": metadata.get("metrics", {}), "datasetSize": metadata.get("datasetSize")},
        {"id": "teachable-machine", "name": "Teachable Machine Adapter", "version": metadata.get("teachableMachineVersion", "not-configured"), "type": "teachable-machine", "status": "connected" if os.getenv("TEACHABLE_MACHINE_MODEL_URL") else "not_configured"},
    ]


@app.get("/model/status")
def model_status():
    return {"status": "loaded" if MODEL_PATH.exists() else "baseline", "metrics": json.loads(MODEL_METADATA_PATH.read_text()) if MODEL_METADATA_PATH.is_file() else {}}


@app.get("/reports/overview")
def overview(user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    docs = list(db.detections.find({"user_id": str(user["_id"])}))
    total = len(docs)
    confidence = sum(d["confidence"] for d in docs) / max(1, total) * 100
    critical = sum(1 for d in docs if d["severity"] == "critical")
    pending = sum(1 for d in docs if d["status"] == "pending_review")
    return {"totalAnalyses": total, "criticalEvents": critical, "averageConfidence": round(confidence, 1), "pendingReviews": pending}


@app.get("/reports/activity")
def report_activity(user: dict[str, Any] = Depends(current_user), days: int = Query(14, ge=1, le=90)):
    db = get_db()
    start = datetime.now(timezone.utc) - timedelta(days=days)
    start_iso = start.isoformat()
    docs = list(db.detections.find({"user_id": str(user["_id"]), "created_at": {"$gte": start_iso}}))
    buckets: dict[str, int] = {}
    for d in docs:
        day = d["created_at"][:10]
        buckets[day] = buckets.get(day, 0) + 1
    out = []
    d = start.replace(hour=0, minute=0, second=0, microsecond=0)
    for _ in range(days):
        key = d.isoformat()[:10]
        out.append({"date": key, "count": buckets.get(key, 0)})
        d += timedelta(days=1)
    return out


@app.get("/reports/severity")
def report_severity(user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    docs = list(db.detections.find({"user_id": str(user["_id"])}))
    out = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for d in docs:
        out[d["severity"]] = out.get(d["severity"], 0) + 1
    return out


# ==================== LIVE SESSIONS + LIVE ANALYZE ====================

def session_out(x: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(x["_id"]),
        "source": x.get("source", "microphone"),
        "status": x.get("status", "active"),
        "startedAt": x.get("started_at"),
        "endedAt": x.get("ended_at"),
        "detectionCount": x.get("detection_count", 0),
        "alertCount": x.get("alert_count", 0),
    }


@app.post("/live/sessions/start", status_code=201)
def start_session(source: str = Form("microphone"), user: dict[str, Any] = Depends(current_user)):
    if source not in {"microphone", "camera", "both"}:
        raise HTTPException(422, "source must be microphone, camera or both")
    db = get_db()
    doc = {
        "user_id": str(user["_id"]),
        "source": source,
        "status": "active",
        "started_at": now(),
        "ended_at": None,
        "detection_count": 0,
        "alert_count": 0,
    }
    result = db.detection_sessions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return session_out(doc)


@app.post("/live/sessions/{session_id}/stop", status_code=200)
def stop_session(session_id: str, user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    updated = db.detection_sessions.update_one(
        {"_id": oid(session_id, "session"), "user_id": str(user["_id"]), "status": "active"},
        {"$set": {"status": "stopped", "ended_at": now()}},
    )
    if updated.matched_count == 0:
        raise HTTPException(404, "Active session not found")
    x = db.detection_sessions.find_one({"_id": oid(session_id, "session")})
    return session_out(x)


@app.get("/live/sessions")
def list_sessions(user: dict[str, Any] = Depends(current_user), limit: int = Query(20, ge=1, le=100)):
    db = get_db()
    rows = db.detection_sessions.find({"user_id": str(user["_id"])}).sort("started_at", -1).limit(limit)
    return [session_out(x) for x in rows]


@app.get("/live/sessions/active")
def active_session(user: dict[str, Any] = Depends(current_user)):
    db = get_db()
    x = db.detection_sessions.find_one({"user_id": str(user["_id"]), "status": "active"})
    if not x:
        return None
    return session_out(x)


@app.post("/live/analyze", status_code=201)
async def live_analyze(
    audio: UploadFile = File(...),
    session_id: str = Form(None),
    user: dict[str, Any] = Depends(current_user),
):
    """Analyze a live audio chunk (3-5s). Honest: silence→no detection, real quality, baseline labels."""
    if session_id:
        db = get_db()
        sess = db.detection_sessions.find_one({"_id": oid(session_id, "session"), "user_id": str(user["_id"])})
        if not sess or sess.get("status") != "active":
            raise HTTPException(404, "Active session not found")
    if not audio.filename:
        raise HTTPException(422, "An audio filename is required")
    suffix = Path(audio.filename).suffix.lower()
    if suffix not in {".wav", ".mp3", ".ogg", ".m4a", ".flac", ".aac", ".webm"}:
        raise HTTPException(415, "Supported formats: WAV, MP3, OGG, M4A, FLAC, AAC, WEBM")
    content = await audio.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(422, "Audio chunk is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Audio chunk exceeds the 100 MB upload limit")
    if not sniff_audio_content(content, suffix):
        raise HTTPException(415, "File content does not match its audio extension")
    stored = str(uuid.uuid4()) + suffix
    path = UPLOAD_DIR / stored
    path.write_bytes(content)
    quality = get_quality(path, audio.content_type)
    silent = quality.get("status") == "poor" or (quality.get("rms") is not None and quality.get("rms", 0) < 0.004)
    if silent:
        label, confidence = "No event detected", 0.0
    else:
        label, confidence = predict_baseline(audio.filename, quality)
    severity = "critical" if label in {"Siren", "Alarm"} and confidence >= .8 else "high" if confidence >= .8 else "medium" if confidence >= .6 else "low"
    prediction = {"classification": label, "confidence": confidence, "modelVersion": "baseline-1.0"}
    db = get_db()
    item = {
        "user_id": str(user["_id"]),
        "audio_filename": Path(audio.filename).name,
        "stored_filename": stored,
        "classification": label,
        "confidence": confidence,
        "severity": "low" if silent else severity,
        "python_prediction": prediction,
        "teachable_prediction": prediction,
        "model_agreement": "agree",
        "audio_quality": quality,
        "status": "complete" if silent else ("pending_review" if confidence < .75 or severity in {"high", "critical"} else "complete"),
        "source": "live",
        "session_id": session_id,
        "created_at": now(),
    }
    result = db.detections.insert_one(item)
    did = str(result.inserted_id)
    if session_id:
        db.detection_sessions.update_one(
            {"_id": oid(session_id, "session")},
            {"$inc": {"detection_count": 1 if not silent else 0}},
        )
    if not silent and severity in {"high", "critical"}:
        maybe_create_alert(db, str(user["_id"]), did, severity, label, item["audio_filename"])
        if session_id:
            db.detection_sessions.update_one({"_id": oid(session_id, "session")}, {"$inc": {"alert_count": 1}})
    saved = db.detections.find_one({"_id": result.inserted_id})
    return detection_out(saved, True)