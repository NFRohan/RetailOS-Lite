# Implemented System Reference

This document captures the backend, AI, worker, and integration contracts that are currently implemented in RetailOS Lite.

Use this as the handoff reference for the Next.js team.

## Current Working Slice

```text
Visit image
  -> FastAPI AI service
  -> local YOLO or Modal GPU YOLO
  -> optional OpenAI vision POSM analysis
  -> compliance scoring
  -> BullMQ worker persistence flow
  -> dashboard-ready outcome summary
  -> visit report retrieval text
```

Implemented modules:

| Module | Status | Notes |
| --- | --- | --- |
| FastAPI AI service | Implemented | Health, readiness, model info, YOLO detection, shelf analysis |
| YOLO local inference | Implemented | Uses `Detection Model/best.pt` |
| Modal GPU inference | Implemented | Selected with `RETAILOS_YOLO_BACKEND=modal` |
| OpenAI POSM analysis | Implemented | Optional vision LLM layer for Olympic POSM and summary |
| Compliance scoring | Implemented | Deterministic rules with score, status, reasons, action |
| Worker orchestration | Implemented | BullMQ `analyze_visit` job calls AI service and saves output |
| Fraud checks | Partially implemented | SHA-256 duplicate support, GPS mismatch, timestamp anomaly, EXIF GPS/time checks |
| Visit report text | Implemented | Builds fact-heavy text for later RAG embedding |
| Embedding worker | Not implemented | Queue is created, but no consumer exists yet |
| Real database repository | Not implemented | Current repository is JSON-file backed for local testing |

## Runtime Services

| Service | Path | Purpose |
| --- | --- | --- |
| AI service | `ai_service/app/main.py` | FastAPI API for detection and analysis |
| YOLO backend switch | `ai_service/app/yolo_backend.py` | Routes inference to local model or Modal |
| LLM analysis | `ai_service/app/llm_analysis.py` | OpenAI vision analysis for POSM and summary |
| Compliance engine | `ai_service/app/compliance.py` | Converts model output into business score |
| Worker | `worker/src/index.ts` | Runs BullMQ job processor |
| Worker job | `worker/src/jobs/analyzeVisit.ts` | Full async visit analysis lifecycle |
| Fraud service | `worker/src/services/fraud.ts` | Duplicate hash, GPS, timestamp, EXIF checks |
| Outcome summary | `worker/src/services/outcomeSummary.ts` | Dashboard-ready final explanation |
| Report builder | `worker/src/services/reportBuilder.ts` | RAG-ready retrieval text |
| Modal endpoint | `modal_gpu/yolo_endpoint.py` | GPU YOLO detection endpoint |

## Environment

Copy `.env.example` to `.env`.

```env
# AI service
AI_SERVICE_URL=http://127.0.0.1:8001
RETAILOS_YOLO_MODEL_PATH=E:\Projects\RetailOS-Lite\Detection Model\best.pt
RETAILOS_YOLO_BACKEND=local
RETAILOS_MODAL_YOLO_URL=
RETAILOS_YOLO_FALLBACK_LOCAL=true
RETAILOS_LLM_ENABLED=true
RETAILOS_LLM_PROVIDER=openai
RETAILOS_LLM_MODEL=gpt-4o-mini
RETAILOS_CORS_ORIGINS=*
OPENAI_API_KEY=

# Worker
REDIS_URL=redis://127.0.0.1:6379
ANALYZE_VISIT_QUEUE=analyze_visit
EMBED_VISIT_REPORT_QUEUE=embed_visit_report
WORKER_CONCURRENCY=2
WORKER_USE_LLM=true
WORKER_LOCAL_DB_PATH=
FRAUD_GPS_THRESHOLD_METERS=200
FRAUD_TIMESTAMP_DELAY_HOURS=6
FRAUD_EXIF_GPS_THRESHOLD_METERS=300
FRAUD_EXIF_TIMESTAMP_DRIFT_HOURS=24
```

For Modal GPU:

```env
RETAILOS_YOLO_BACKEND=modal
RETAILOS_MODAL_YOLO_URL=https://nfr12388--retailos-yolo-gpu-yologpuendpoint-detect.modal.run
RETAILOS_YOLO_FALLBACK_LOCAL=true
```

## AI Service API

Base URL:

```text
http://127.0.0.1:8001
```

Start locally:

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

### `GET /health`

Use for basic process health.

Response shape:

```json
{
  "status": "ok",
  "modelLoaded": false,
  "modelPath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\best.pt"
}
```

Notes:

- `modelLoaded` means the local model has already been loaded into memory.
- This endpoint does not guarantee Modal configuration is valid.
- Use `/ready` for deployment readiness.

### `GET /ready`

Use for deployment readiness checks.

Response shape:

```json
{
  "status": "ready",
  "yoloBackend": "local",
  "errors": []
}
```

Failure shape:

```json
{
  "status": "not_ready",
  "yoloBackend": "modal",
  "errors": [
    "RETAILOS_MODAL_YOLO_URL is required when RETAILOS_YOLO_BACKEND=modal"
  ]
}
```

Behavior:

- Returns `200` when ready.
- Returns `503` when required backend config is missing.

### `GET /model`

Returns active model metadata.

Sample response:

```json
{
  "modelName": "retail-shelf-yolo",
  "modelVersion": "v1",
  "modelPath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\best.pt",
  "yoloBackend": "local",
  "modalConfigured": false,
  "defaultConfidence": 0.25,
  "defaultImageSize": 1280,
  "classNames": {
    "0": "foodie_noodles_olympics",
    "1": "mr_noodles_competitor"
  }
}
```

### `POST /detect-yolo`

Runs YOLO only. Use this for low-level detection tests.

Request shape:

```json
{
  "visitId": "visit_demo_001",
  "imagePath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\yolo_dataset\\images\\val\\olympic_poc_image_94.jpg",
  "imageUrl": null,
  "confidence": 0.25,
  "imageSize": 1280,
  "saveOverlay": true
}
```

Field notes:

| Field | Required | Notes |
| --- | --- | --- |
| `visitId` | No | Propagated into response and overlay naming |
| `imagePath` | One of `imagePath` or `imageUrl` | Local file path for worker/dev |
| `imageUrl` | One of `imagePath` or `imageUrl` | Remote image URL downloaded by service |
| `confidence` | No | Defaults to env or `0.25` |
| `imageSize` | No | Defaults to env or `1280` |
| `saveOverlay` | No | Saves annotated image if true |

Response shape:

```json
{
  "visitId": "visit_demo_001",
  "modelName": "retail-shelf-yolo",
  "modelVersion": "v1",
  "analysisSource": "YOLO",
  "imageWidth": 1280,
  "imageHeight": 720,
  "confidenceThreshold": 0.25,
  "inputImageSize": 1280,
  "inferenceMs": 261.41,
  "counts": {
    "olympic": 0,
    "competitor": 22,
    "total": 22
  },
  "areas": {
    "olympic": 0,
    "competitor": 142061.61,
    "total": 142061.61
  },
  "metrics": {
    "countRatio": 0,
    "visibilityRatio": 0,
    "olympicAreaRatio": 0,
    "competitorAreaRatio": 0.1541
  },
  "detections": [
    {
      "label": "mr_noodles_competitor",
      "classId": 1,
      "category": "competitor",
      "confidence": 0.91,
      "box": {
        "x": 450.2,
        "y": 120.4,
        "width": 88.1,
        "height": 130.8
      },
      "area": 11523.48
    }
  ],
  "overlayImageUrl": "/artifacts/overlays/visit_demo_001_overlay.jpg"
}
```

### `POST /analyze-shelf`

Main endpoint for the worker. Runs YOLO, optional LLM POSM analysis, compliance scoring, and summary generation.

Request shape:

```json
{
  "visitId": "visit_demo_001",
  "imagePath": "worker/data/images/demo_shelf.jpg",
  "confidence": 0.25,
  "imageSize": 1280,
  "saveOverlay": true,
  "useLlm": true,
  "outletName": "Rahim Store",
  "repNotes": "Shelf near front counter."
}
```

Response shape:

```json
{
  "visitId": "visit_demo_001",
  "yolo": {
    "modelName": "retail-shelf-yolo",
    "modelVersion": "v1",
    "analysisSource": "YOLO_MODAL_GPU",
    "imageWidth": 1280,
    "imageHeight": 720,
    "confidenceThreshold": 0.25,
    "inputImageSize": 1280,
    "inferenceMs": 180.22,
    "counts": {
      "olympic": 0,
      "competitor": 22,
      "total": 22
    },
    "areas": {
      "olympic": 0,
      "competitor": 142061.61,
      "total": 142061.61
    },
    "metrics": {
      "countRatio": 0,
      "visibilityRatio": 0,
      "olympicAreaRatio": 0,
      "competitorAreaRatio": 0.1541
    },
    "detections": [],
    "overlayImageUrl": "/artifacts/overlays/visit_demo_001_overlay.jpg"
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "posm": {
      "detected": false,
      "confidence": 0.88,
      "evidence": "No clearly Olympic-branded POSM is visible.",
      "missingReason": "Olympic-branded signage or shelf material is not visible."
    },
    "otherPromotionalMaterial": "Competitor packaging and store shelving are visible.",
    "shelfQuality": "Products are visible, but competitor pressure is high.",
    "visibilityNotes": "Olympic visibility is weak based on YOLO detections.",
    "competitorNotes": "Competitor products dominate detected shelf presence.",
    "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
    "recommendedAction": "Place Olympic POSM and improve Olympic shelf share."
  },
  "compliance": {
    "score": 0,
    "status": "critical",
    "reasons": [
      "No Olympic products were detected.",
      "Olympic visibility is below the minimum target.",
      "Competitor products dominate visible shelf space.",
      "POSM was not detected in the shelf image."
    ],
    "recommendedAction": "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence."
  },
  "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
  "warnings": []
}
```

LLM fallback behavior:

- If OpenAI is not configured, `llm` is `null` and analysis still succeeds.
- If OpenAI is configured but the request fails, the response includes a warning and uses YOLO-only compliance.

```json
{
  "llm": null,
  "warnings": [
    "LLM analysis failed; using YOLO-only compliance fallback."
  ]
}
```

### `POST /detect-yolo/upload`

Multipart upload endpoint for quick manual tests. The worker should prefer `/analyze-shelf`.

Form fields:

| Field | Required | Notes |
| --- | --- | --- |
| `file` | Yes | Image file |
| `visit_id` | No | Visit id |
| `confidence` | No | Defaults to service config |
| `image_size` | No | Defaults to service config |
| `save_overlay` | No | Defaults to true |

Response:

- Same as `POST /detect-yolo`.

## Compliance Scoring

Compliance is deterministic and lives in `ai_service/app/compliance.py`.

Initial score:

```text
100
```

Penalties:

| Condition | Penalty |
| --- | ---: |
| No shelf products detected | `-75` |
| No Olympic products detected | `-45` |
| Olympic visibility below `0.25` | `-25` |
| Olympic visibility below `0.50` | `-15` |
| Competitor count greater than Olympic count and competitor count at least `3` | `-20` |
| Any competitor product present | `-5` |
| LLM available and Olympic POSM missing | `-15` |

Status bands:

| Score | Status |
| ---: | --- |
| `80-100` | `excellent` |
| `60-79` | `acceptable` |
| `40-59` | `poor` |
| `0-39` | `critical` |

Important behavior:

- Missing POSM only affects score when the LLM actually runs.
- Score is clamped between `0` and `100`.
- `reasons` are dashboard-facing and should be shown to supervisors.

## Fraud Detection

Implemented in `worker/src/services/fraud.ts`.

Current signals:

| Signal | Severity | Logic |
| --- | --- | --- |
| `IMAGE_HASHED` | `LOW` | Computes SHA-256 for local or URL-backed image if missing |
| `DUPLICATE_IMAGE` | `HIGH` | Same SHA-256 hash exists on another visit |
| `GPS_MISMATCH` | `MEDIUM` or `HIGH` | Check-in location exceeds outlet threshold |
| `TIMESTAMP_ANOMALY` | `MEDIUM` or `HIGH` | Client timestamp is future-dated or synced too late |
| `EXIF_GPS_MISMATCH` | `MEDIUM` or `HIGH` | Embedded image GPS is far from check-in or outlet location |
| `EXIF_TIMESTAMP_ANOMALY` | `MEDIUM` or `HIGH` | Embedded image capture time is far from submitted visit timestamp |

Default thresholds:

```env
FRAUD_GPS_THRESHOLD_METERS=200
FRAUD_TIMESTAMP_DELAY_HOURS=6
FRAUD_EXIF_GPS_THRESHOLD_METERS=300
FRAUD_EXIF_TIMESTAMP_DRIFT_HOURS=24
```

Not yet implemented:

- Blur score using OpenCV/Laplacian variance.
- Perceptual hash for near-duplicates.
- Fraud severity rollup.

## Worker Contract

Queue name:

```text
analyze_visit
```

Job name:

```text
analyze_visit
```

Recommended job id:

```text
analyze-{visitId}
```

Job payload:

```json
{
  "visitId": "visit_demo_001",
  "traceId": "trace_1716310000000",
  "useLlm": true
}
```

Worker lifecycle:

```text
ANALYZE_VISIT_STARTED
  -> visit status ANALYZING
  -> load visit and first image
  -> run contextual fraud checks
  -> call POST /analyze-shelf
  -> build outcomeSummary
  -> build visit report retrievalText
  -> save fraud signals
  -> save AI result
  -> save visit report
  -> status COMPLETE or FLAGGED
  -> enqueue embed_visit_report
  -> ANALYZE_VISIT_COMPLETED
```

Failure lifecycle:

```text
ANALYZE_VISIT_FAILED
  -> visit status FAILED
  -> BullMQ retry according to job options
```

Final status logic:

| Condition | Final visit status |
| --- | --- |
| High severity fraud signal | `FLAGGED` |
| Compliance status is `critical` | `FLAGGED` |
| Otherwise | `COMPLETE` |

## Dashboard Data Contract

The worker saves `AIResultRecord.outcomeSummary`. This is the field the dashboard should render first.

Shape:

```json
{
  "visitId": "visit_demo_001",
  "outletName": "Rahim Store",
  "finalStatus": "FLAGGED",
  "complianceScore": 0,
  "complianceStatus": "critical",
  "complianceReasons": [
    "No Olympic products were detected.",
    "Olympic visibility is below the minimum target.",
    "Competitor products dominate visible shelf space.",
    "POSM was not detected in the shelf image."
  ],
  "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
  "recommendedAction": "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence.",
  "counts": {
    "olympic": 0,
    "competitor": 22,
    "total": 22
  },
  "visibilityRatio": 0,
  "posm": {
    "detected": false,
    "evidence": "No clearly Olympic-branded POSM is visible.",
    "missingReason": "Olympic-branded signage or shelf material is not visible."
  },
  "fraudSignals": [
    {
      "type": "GPS_MISMATCH",
      "severity": "HIGH",
      "message": "Rep check-in location is far from the outlet location."
    }
  ]
}
```

Recommended dashboard sections:

- Compliance score and status.
- Supervisor summary.
- Compliance reasons.
- Recommended action.
- Olympic vs competitor counts.
- POSM detected/missing badge.
- Fraud signal badges.
- Raw image and overlay image.

## Visit Report For RAG

The worker builds a `VisitReportRecord` for every analysis.

Shape:

```json
{
  "visitId": "visit_demo_001",
  "outletId": "outlet_001",
  "title": "Rahim Store visit compliance 0",
  "summary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
  "retrievalText": "Outlet: Rahim Store\nOutlet ID: outlet_001\nVisit ID: visit_demo_001\nRep ID: rep_001\nCompliance Score: 0\nCompliance Status: critical\nSupervisor Summary: No Olympic POSM visible. Competitors dominate shelf visibility.\nOlympic Products Detected: 0\nCompetitors Detected: 22\nOlympic Visibility Ratio: 0\nPOSM Detected: false\nPOSM Evidence: No clearly Olympic-branded POSM is visible.\nFraud Signals: GPS_MISMATCH: Rep check-in location is far from the outlet location.\nRecommended Action: Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence.",
  "facts": {
    "compliance": {
      "score": 0,
      "status": "critical"
    },
    "counts": {
      "olympic": 0,
      "competitor": 22,
      "total": 22
    },
    "posm": {
      "detected": false
    }
  },
  "createdAt": "2026-05-21T13:00:00.000Z"
}
```

What exists now:

- Retrieval text is generated.
- `embed_visit_report` job is enqueued after analysis.

What remains:

- Embedding generation worker.
- `pgvector` storage.
- Assistant query route.
- SQL tool/query layer for exact compliance questions.

## Repository Contract

The worker currently uses `JsonVisitRepository` and `worker/data/db.json`.

Replace it with a Prisma repository that implements:

```ts
getVisitForAnalysis(visitId)
updateVisitStatus(visitId, status)
updateVisitImage(image)
findImagesByHash(imageHash, excludeVisitId)
saveFraudSignals(signals)
saveAIResult(result)
saveVisitReport(report)
addEvent(event)
```

Expected real tables:

```text
users
outlets
visits
visit_images
ai_results
fraud_signals
visit_reports
event_log
```

## Next.js Integration Flow

When a rep submits a visit:

```text
POST /api/visits/:id/submit
  -> validate visit exists and has at least one image
  -> set status ANALYZING
  -> enqueue analyze_visit job with jobId analyze-{visitId}
  -> return 202 Accepted
```

Do not call YOLO, Modal, or OpenAI directly from the request path.

Suggested response:

```json
{
  "visitId": "visit_demo_001",
  "status": "ANALYZING",
  "jobId": "analyze-visit_demo_001"
}
```

Dashboard polling route:

```text
GET /api/visits/:id
```

Should include:

```json
{
  "id": "visit_demo_001",
  "status": "FLAGGED",
  "outlet": {
    "name": "Rahim Store"
  },
  "images": [
    {
      "url": "/uploads/visit_demo_001.jpg"
    }
  ],
  "aiResult": {
    "complianceScore": 0,
    "status": "critical",
    "supervisorSummary": "No Olympic POSM visible. Competitors dominate shelf visibility.",
    "outcomeSummary": {}
  },
  "fraudSignals": [],
  "visitReport": {
    "retrievalText": "Outlet: Rahim Store..."
  }
}
```

## Test Setup

Install Node dependencies:

```powershell
npm install
```

Start Redis:

```powershell
docker compose -f docker-compose.worker.yml up -d redis
```

Start AI service:

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

Run static checks:

```powershell
npm run check:worker
$env:PYTHONUTF8='1'
python -m compileall ai_service modal_gpu
```

Run health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8001/ready
```

Run worker without Redis:

```powershell
$env:WORKER_USE_LLM='true'
npm run worker:dry-run -- visit_demo_001
```

Run queued smoke test:

```powershell
npm run worker
npm run worker:enqueue-demo -- visit_demo_001
```

Run Modal-backed analysis:

```powershell
$env:RETAILOS_YOLO_BACKEND='modal'
$env:RETAILOS_MODAL_YOLO_URL='https://nfr12388--retailos-yolo-gpu-yologpuendpoint-detect.modal.run'
uvicorn ai_service.app.main:app --reload --host 127.0.0.1 --port 8001
```

Expected acceptance criteria:

- `/ready` returns `ready`.
- `/analyze-shelf` returns YOLO counts, compliance reasons, summary, and optional POSM result.
- `worker:dry-run` prints compliance reasons and fraud signals.
- Queued job completes and saves AI result, fraud signals, visit report, and event log.

## Known Production Gaps

These are intentionally not hidden.

| Gap | Current workaround |
| --- | --- |
| No Prisma/Postgres repository | JSON repository for local demo |
| No object storage integration | Local path or URL input |
| No embedding worker | Visit report text is generated and queued |
| No assistant API | Retrieval text and planned data shape exist |
| No Next.js app yet | Backend contracts are ready |
| No OTEL/LGTM wiring yet | JSON logs and event log provide interim traceability |
| No blur/perceptual-hash fraud yet | Exact SHA-256, GPS, timestamp, and EXIF checks exist |
