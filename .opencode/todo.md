# Mission: MongoDB migration + full auth + verify all backend, landing page first

## M1: MongoDB Connection | status: completed
### T1.1: Install driver + connect | agent:Worker
- [x] S1.1.1: Install pymongo 4.18.2 | size:S
- [x] S1.1.2: Obtain db_username (hashirattari73_db_user) | size:S
- [x] S1.1.3: Verify Atlas connection (8.0.32, ping OK) | size:S
- [x] S1.1.4: Create sonic_sentinel DB collections + unique indexes | size:S

## M2: Backend MongoDB rewrite | status: completed
### T2.1: Rewrite main.py | agent:Worker
- [x] S2.1.1: Replace SQLite with pymongo (users/sessions/detections/alerts/reviews) | size:L
- [x] S2.1.2: Fix /health db ping bug (client.admin not db.admin) | size:S
- [x] S2.1.3: Reliable startup (server boots even if DB down, logs status) | size:S
- [x] S2.1.4: Restart backend on port 8000 | size:S

## M3: Auth E2E verification | status: completed
### T3.1: Verify auth endpoints | agent:Reviewer
- [x] S3.1.1: register → 201 (first user admin) | size:S
- [x] S3.1.2: login → 200 + cookie | size:S
- [x] S3.1.3: /auth/me → 200 with cookie | size:S
- [x] S3.1.4: logout → 204, me-after → 401 | size:S
- [x] S3.1.5: duplicate register → 409 | size:S
- [x] S3.1.6: wrong password → 401, weak password → 422 | size:S
- [x] S3.1.7: CORS preflight from :5173 → 200 | size:S

## M4: Protected endpoints + data flow | status: completed
### T4.1: Verify data endpoints | agent:Reviewer
- [x] S4.1.1: /models → 200 (python-engine baseline + teachable-machine) | size:S
- [x] S4.1.2: /detections/analyze upload test_siren.wav → Siren/critical | size:S
- [x] S4.1.3: /detections list → 1 item | size:S
- [x] S4.1.4: /alerts → critical alert auto-created | size:S
- [x] S4.1.5: /reports/overview → counts updated | size:S
- [x] S4.1.6: /reviews empty list → 200 | size:S

## M5: Frontend landing + auth gate | status: completed
### T5.1: Landing page first, dashboard after login | agent:Worker
- [x] S5.1.1: main.tsx LoginScreen (login/register toggle) | size:S
- [x] S5.1.2: Root gate: loading → spinner, user → App, else LoginScreen | size:S
- [x] S5.1.3: AuthProvider + authApi.me on mount | size:S
- [x] S5.1.4: .env VITE_API_URL=http://localhost:8000 | size:S
- [x] S5.1.5: Vite restart, axios re-optimized, modules serve 200 | size:S

## M6: Final verification | status: completed
### T6.1: Full system check | agent:Reviewer
- [x] S6.1.1: Frontend :5173 index 200 + all modules 200 | size:S
- [x] S6.1.2: Backend :8000 health connected | size:S
- [x] S6.1.3: Mongo users: hashir@sonic.ai (admin) persisted | size:S
## M7: Landing page before login | status: completed
### T7.1: Landing ? Auth ? Dashboard flow | agent:Worker
- [x] S7.1.1: LandingPage component (hero, features, how-it-works, footer) | size:S
- [x] S7.1.2: Landing shows FIRST when logged out; buttons open auth | size:S
- [x] S7.1.3: LoginScreen gets Back-to-home button | size:S
- [x] S7.1.4: Landing CSS appended (nav/hero/features/how/footer + responsive) | size:S
- [x] S7.1.5: Verify: main.tsx 200, styles.css 200, esbuild bundle PASS 2359KB (Landing+Login+Root present) | size:S
- [x] S7.1.6: Verify both servers UP (5173 PID 7592, 8000 PID 6224) | size:S

## M8: Professional 3D website | status: completed
### T8.1: Landing page 3D | agent:Worker
- [x] S8.1.1: Canvas starfield particles | size:S
- [x] S8.1.2: 3D mouse-tilt cards + gradient orbs | size:S
- [x] S8.1.3: Animated waveform hero + pulse rings | size:S
- [x] S8.1.4: Scroll reveals (framer-motion) + features/how/CTA band | size:S
### T8.2: Dashboard functional | agent:Worker
- [x] S8.2.1: Overview wired to /reports/overview + /alerts + /detections | size:M
- [x] S8.2.2: Analyze real upload ? /detections/analyze with result card | size:M
- [x] S8.2.3: Alerts page (mark read/resolve) | size:S
- [x] S8.2.4: History page (search/filter) | size:S
- [x] S8.2.5: Models page live | size:S
- [x] S8.2.6: Review page (approve detection) | size:S
- [x] S8.2.7: Reports page live stats | size:S
### T8.3: Settings functional | agent:Worker
- [x] S8.3.1: Profile name update ? PATCH /auth/profile (verified: Hashir Attari?Hashir Raza) | size:S
- [x] S8.3.2: Notification toggles (localStorage) | size:S
- [x] S8.3.3: Theme toggle dark/light (localStorage ss:light) | size:S
- [x] S8.3.4: Sign out button | size:S
### T8.4: Architecture | agent:Worker
- [x] S8.4.1: Modular files: brand.tsx, landing.tsx, pages.tsx, slim main.tsx | size:M
- [x] S8.4.2: New 3D/animations/settings CSS (26.7KB) | size:S
### T8.5: Verify | agent:Reviewer
- [x] S8.5.1: esbuild FINAL BUNDLE PASS 2411KB (14/14 checks OK) | size:S
- [x] S8.5.2: All modules serve 200 (main/landing/pages/brand/styles) | size:S
- [x] S8.5.3: Mongo reconnected + health connected | size:S
- [x] S8.5.4: PATCH profile + login + me + data endpoints verified | size:S
- [x] S8.5.5: FIX blank page: main.tsx me React import missing → React.StrictMode crash. Headless Chrome verified: landing 44KB DOM, 5/5 content checks OK, no JS errors | size:S

# Mission 2: Master Development — Phase 1 (hardening) → Phase 2 (real-time input, MAIN PRIORITY) → Phase 3 (polish)

## M9: Phase 1 — Production core hardening | status: completed
### T9.1: Environment config | agent:Commander
- [x] S9.1.1: .env.example update (GOOGLE_*, FACEBOOK_*, FRONTEND_URL, MAX_UPLOAD_BYTES, ALERT_COOLDOWN_SECONDS, MONGO_URI placeholder — no secrets) | size:S
### T9.2: Backend hardening | agent:Commander
- [x] S9.2.1: Upload MIME content sniffing (reject non-audio content beyond extension check) | size:S
- [x] S9.2.2: Alert dedupe via ALERT_COOLDOWN_SECONDS (user+severity+class window) | size:S
- [x] S9.2.3: detection_sessions collection + indexes in startup | size:S
### T9.3: Frontend state consistency | agent:Commander
- [x] S9.3.1: Loading/empty/error states pass on all pages (Overview/Analyze/Alerts/History/Models/Review/Reports/Settings) | size:M

## M10: Phase 2 — Real-time input system (MAIN PRIORITY) | status: completed
### T10.1: Backend live sessions API | agent:Commander
- [x] S10.1.1: POST /live/sessions/start (user-scoped, source=mic/camera, status=active) | size:S
- [x] S10.1.2: POST /live/sessions/{id}/stop (only owner, sets ended_at + counts) | size:S
- [x] S10.1.3: GET /live/sessions + GET /live/sessions/active (user-scoped) | size:S
### T10.2: Backend live analyze (honest detection) | agent:Commander
- [x] S10.2.1: POST /live/analyze: chunk upload + session_id, real quality parse, silence (rms≈0/duration tiny → "no detection", conf 0), baseline label otherwise | size:M
- [x] S10.2.2: detections get `source` (upload|live) + optional `session_id`; detection_out exposes them | size:S
### T10.3: Backend detection filters + reports | agent:Commander
- [x] S10.3.1: GET /detections query filters (severity/status/source/from/to/minConfidence/limit/offset), backward compatible | size:M
- [x] S10.3.2: GET /reports/activity (N-day buckets) + /reports/severity (counts) real aggregates | size:S
### T10.4: Frontend API modules | agent:Commander
- [x] S10.4.1: src/api/sessions.ts + live.ts + detectionsApi.list(params) | size:S
### T10.5: Live Monitor page (real mic + camera + stream) | agent:Commander
- [x] S10.5.1: Live Detection page: REAL getUserMedia mic → MediaRecorder 3-5s chunks → /live/analyze with session start/stop | size:L
- [x] S10.5.2: AudioContext + AnalyserNode → canvas waveform + RMS meter (REAL data), frequency bars | size:M
- [x] S10.5.3: Permission states (idle/prompt/granted/denied/unsupported via permissions.query), error surfaces | size:S
- [x] S10.5.4: Cleanup on unmount/logout: stop tracks, close AudioContext, stop recorder, clear intervals | size:S
- [x] S10.5.5: Camera tab: getUserMedia({video}) preview, mirror, fullscreen, snapshot (canvas), device select | size:M
- [x] S10.5.6: Camera privacy: activate only on user action, stop on unmount, honest "Vision model not configured" label | size:S
- [x] S10.5.7: Event stream: live results list + session activity (start/stop/session id) | size:S
### T10.6: Real-time dashboard | agent:Commander
- [x] S10.6.1: Overview auto-refresh (5s interval, cleanup) + sidebar unread alerts badge (10s poll) | size:S
- [x] S10.6.2: Alerts filters (read/unresolved/severity) | size:S
- [x] S10.6.3: History filters (source/severity/status/date/conf) + pagination | size:S
- [x] S10.6.4: Reports charts (activity timeline + severity distribution from new endpoints) | size:M

## M11: Phase 3 — Premium UI/UX | status: completed
### T11.1: Feedback systems | agent:Commander
- [x] S11.1.1: Toast system (context-based, auto-dismiss, success/error/info) | size:M
- [x] S11.1.2: Reusable Modal (Escape close, click-outside, aria attributes) | size:S
### T11.2: Navigation + responsiveness | agent:Commander
- [x] S11.2.1: Sidebar grouping + badge, mobile drawer polish | size:S
- [x] S11.2.2: Responsive pass (all pages < 768px) | size:M
### T11.3: Accessibility + settings | agent:Commander
- [x] S11.3.1: aria-labels, focus-visible, keyboard nav | size:S
- [x] S11.3.2: Settings: Devices (enumerateDevices status, no auto-perm), Appearance, OAuth connect status | size:M
### T11.4: Audits | agent:Commander
- [x] S11.4.1: Performance audit (no leaked intervals/streams/listeners/media/audio contexts) | size:M
- [x] S11.4.2: Security audit check (user isolation, upload validation, path traversal, CORS, cookies, OAuth state) | size:M

## M12: Final verification + report | status: completed
### T12.1: Full system verification | agent:Commander
- [x] S12.1.1: Restart backend; health connected; all new endpoints curl-verified with evidence | size:M
- [x] S12.1.2: esbuild bundle PASS check + headless Chrome renders (login/live page) | size:S
- [x] S12.1.3: Regression: email/Google/Facebook login + analyze + alerts + review flows intact | size:S
### T12.2: Final report | agent:Commander
- [x] S12.2.1: .opencode/final-report.md (Completed/Tested/Remaining/ML untouched/Git no commits/Known Limitations) | size:S
