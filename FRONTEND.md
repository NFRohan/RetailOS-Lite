# RetailOS Lite — Frontend Demo

## Quick start (localhost)

### 1. Infrastructure

```powershell
cd RetailOS-Lite
docker compose -f docker-compose.worker.yml up -d
```

### 2. Environment

```powershell
copy .env.example .env
```

Edit `.env` — set `AUTH_SECRET` to any random 32+ char string.

### 3. Install & database

```powershell
npm install
npm run db:push
npm run db:seed
```

### 4. Run the stack

Terminal 1 — Next.js (port 3000):

```powershell
npm run dev
```

Terminal 2 — AI service (port 8001):

```powershell
$env:PYTHONUTF8='1'
pip install -r ai_service/requirements.txt
uvicorn ai_service.app.main:app --reload --port 8001
```

Terminal 3 — BullMQ worker:

```powershell
npm run worker
```

### 5. Demo login

| Role | Email | Password |
|------|-------|----------|
| Rep | rep@demo.com | demo123 |
| Supervisor | supervisor@demo.com | demo123 |

### Demo flow

1. Login as **rep** → New visit → select outlet → capture GPS → upload shelf photo → Submit
2. Watch analyzing pipeline on visit detail
3. Login as **supervisor** → Dashboard → open visit → compare raw vs YOLO overlay

## Routes

- `/login` — authentication
- `/rep/visits` — rep visit list
- `/rep/visits/new` — visit wizard
- `/rep/visits/[id]` — visit detail + AI results
- `/supervisor` — command center dashboard
- `/supervisor/visits/[id]` — full visit intelligence

## Architecture

Next.js API routes → PostgreSQL (Prisma) → BullMQ enqueue on submit → Worker → FastAPI `/analyze-shelf`

See [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md) for integration contract.
