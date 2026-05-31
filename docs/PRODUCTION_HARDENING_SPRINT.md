# Production Hardening Sprint

## Sprint Goal

Turn the internship-winning demo into a safer pilot-ready system without changing the core product flow.

## Sprint Scope

| Track | Deliverables | Definition of Done |
| --- | --- | --- |
| Auth and RBAC | Optional Google OAuth for existing users, email/domain allowlist, credentials retained for local demo | `npm run build` passes; OAuth cannot create arbitrary users |
| Abuse Protection | In-memory rate limits on assistant, upload, visit creation, outlet search/submit, and FastAPI protected AI endpoints | 429 responses include `Retry-After`; limits are env-disableable for local debugging |
| Queue Recovery | DLQ replay command for terminal `analyze_visit` failures | Dry-run by default; `--execute` requeues payloads; optional `--remove` cleans DLQ job |
| Vector Store Hygiene | Pinecone namespace cleanup command | Dry-run by default; `--execute` deletes the configured namespace |
| Documentation | Update subsystem docs and gap register | Docs describe implemented controls and remaining production work |

## Implemented In This Slice

- `lib/auth.ts` supports optional Google OAuth when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured.
- OAuth users must already exist in the `User` table and may be constrained by `AUTH_ALLOWED_EMAILS` or `AUTH_ALLOWED_EMAIL_DOMAINS`.
- `lib/rate-limit.ts` adds lightweight fixed-window request throttling for high-cost Next.js API routes.
- FastAPI now rate-limits protected inference/RAG endpoints with `AI_SERVICE_RATE_LIMIT_PER_MINUTE`.
- `npm run worker:dlq:replay` replays `analyze_visit_dlq` jobs.
- `npm run rag:clear-namespace` clears the configured Pinecone namespace.

## Remaining Backlog

| Priority | Item | Notes |
| --- | --- | --- |
| P0 | Direct-to-bucket upload URLs | Remove app-server upload pressure and serverless filesystem risk |
| P0 | Managed DB pooling | PgBouncer/Prisma Accelerate before serverless production load |
| P1 | PostGIS/pg_trgm outlet matching | Move bounded app-side matching into DB-native entity resolution |
| P1 | Long-term queue/event archival | Current queues keep bounded recent history |
| P1 | Standardized EventLog actor metadata | Some events include actor/user context; make it uniform |
| P2 | Image thumbnails/compression | Needed before real mobile rollout |
| P2 | pgvector mirror | Optional fallback/ownership layer beside Pinecone |
| P2 | Rich fraud severity model | Current UI focuses on signal count and reasons |

## Validation

Required checks for this slice:

```powershell
npm run check:worker
npm run lint
python -m compileall -q ai_service\app
npx prisma validate
npm run build
```
