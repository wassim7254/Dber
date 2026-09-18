# DBER

**One platform. Three marketplaces. One trustworthy transaction engine.**

- **SOUQ** — social group-buy marketplace (join groups, unlock deals; authorizations captured only when a group locks)
- **KHIDMA** — professional services marketplace (requests → quotes → bookings; schedule overlap is impossible at the database level)
- **KRAYA** — rental marketplace (deterministic pricing, deposit holds, immutable contract snapshots)

DBER is a modular monolith built on Next.js 16 (App Router) + PostgreSQL + Drizzle, engineered around the
**unhappy path first**: idempotent mutations, transactional outbox, append-only audit, explicit state machines,
and database-enforced invariants. The primary architectural contract is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Local setup

Requirements: Node 22+, Docker.

```bash
npm install
docker compose up -d          # PostgreSQL 16 (db: dber / dber_dev_password)
npm run db:migrate            # apply migrations (schema + exclusion constraints)
npm run db:seed               # deterministic dev data (idempotent, fixed UUIDs)
npm run dev                   # http://localhost:3000
```

The background worker (outbox dispatcher, expirers, reconcilers) starts **in-process** via
`src/instrumentation.ts` when the server starts. For serverless deploys, drive it with a cron POST:

```bash
curl -X POST -H "x-dber-jobs-secret: $DBER_JOBS_SECRET" https://<host>/api/v1/jobs/tick
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app (all routes dynamic) |
| `npm run typecheck` | `tsc --noEmit` (zero `any`, strict) |
| `npm run lint` | eslint (Next core-web-vitals + TS) |
| `npm run test` | vitest: unit + integration + concurrency (uses `dber_test` DB) |
| `npm run db:generate` | drizzle-kit migration generation |
| `npm run db:migrate` | apply migrations |
| `npm run db:seed` | seed deterministic development data |
| `npm run worker` | standalone worker loop (alternative to in-process) |

## Development authentication

MVP auth is development-only identity switching (never active in production builds):

- **API/testing:** headers `x-dber-user-id` + `x-dber-role` (`buyer | seller | professional | ops_admin | admin`).
- **Browser:** click the role chip (top-right on mobile / bottom of the rail on desktop) or visit `/welcome`
  to sign in as a seeded user — this sets dev session cookies via `/api/v1/dev/session`.

Every mutation requires an `x-idempotency-key` header (the browser client generates one automatically).
Replays return the stored response; a reused key with a different payload returns `422`.

## API conventions

- Envelope: `{ data, requestId }` on success; `{ error: { code, message, details? }, requestId }` on failure.
- Status codes: 400 validation · 401 unauthenticated · 403 forbidden · 404 missing · 409 conflict/state · 422 semantic · 500 internal.
- Pipeline for every mutation: correlation → auth → RBAC → rate limit → Zod → idempotency reservation →
  single transaction (business mutation + audit + outbox) → commit → envelope.
- Route map: see `src/app/api/v1/**` and the table in `docs/ARCHITECTURE.md` §12.

## Testing

```bash
npm run test
```

Uses a dedicated `dber_test` database (created automatically). Covers: state-machine transition matrices,
money/billable-day math, cancellation policies, the **100-parallel-join capacity race**, Khidma/Kraya
overlap exclusion constraints, TTL-cancel vs capture race with automatic refund, payment lifecycle through
the mock gateway, webhook deduplication, and the idempotency trio (replay / payload mismatch / concurrent duplicate).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `DBER_ENV` | no (default `development`) | `development` / `test` / `production` |
| `DBER_JOBS_SECRET` | production | authenticates `POST /api/v1/jobs/tick` |
| `DBER_WEBHOOK_SECRET` | production | HMAC secret for payment webhooks |

## Failure semantics (summary)

- Crash mid-transaction → nothing committed (business rows, audit, outbox, idempotency all roll back together).
- Crash after commit → idempotent retry replays the stored response.
- Worker crash → outbox events requeued via stale-lock reaper; handlers are idempotent; provider calls use
  deterministic idempotency keys.
- Payment provider timeout → reconciler queries the provider and applies forward-only canonical transitions, fully audited.
- Duplicate/out-of-order webhooks → `(provider, provider_event_id)` uniqueness + state-conditional transitions.
