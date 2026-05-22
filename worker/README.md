# RetailOS Worker

BullMQ worker for async visit analysis.

## What It Does

```text
analyze_visit job
  -> load visit/images
  -> contextual fraud checks
  -> compute SHA-256 + perceptual hashes for duplicate detection
  -> EXIF GPS/time checks when image metadata exists
  -> call FastAPI /analyze-shelf
  -> save AIResult
  -> save FraudSignal rows
  -> build VisitReport retrieval text
  -> mark visit COMPLETE or FLAGGED
  -> write EventLog entries
```

The current implementation uses `worker/data/db.json` as a local repository so we can test the pipeline before the Next.js/Prisma app exists. Swap `JsonVisitRepository` with a Prisma repository when the database module lands.

## Install

```powershell
npm install
```

## Start AI Service

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --port 8001
```

## Dry Run Without Redis

```powershell
$env:WORKER_USE_LLM='false'
npm run worker:dry-run -- visit_demo_001
```

Use `WORKER_USE_LLM=true` when `OPENAI_API_KEY` is configured and you want POSM analysis.

The dry-run prints the supervisor-facing outcome:

```text
Compliance: 0 (critical)
Supervisor summary: Add Olympic POSM at eye level...
Compliance reasons:
- No Olympic products were detected.
- Competitor products dominate visible shelf space.
- POSM was not detected in the shelf image.
Fraud signals:
- MEDIUM EXIF_GPS_MISMATCH: Image EXIF GPS location does not match the submitted visit location.
- MEDIUM PERCEPTUAL_DUPLICATE_IMAGE: Image is visually similar to a previous visit image.
```

## Run With BullMQ

Start Redis, then:

```powershell
docker compose -f docker-compose.worker.yml up -d redis
```

Run the worker and enqueue a demo job:

```powershell
npm run worker
npm run worker:enqueue-demo -- visit_demo_001
```

Relevant env vars:

```env
AI_SERVICE_URL=http://127.0.0.1:8001
RETAILOS_AI_SERVICE_API_KEY=
REDIS_URL=redis://127.0.0.1:6379
ANALYZE_VISIT_QUEUE=analyze_visit
ANALYZE_VISIT_DLQ=analyze_visit_dlq
EMBED_VISIT_REPORT_QUEUE=embed_visit_report
WORKER_USE_LLM=true
```

`RETAILOS_AI_SERVICE_API_KEY` is optional for local dev. When set on the FastAPI service, the worker sends it as `x-api-key` for `/analyze-shelf`.

See [docs/BACKEND_HANDOFF.md](../docs/BACKEND_HANDOFF.md) for the Next.js integration contract and dashboard fields.
