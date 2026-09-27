# SonicSentinel AI — REST API Documentation

## Base URL
- Local: `http://localhost:8000`
- Production: `https://<railway-domain>.up.railway.app`

## Authentication
Session cookie authentication via `sonic_session` cookie or HTTP Bearer token.

---

## 1. Public Authentication Endpoints

### `POST /auth/register`
- **Purpose**: Public user registration. Always assigns `role = "user"`.
- **Request Body**: `{"name": "...", "email": "...", "password": "..."}`
- **Response**: `201 Created` — `{"id": "...", "name": "...", "email": "...", "role": "user"}`
- **Security**: Client attempts to pass `role="admin"` are strictly ignored.

### `POST /auth/login`
- **Purpose**: Authenticates user or administrator.
- **Request Body**: `{"email": "...", "password": "..."}`
- **Response**: `200 OK` — `{"id": "...", "role": "user"|"admin", ...}` + sets `sonic_session` HTTP-only cookie.
- **Errors**: `401 Unauthorized` for invalid credentials.

### `POST /auth/logout`
- **Purpose**: Terminates user session.
- **Response**: `200 OK`.

### `GET /auth/me`
- **Purpose**: Fetches current authenticated user profile.
- **Response**: `200 OK` — User details (no password hash exposed).

---

## 2. Detection & Audio Endpoints

### `POST /detections/analyze`
- **Purpose**: Analyzes uploaded audio clip using the 3-Model ML Ensemble.
- **Content-Type**: `multipart/form-data`
- **Form Data**: `audio`: File (WAV/MP3/OGG/FLAC/AAC/M4A), `source`: "upload" | "live"
- **Response**: `201 Created` — Complete classification, confidence score, 3-model breakdown, severity.

### `GET /detections`
- **Purpose**: Lists user's past detections (scoped to authenticated user).
- **Response**: `200 OK` — Array of detection objects.

---

## 3. Live Microphone Endpoints

### `POST /live/sessions/start`
- **Purpose**: Starts a live microphone monitoring session.
- **Response**: `201 Created` — Session object.

### `POST /live/analyze`
- **Purpose**: Analyzes 3.5s live audio chunk from microphone stream.
- **Response**: `201 Created` — Real-time detection result.

---

## 4. Admin Management Endpoints (`require_admin` Guarded)

### `GET /api/admin/overview`
- **Purpose**: System-wide analytics and KPIs. Access: Admin only.

### `GET /api/admin/users`
- **Purpose**: Lists all platform users with filtering and pagination. Access: Admin only.

### `PATCH /api/admin/users/{user_id}`
- **Purpose**: Activates or deactivates user accounts. Access: Admin only.

### `DELETE /api/admin/users/{user_id}`
- **Purpose**: Deletes user and all associated data. Access: Admin only.
