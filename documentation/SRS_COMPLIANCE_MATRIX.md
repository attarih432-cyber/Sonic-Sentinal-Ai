# SRS Compliance Matrix

Evidence is mapped to the inspected implementation. Runtime outcomes that were not captured are marked Pending Verification.

| ID | Requirement | Category | Implementation | Evidence File | Test | Status | Notes |
|---|---|---|---|---|---|---|---|
| SRS-001 | User registration/login/logout | Authentication | FastAPI auth routes and AuthCard | API_DOCUMENTATION.md, src/auth | authentication-tests.md | Partially Implemented | Runtime flow pending |
| SRS-002 | Protected user session | Security | AuthContext and server /auth/me | src/auth/AuthContext.tsx | authentication-tests.md | Partially Implemented | Browser test pending |
| SRS-003 | Audio upload analysis | Core analysis | /detections/analyze and Analyze page | API_DOCUMENTATION.md, diagrams/audio-upload-flow.png | functional-tests.md | Partially Implemented | Model result evidence pending |
| SRS-004 | Live microphone sessions | Live detection | /live/sessions and /live/analyze | diagrams/live-microphone-flow.png | integration-tests.md | Partially Implemented | Permission/device tests pending |
| SRS-005 | Detection history/details | Operations | /detections and /detections/{id} | API_DOCUMENTATION.md | functional-tests.md | Partially Implemented | Browser capture pending |
| SRS-006 | Alerts and severity | Operations | /alerts and alert update route | diagrams/critical-alert-decision.png | api-tests.md | Partially Implemented | Runtime alert results pending |
| SRS-007 | Manual review | Human review | /reviews and review UI | diagrams/manual-review-flow.png | integration-tests.md | Partially Implemented | Reviewer test pending |
| SRS-008 | Reports and exports | Reporting | overview/activity/severity routes | API_DOCUMENTATION.md | functional-tests.md | Partially Implemented | Export verification pending |
| SRS-009 | Models/status | ML operations | /models and /model/status | model-evidence/model-evaluation.md | ml-tests.md | Partially Implemented | No saved model metrics |
| SRS-010 | Admin operations | Administration | /api/admin route family and AdminDashboard | API_DOCUMENTATION.md | authentication-tests.md | Partially Implemented | Role test pending |
| SRS-011 | Responsive visual interface | UX | responsive CSS and mobile drawer | screenshots/README.md | functional-tests.md | Partially Implemented | Captures pending |
| SRS-012 | Build and deployment readiness | Delivery | Vite production build | testing/test-results.md | test-plan.md | Implemented | npm run build passed |
| SRS-013 | Dataset provenance | Data governance | Runtime inventory only | dataset/dataset-summary.md | testing/ml-tests.md | Pending Verification | Labelled corpus absent |
| SRS-014 | Model evaluation evidence | ML governance | Evidence folder scaffold | model-evidence/model-evaluation.md | testing/ml-tests.md | Pending Verification | Training artifacts absent |
