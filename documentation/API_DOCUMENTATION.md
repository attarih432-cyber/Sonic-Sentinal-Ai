# API Documentation

Source: ml-service/app/main.py (inspected).

| Method | Path | Success status |
|---|---|---|
| GET | /auth/google | 200 |
| GET | /auth/google/callback | 200 |
| GET | /auth/facebook | 200 |
| GET | /auth/facebook/callback | 200 |
| GET | /health | 200 |
| POST | /auth/register | 201 |
| POST | /auth/login | 200 |
| GET | /auth/me | 200 |
| PATCH | /auth/profile | 200 |
| POST | /auth/logout | 204 |
| POST | /auth/forgot-password | 202 |
| POST | /detections/analyze | 201 |
| POST | /predict | 201 |
| GET | /detections | 200 |
| GET | /detections/{detection_id} | 200 |
| GET | /detections/{detection_id}/audio | 200 |
| GET | /alerts | 200 |
| PATCH | /alerts/{alert_id} | 200 |
| GET | /reviews | 200 |
| POST | /reviews | 201 |
| GET | /models | 200 |
| GET | /model/status | 200 |
| GET | /reports/overview | 200 |
| GET | /reports/activity | 200 |
| GET | /reports/severity | 200 |
| POST | /live/sessions/start | 201 |
| POST | /live/sessions/{session_id}/stop | 200 |
| GET | /live/sessions | 200 |
| GET | /live/sessions/active | 200 |
| POST | /live/analyze | 201 |
| GET | /api/admin/overview | 200 |
| GET | /api/admin/users | 200 |
| GET | /api/admin/users/{user_id} | 200 |
| PATCH | /api/admin/users/{user_id} | 200 |
| DELETE | /api/admin/users/{user_id} | 204 |
| GET | /api/admin/detections | 200 |
| GET | /api/admin/alerts | 200 |
| GET | /api/admin/reports | 200 |
| GET | /api/admin/system | 200 |
| GET | /api/admin/logs | 200 |
