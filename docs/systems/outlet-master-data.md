# Outlet Master Data

## Purpose

Outlet management prevents duplicate shop creation while keeping the rep flow fast. Reps can submit shop names manually, but canonical outlet records are governed by matching and supervisor review.

## Data Model

| Table | Purpose |
| --- | --- |
| `Outlet` | Canonical outlet registry |
| `OutletAlias` | Historical/local names mapped to canonical outlets |
| `OutletSubmission` | Rep-submitted name/GPS candidate and matching decision |
| `Visit` | References canonical `outletId` |
| `VisitReport` | Stores `outletId` for assistant exact context |

## Core Fields

`Outlet`:

- `name`
- `normalizedName`
- `code`
- `address`
- `latitude`
- `longitude`
- `verificationStatus`: `VERIFIED`, `UNVERIFIED`, `REJECTED`
- `createdById`
- `approvedById`
- `createdByVisitId`

`OutletSubmission`:

- `submittedName`
- `normalizedName`
- `submittedLat`
- `submittedLng`
- `matchedOutletId`
- `createdOutletId`
- `matchConfidence`
- `status`
- `possibleMatches`
- `reviewedById`

## Matching Pipeline

Code: `lib/outlets.ts`

Input:

- submitted name
- check-in GPS
- optional selected outlet
- optional `forceNewOutlet`

Matching steps:

1. Normalize name.
2. Fetch non-rejected outlets with aliases.
3. Score by fuzzy name similarity and geo similarity.
4. Filter to nearby candidates.
5. Auto-match if confidence, radius, and margin thresholds pass.
6. Otherwise create or flag a submission for supervisor review.

Current constants:

| Constant | Value |
| --- | ---: |
| Search radius | `100m` |
| Auto-match radius | `75m` |
| Auto-match confidence | `0.9` |
| Review confidence | `0.6` |
| Auto-match margin | `0.12` |
| Name weight | `0.6` |
| Geo weight | `0.4` |

## API Surface

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/outlets/search` | Authenticated | Nearby candidate search |
| `POST /api/outlets/submit` | `REP` | Resolve selected/new outlet independent of visit |
| `GET /api/outlets` | Authenticated | Master outlet list |
| `POST /api/outlets` | Authenticated | Direct outlet creation |
| `GET /api/outlets/pending` | Supervisor | Review queue |
| `POST /api/outlets/:id/approve` | Supervisor | Approve outlet/submission |
| `POST /api/outlets/:id/reject` | Supervisor | Reject outlet/submission |
| `POST /api/outlets/:id/merge` | Supervisor | Merge duplicate into canonical outlet |

## Search Request

```json
{
  "query": "Maa Store",
  "lat": 23.7801,
  "lng": 90.4075,
  "radiusMeters": 100
}
```

Response includes:

- normalized query
- candidates
- candidate distance
- confidence
- matched alias
- auto-match candidate
- `canCreateNew`

## Submission Outcomes

| Outcome | Behavior |
| --- | --- |
| Rep-selected outlet within radius | Creates `OutletSubmission`, usually `PENDING_REVIEW` unless auto-confidence |
| Auto match | Links to existing outlet and creates alias |
| Low confidence | Creates `Outlet(UNVERIFIED)` and `OutletSubmission(NEW_OUTLET)` |
| Mid confidence | Creates new outlet or selection with `PENDING_REVIEW` |

## Duplicate Merge Semantics

Merging is not deletion.

When `sourceOutletId` is merged into `targetOutletId`:

- All visits pointing at source are retargeted to target.
- Visit reports pointing at source are retargeted to target.
- Report title and retrieval text are updated to target outlet.
- Retrieval text records the source outlet as `Merged Duplicate Outlet`.
- Source outlet becomes `REJECTED`.
- Source aliases are copied to target.
- Matching submissions are marked `MERGED`.
- Affected reports are queued for `embed_visit_report` so Pinecone metadata is overwritten.
- `OUTLET_MERGED` EventLog records moved visits/reports and reindex counts.

This preserves reporting history and improves future matching.

## Production Notes

Current implementation scores candidates in application code over a bounded outlet set. That is acceptable for demo scale.

Production hardening:

- Move geo prefilter into SQL using bounding boxes or PostGIS.
- Use `pg_trgm` for DB-side fuzzy name similarity.
- Add uniqueness or review constraints around same normalized name within radius.
- Add supervisor audit notes for merge/reject decisions.
- Keep alias creation idempotent.

