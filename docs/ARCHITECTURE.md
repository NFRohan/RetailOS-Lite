# RetailOS Lite Architecture

## Product Positioning

RetailOS Lite is a 72-hour AI-native field execution workflow for retail visibility audits.

The product story is simple:

1. A sales representative visits an outlet.
2. They check in with GPS, timestamp, outlet metadata, and shelf photos.
3. AI analyzes shelf visibility, competitor presence, POSM/compliance signals, and possible fraud.
4. Supervisors see visit quality, risk, compliance scores, summaries, and alerts in a dashboard.

The evaluator should immediately see speed, business workflow, AI usage, and production-shaped architecture.

## Recommended Stack

### Frontend And Product Backend

- Next.js App Router with TypeScript
- Tailwind CSS plus a small component layer
- Server Actions or route handlers for fast CRUD
- NextAuth/Auth.js or simple credentials auth for role-based access
- Prisma ORM
- PostgreSQL, preferably Neon or Supabase for fast deployment

### AI And ML Service

- FastAPI as the AI inference service, not the user-facing orchestrator
- OpenAI/Gemini/Claude vision endpoint abstraction
- YOLO detector for trained product/competitor detection
- Optional Modal GPU backend for distributed YOLO inference
- LLM fallback for shelf reasoning, POSM interpretation, and summaries
- Image quality checks with OpenCV or Pillow

### Async Processing

- Redis
- BullMQ worker in Node.js for visit analysis jobs
- BullMQ worker owns analysis orchestration and calls FastAPI for heavy image inference

### Storage And Infra

- Cloudinary or Supabase Storage for image uploads
- Vercel for Next.js
- Render/Fly.io/Railway for FastAPI AI service and worker processes
- Upstash Redis for BullMQ
- LGTM observability stack for demo/local systems visibility
- Optional Sentry for frontend/runtime exception capture

### Observability

- OpenTelemetry SDKs in Next.js API routes, queue workers, and FastAPI
- Grafana for dashboards
- Loki for logs
- Tempo for traces
- Prometheus or Mimir for metrics
- Grafana Alloy or OTEL Collector for telemetry collection

## Architecture Diagram

```text
Rep Mobile Web/PWA
        |
        v
Next.js App
  - Auth
  - Visit forms
  - Image upload
  - Dashboard
  - API routes
        |
        +--> PostgreSQL
        |      - outlets
        |      - visits
        |      - images
        |      - ai_results
        |      - fraud_signals
        |
        +--> Cloudinary/Supabase Storage
        |      - shelf images
        |
        +--> BullMQ Queue
               - analyze_visit
               - send_alert
                    |
                    v
              Worker Process
                    |
                    v
            FastAPI AI Service
                - route YOLO to local model or Modal GPU
                - LLM POSM analysis
                - compliance scoring
                - fraud checks
                - summary generation
                    |
                    v
              LGTM Observability
                - traces
                - logs
                - metrics
```

## Distributed YOLO Inference

Use Modal GPU as the production/demo backend for YOLO inference, while keeping local YOLO as a fallback.

```text
BullMQ analyze_visit worker
        |
        v
FastAPI /analyze-shelf
        |
        +--> Modal GPU YOLO endpoint
        |      - loads best.pt once per warm container
        |      - returns detections/counts/visibility ratios
        |
        +--> Vision LLM POSM analysis
        |
        +--> Compliance scoring
```

Configuration:

- `RETAILOS_YOLO_BACKEND=local`: use local `Detection Model/best.pt`
- `RETAILOS_YOLO_BACKEND=modal`: send YOLO inference to Modal
- `RETAILOS_MODAL_YOLO_URL`: deployed Modal endpoint URL
- `RETAILOS_YOLO_FALLBACK_LOCAL=true`: fall back to local YOLO if Modal is unavailable

This makes the system genuinely distributed without changing the worker contract. The worker still calls `/analyze-shelf`; the AI service decides where YOLO inference runs.

## Core Modules

### 1. Store Visit Workflow

Rep-facing flow:

- Select or create outlet
- Start visit/check in
- Capture GPS coordinates
- Upload shelf images
- Add outlet notes and optional POSM flags
- Submit visit
- Show status: pending analysis, complete, flagged

This is the heart of the product. Keep it fast, mobile-first, and impossible to misunderstand.

### 2. AI Shelf Analysis

The AI service should return structured JSON, not only prose.

Suggested output shape:

```json
{
  "detectedProducts": [
    {
      "brand": "Olympic",
      "category": "biscuit",
      "confidence": 0.86,
      "visibility": "low"
    }
  ],
  "competitors": [
    {
      "brand": "Pran",
      "confidence": 0.78
    }
  ],
  "posm": {
    "detected": false,
    "notes": "No visible Olympic POSM near the shelf."
  },
  "compliance": {
    "score": 42,
    "status": "poor",
    "reasons": [
      "Low Olympic shelf visibility",
      "Competitor products dominate the visible shelf",
      "Missing POSM"
    ]
  },
  "supervisorSummary": "Outlet has poor Olympic visibility and missing POSM. Competitor presence is strong."
}
```

MVP approach now that a YOLO model is being trained:

- Run YOLO first for product and competitor detection.
- Compute counts, confidence, and approximate share-of-shelf from bounding boxes.
- Generate annotated overlay images for the supervisor visit detail page.
- Use a multimodal LLM as a reasoning layer for POSM interpretation, shelf quality, and human-readable summaries.
- Keep POSM detection in the LLM layer until POSM-specific training data exists.
- Store raw detector output, normalized compliance fields, overlay image URLs, and raw model output.

Fallback approach:

- If YOLO confidence is low or the model is unavailable, call the vision LLM directly.
- Mark the result source as `YOLO`, `LLM`, or `HYBRID` so the demo can explain the decision path.

### 3. Compliance Scoring

Use a transparent weighted score so it feels business-owned, not magic.

Example score:

- Brand visibility: 35 points
- Competitor dominance: 20 points
- POSM presence: 20 points
- Shelf cleanliness/arrangement: 15 points
- Fraud/image quality confidence: 10 points

Status bands:

- 80-100: excellent
- 60-79: acceptable
- 40-59: poor
- 0-39: critical

### 4. AI Supervisor Summary

Generate a one-line summary per visit.

Examples:

- "Outlet has poor Olympic visibility and missing POSM."
- "Shelf is compliant, but competitor visibility is high on the top rack."
- "Visit requires review because the image is blurry and GPS is far from outlet location."

This summary should appear everywhere: visit list, visit detail, dashboard card, alert message.

### 5. Dashboard

Supervisor-facing dashboard:

- Total visits today
- Average compliance score
- Flagged visits
- Top poor outlets
- Visit timeline
- Image history
- AI results and summaries
- Fraud signal badges

Recommended screens:

- `/rep/visits/new`
- `/rep/visits`
- `/supervisor`
- `/supervisor/visits/[id]`
- `/supervisor/outlets/[id]`
- `/admin/users`

## Fraud Detection

Implement at least two if possible, because they are high demo value.

### Duplicate Image

- Hash uploaded image bytes with SHA-256.
- Store `imageHash`.
- If the hash already exists for another visit, flag as duplicate.

### Blurry Image

- Use OpenCV Laplacian variance.
- If sharpness is below threshold, flag as blurry.

### Fake GPS

- Store outlet latitude/longitude.
- Compare check-in GPS to outlet location using Haversine distance.
- If distance is greater than configured threshold, flag as GPS mismatch.

### Timestamp Anomaly

- Compare client timestamp, server timestamp, and EXIF timestamp when available.
- Flag if difference exceeds threshold.

MVP recommendation: ship duplicate image, blurry image, and fake GPS. These are straightforward and impressive.

### Fraud Pipeline

Run fraud checks server-side when a visit is submitted or when an offline visit finishes syncing.

```text
Visit submitted
        |
        v
Store image metadata and image hashes
        |
        v
Run fraud checks
  - duplicate image hash
  - blurry image score
  - GPS distance from outlet
  - timestamp mismatch
        |
        v
Save FraudSignal rows
        |
        v
If high severity signal exists, mark visit FLAGGED
        |
        v
Queue `analyze_visit`; worker calls FastAPI with fraud context
```

Fraud signals should not block AI analysis. They should enrich the supervisor view and help decide whether the visit needs manual review.

## Bonus Features To Target

Best ROI bonuses for 72 hours:

- Role-based access: rep, supervisor, admin
- Async queues: BullMQ analysis jobs
- Offline sync: rep can capture visits and images without network, then sync later
- AI chat assistant: ask questions over visits and AI results
- WhatsApp alerts: Twilio or a mock WhatsApp webhook log
- Observability: LGTM dashboard for queue, worker, inference, and LLM traces

Avoid spending too much time on full multi-user conflict resolution unless the core flow is already stable. For this sprint, offline sync should mean reliable offline visit capture and background upload when connectivity returns.

## LGTM Observability

LGTM is worth integrating because this project has a genuinely observable workflow: upload, queue, fraud checks, YOLO inference, compliance scoring, LLM summary, embedding, and dashboard update.

Recommended 72-hour scope:

- Use OpenTelemetry spans across API routes, BullMQ jobs, FastAPI endpoints, YOLO inference, LLM calls, and database writes.
- Use Loki for structured logs.
- Use Tempo for request/job traces.
- Use Prometheus or Mimir for metrics.
- Use Grafana for dashboards.
- Use Grafana Alloy or the OpenTelemetry Collector to receive and forward telemetry.

For local/demo setup, prefer a single Docker Compose observability stack. For hosted deployment, either keep LGTM local for the demo video or send OTLP telemetry to Grafana Cloud.

### Trace Shape

```text
POST /api/visits/:id/submit
        |
        v
enqueue analyze_visit
        |
        v
worker analyze_visit
        |
        +--> fraud.duplicate_hash
        +--> fraud.blur_score
        +--> fraud.gps_distance
        +--> yolo.inference
        +--> compliance.score
        +--> llm.supervisor_summary
        +--> embedding.generate
        +--> db.save_results
```

Every span should carry:

- `visit.id`
- `outlet.id`
- `job.id`
- `job.name`
- `rep.id`
- `model.name`
- `model.version`
- `compliance.score`

### Metrics To Show In Grafana

- Queue depth by job type
- Job success/failure count
- Job duration p50/p95
- YOLO inference latency
- LLM latency and error rate
- Average compliance score
- Flagged visit count
- Fraud flag count by type
- Image blur score distribution

### Logs To Emit

Use structured JSON logs from the API, worker, and FastAPI service.

```json
{
  "event": "analysis_completed",
  "visit_id": "visit_123",
  "outlet_id": "outlet_456",
  "job_id": "bull_789",
  "compliance_score": 42,
  "fraud_flags": ["BLURRY_IMAGE", "GPS_MISMATCH"],
  "yolo_latency_ms": 830,
  "llm_latency_ms": 2100,
  "status": "completed"
}
```

### Demo Dashboard Panels

- "AI Pipeline Health"
- "Queue Depth"
- "Analysis Latency"
- "YOLO vs LLM Result Source"
- "Compliance Score Trend"
- "Fraud Flags By Type"
- "Failed Jobs"
- "Recent Trace Links"

This is intentionally observability-lite. Do not spend the sprint tuning retention, alert routing, or Kubernetes-grade infrastructure. The goal is to demonstrate that the system is traceable and production-shaped.

## Offline Sync

Offline sync is worth implementing because field reps often work in low-connectivity retail environments. Keep the scope sharp:

- Reps can create a visit offline.
- Reps can attach shelf images offline.
- The app shows unsynced, syncing, synced, and failed states.
- When the network returns, queued visits sync to the server.
- AI analysis starts only after the server receives the visit and image uploads.

### Recommended MVP Approach

Use IndexedDB plus TanStack Query persistence.

```text
Rep creates visit offline
        |
        v
IndexedDB
  - pending visit payload
  - compressed image blobs
  - local client id
  - sync status
        |
        v
Connectivity restored
        |
        v
TanStack mutation resumes or custom sync worker flushes queue
        |
        v
Next.js API creates server visit
        |
        v
Image upload completes
        |
        v
BullMQ analyze_visit job starts
```

Recommended browser storage:

- IndexedDB for visit drafts, image blobs, and pending sync queue
- TanStack Query persisted cache for server data and paused mutations
- Service worker/PWA shell for installability and basic offline loading

Useful packages:

- `@tanstack/react-query`
- `@tanstack/react-query-persist-client`
- `@tanstack/query-async-storage-persister`
- `idb-keyval` or Dexie for IndexedDB access
- `next-pwa` or a minimal custom service worker

### Local Records

Create local-first records with client-generated ids.

```ts
type OfflineVisitDraft = {
  localId: string
  serverId?: string
  outletId: string
  repId: string
  checkInLat?: number
  checkInLng?: number
  clientTimestamp: string
  notes?: string
  imageLocalIds: string[]
  status: "draft" | "queued" | "syncing" | "synced" | "failed"
  retryCount: number
  lastError?: string
  createdAt: string
  updatedAt: string
}

type OfflineImage = {
  localId: string
  visitLocalId: string
  blob: Blob
  sha256?: string
  status: "queued" | "uploading" | "uploaded" | "failed"
  remoteUrl?: string
}
```

### Sync Rules

- Use UUID/CUID client ids so visits can be created offline without waiting for a server id.
- Make `POST /api/visits` idempotent by accepting `clientVisitId`.
- Store `clientVisitId` on the server with a unique constraint.
- Retry failed sync with backoff.
- Never run AI analysis from the browser; enqueue analysis after server-side sync succeeds.
- Preserve client timestamp and compare it with server timestamp for fraud detection.

### UI Requirements

Rep screens should include:

- Offline banner
- "Saved locally" confirmation
- Pending sync count
- Per-visit sync badges
- Retry button for failed sync

Supervisor screens should include:

- "Synced late" badge if client timestamp and server timestamp differ significantly
- Timestamp anomaly fraud flag if the delay looks suspicious

### What Not To Build In 72 Hours

Avoid full database-level bidirectional sync unless it becomes the main technical story. TanStack DB with PowerSync/RxDB/Electric-style sync is a strong future upgrade, but it adds backend and conflict-resolution complexity. For this sprint, a local outbox pattern is faster, easier to demo, and safer.

## Data Model

```prisma
model User {
  id        String   @id @default(cuid())
  name      String
  email     String   @unique
  role      Role
  visits    Visit[]
  createdAt DateTime @default(now())
}

enum Role {
  REP
  SUPERVISOR
  ADMIN
}

model Outlet {
  id        String   @id @default(cuid())
  name      String
  code      String   @unique
  address   String?
  latitude  Float?
  longitude Float?
  visits    Visit[]
  createdAt DateTime @default(now())
}

model Visit {
  id              String       @id @default(cuid())
  outletId        String
  repId           String
  status          VisitStatus  @default(PENDING)
  checkInLat      Float?
  checkInLng      Float?
  clientTimestamp DateTime?
  notes           String?
  outlet          Outlet       @relation(fields: [outletId], references: [id])
  rep             User         @relation(fields: [repId], references: [id])
  images          VisitImage[]
  aiResult        AIResult?
  report          VisitReport?
  fraudSignals    FraudSignal[]
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

enum VisitStatus {
  PENDING
  ANALYZING
  COMPLETE
  FLAGGED
  FAILED
}

model VisitImage {
  id        String   @id @default(cuid())
  visitId   String
  url       String
  imageHash String?
  metadata  Json?
  visit     Visit    @relation(fields: [visitId], references: [id])
  createdAt DateTime @default(now())
}

model AIResult {
  id                String   @id @default(cuid())
  visitId           String   @unique
  analysisSource    String
  detectorModel     String?
  detectorVersion   String?
  complianceScore   Int
  status            String
  supervisorSummary String
  yoloDetections    Json?
  detectedProducts  Json
  competitors       Json
  posm              Json
  overlayImageUrl   String?
  rawModelOutput    Json
  visit             Visit    @relation(fields: [visitId], references: [id])
  createdAt         DateTime @default(now())
}

model VisitReport {
  id            String   @id @default(cuid())
  visitId       String   @unique
  outletId      String
  title         String
  summary       String
  retrievalText String
  facts         Json
  embedding     Unsupported("vector")?
  visit         Visit    @relation(fields: [visitId], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model FraudSignal {
  id        String   @id @default(cuid())
  visitId   String
  type      String
  severity  String
  message   String
  metadata  Json?
  visit     Visit    @relation(fields: [visitId], references: [id])
  createdAt DateTime @default(now())
}

model EventLog {
  id        String   @id @default(cuid())
  visitId   String?
  jobId     String?
  event     String
  level     String
  traceId   String?
  spanId    String?
  metadata  Json?
  createdAt DateTime @default(now())
}
```

## AI Summary, Report Storage, And RAG

The system should store two things after every visit analysis:

- Structured facts for dashboards, filters, and accurate lists
- Natural-language report text plus embedding for semantic retrieval

Do not rely on RAG alone for questions like "which outlets are failing compliance?" That should be answered with deterministic database filters first, then the LLM can explain the result.

### Summary Generation Pipeline

```text
analyze_visit job
        |
        v
Worker calls FastAPI `/analyze-shelf`
        |
        v
FastAPI returns YOLO, LLM POSM, compliance, and summary JSON
        |
        v
Worker merges fraud signals and persists normalized results
        |
        v
Save AIResult
        |
        v
Build VisitReport.retrievalText
        |
        v
Generate embedding for retrievalText
        |
        v
Save VisitReport with embedding
```

The `AIResult` table powers the dashboard. The `VisitReport` table powers supervisor search/chat.

### Report Text Format

Each visit should produce a compact, factual report document.

```text
Outlet: Rahim Store
Outlet Code: OUT-1024
Visit Date: 2026-05-21
Rep: Ayesha Rahman
Compliance Score: 42
Compliance Status: poor
Primary Issue: Low Olympic visibility and missing POSM.
Detected Olympic Products: Olympic Energy Plus, Olympic Toast
Competitors Present: Pran, Danish
POSM: missing
Fraud Signals: GPS mismatch, blurry image
Supervisor Summary: Outlet has poor Olympic visibility and missing POSM. Competitor presence is strong.
Recommended Action: Supervisor should request a revisit with POSM placement and clearer shelf photo.
```

This text is what gets embedded. Keep it concise, fact-heavy, and consistent across visits.

### Chat/RAG Query Flow

```text
Supervisor asks:
"Which outlets are failing compliance?"
        |
        v
Classify intent
  - metric/list question
  - semantic explanation question
        |
        v
For metric/list questions:
  call approved backend data tool
  backend runs parameterized SQL/Prisma query
        |
        v
For semantic questions:
  vector search VisitReport.embedding
  optional filters by date, outlet, rep, region, score
        |
        v
LLM answers using retrieved rows only
        |
        v
Return outlet list with score, date, reason, and visit link
```

The chatbot does not execute arbitrary SQL generated by the LLM. Instead, the chat endpoint exposes a small set of read-only tools:

```ts
type ChatDataTool =
  | {
      name: "getFailingOutlets"
      args: {
        from?: string
        to?: string
        threshold?: number
        region?: string
      }
    }
  | {
      name: "getFlaggedVisits"
      args: {
        from?: string
        to?: string
        fraudType?: string
      }
    }
  | {
      name: "searchVisitReports"
      args: {
        query: string
        from?: string
        to?: string
        limit?: number
      }
    }
  | {
      name: "getOutletHistory"
      args: {
        outletId: string
      }
    }
```

For example, if the supervisor asks "Which outlets are failing compliance today?", the LLM should produce a tool call like:

```json
{
  "name": "getFailingOutlets",
  "args": {
    "from": "2026-05-21T00:00:00+06:00",
    "to": "2026-05-21T23:59:59+06:00",
    "threshold": 60
  }
}
```

Then the backend runs a safe query:

```ts
const rows = await prisma.aIResult.findMany({
  where: {
    complianceScore: { lt: threshold },
    visit: {
      createdAt: { gte: from, lte: to },
    },
  },
  include: {
    visit: {
      include: {
        outlet: true,
        fraudSignals: true,
      },
    },
  },
  orderBy: { complianceScore: "asc" },
})
```

The final LLM step only formats and explains these returned rows. It should not invent outlets or change counts.

Example response:

```text
The following outlets are failing compliance today:

1. Rahim Store - score 42 - poor Olympic visibility, missing POSM
2. Maa Enterprise - score 38 - competitor dominance, blurry image
3. City Mart Dhanmondi - score 55 - acceptable shelf share but no POSM
```

### Retrieval Strategy

Use hybrid retrieval:

- SQL for exact questions: failing outlets, average score, visits today, flagged visits
- Vector search for fuzzy questions: "stores with weak brand visibility", "places similar to Rahim Store", "why are reps struggling in Mirpur?"
- LLM for final explanation, ranking, and supervisor-friendly wording

Recommended storage:

- PostgreSQL with `pgvector` for embeddings
- Supabase Vector or Neon Postgres with pgvector if deployment speed matters
- Prisma for normal tables, raw SQL migration for vector index if needed

Recommended indexes:

- `AIResult.complianceScore`
- `Visit.createdAt`
- `Visit.outletId`
- `FraudSignal.type`
- `VisitReport.embedding` vector index

### Guardrails

- The assistant must cite visit ids or outlet names from retrieved database rows.
- For counts and lists, trust SQL results over LLM guesses.
- Store prompt version and model name in `rawModelOutput` or report metadata.
- If no rows match, say no matching visits were found instead of inventing outlets.
- Keep generated summaries short enough to scan in the dashboard.

## API Boundaries

### Next.js API

- `POST /api/visits`: create visit
- `POST /api/visits/:id/images`: upload image metadata
- `POST /api/visits/:id/submit`: enqueue analysis
- `GET /api/visits`: list visits
- `GET /api/visits/:id`: visit detail
- `GET /api/dashboard`: supervisor metrics
- `GET /api/ops/metrics`: queue, model, and workflow metrics for ops dashboard
- `GET /api/ops/events`: recent event log entries with trace ids
- `POST /api/reports/search`: hybrid SQL/vector report search
- `POST /api/chat`: AI assistant over visit reports and dashboard data

### Worker Jobs

- `analyze_visit`: load visit/images, run contextual fraud checks, call FastAPI `/analyze-shelf`, save AI result, emit trace spans
- `embed_visit_report`: build and embed the visit report for RAG
- `send_alert`: send WhatsApp alert for critical or flagged visits

### FastAPI Endpoints

- `POST /analyze-shelf`: image URLs plus visit/outlet context
- `POST /detect-yolo`: run trained YOLO model and return detections/overlay
- `POST /fraud/image-quality`: optional separate image quality check
- `GET /metrics`: Prometheus-compatible service metrics
- `GET /health`: deployment health check

## AI Prompting Strategy

Use structured output and make the model act like a retail execution auditor.

Prompt responsibilities:

- Identify primary brand visibility.
- Identify competitor presence.
- Estimate shelf share.
- Detect POSM/signage.
- Detect image quality issues.
- Produce compliance reasons.
- Produce one supervisor summary.

Hybrid analysis rule:

- YOLO is the source of truth for trained product/competitor counts.
- The vision LLM is the source of judgment for POSM, signage, shelf neatness, and supervisor wording.
- Compliance scoring combines both, but must clearly store which signals came from YOLO versus LLM.

Store the prompt version with results. This is an easy way to show AI-native engineering maturity.

## Demo Script

1. Login as rep.
2. Create visit for an outlet.
3. Upload shelf image.
4. Submit visit.
5. Queue changes status to analyzing.
6. Dashboard updates with compliance score.
7. AI summary appears.
8. Fraud badge appears if GPS/image issue is detected.
9. Login as supervisor.
10. Open flagged visit and trigger WhatsApp alert or view alert log.
11. Ask AI assistant: "Which outlets had poor Olympic visibility today?"

## 72-Hour Build Plan

### First 12 Hours

- Scaffold Next.js app
- Add Prisma/Postgres schema
- Add auth and roles
- Build outlet and visit forms
- Upload images to storage
- Seed demo users and outlets

### 12-24 Hours

- Add BullMQ queue
- Add FastAPI analysis service
- Implement duplicate image, blurry image, and fake GPS checks
- Save AI results
- Add visit status transitions

### 24-42 Hours

- Build supervisor dashboard
- Build visit detail page with image history
- Add compliance score UI
- Add fraud badges
- Add AI summary cards

### 42-60 Hours

- Add AI chat assistant
- Add WhatsApp alert or alert log
- Improve mobile rep flow
- Add seed data and demo images
- Add error handling and loading states

### 60-72 Hours

- Polish demo
- Deploy
- Add README and architecture diagram
- Record short demo video
- Prepare tradeoff notes and future roadmap

## Decision Guidance

If time gets tight, protect these first:

- Rep check-in and image upload
- AI analysis with structured result
- Supervisor summary
- Dashboard
- One fraud signal

Everything else is bonus. The winning demo is a complete loop, not a pile of half-wired features.
