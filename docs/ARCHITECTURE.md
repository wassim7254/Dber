# DBER — ARCHITECTURE V1

Status: **Implemented (V1)** — this document is the architectural contract. Implementation notes
below reflect the shipped system; deviations discovered during implementation (e.g. the `khidma_availability`
table, `payment_events` log shape, worker wiring via `instrumentation.ts` + `POST /api/v1/jobs/tick`)
are reflected in the relevant sections.

Grounded in the current repository state (verified 2026-09-17):

| Already present | Detail |
| --- | --- |
| Next.js **16.3.4** App Router, React 19, TS strict | Note: this Next.js generation differs from older conventions (`proxy.ts` replaces `middleware.ts`; async dynamic APIs). Bundled docs: `node_modules/next/dist/docs/`. |
| Drizzle ORM 0.45 + `postgres.js`, drizzle-kit | `src/db/client.ts`, `drizzle.config.ts` |
| PostgreSQL 16 (docker-compose) | healthchecked, volume-backed |
| Zod 4 env validation | `src/lib/config/env.ts` |
| Request-context helper | `src/infrastructure/request-context/request-context.ts` |
| Initial migration | `users` table + `user_role` enum only |

Phase 1 (Foundation) is therefore **partially complete**. Everything below is designed to build on it without rework.

---

## 1. System architecture — complete overview

**Shape: a modular monolith.** One Next.js application, one PostgreSQL database, one worker runtime. Domain boundaries are enforced by module structure and import discipline, not by network boundaries. It must be capable of evolving toward distributed infrastructure later, and must not pay for distribution now (directive §96).

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                            CLIENTS (browser)                             │
│      React Server Components (reads) + Client Components (actions)       │
└───────────────▲──────────────────────────────────────────▲───────────────┘
                │ RSC payloads / HTML                      │ fetch (JSON)
┌───────────────┴──────────────────────────────────────────┴───────────────┐
│                          NEXT.JS APP (modular monolith)                  │
│                                                                          │
│  Route Handlers  ──►  Request Pipeline (withRoute)                       │
│   /api/v1/...          correlation → auth → authz → idempotency          │
│                        → Zod → Application Service                       │
│                                                                          │
│  Server Components ──► Read Services (no transactions, no side effects)  │
│                                                                          │
│  DOMAINS (business authority)        INFRASTRUCTURE (ports + adapters)   │
│   souq / khidma / kraya               idempotency · outbox · audit       │
│   payments · cancellations            payments (gateway port)            │
│   disputes · identity                 notifications · logging            │
│                                                                          │
│  lib/: errors · auth · http · validation · state-machine kernel          │
└───────────────▲──────────────────────────────────────────▲───────────────┘
                │ SQL (drizzle, transactions)              │ outbox dispatch
┌───────────────┴───────────────────────────┐  ┌───────────┴───────────────┐
│        POSTGRESQL 16 (source of truth)    │  │   WORKER (same codebase)  │
│  constraints · exclusion constraints      │  │  outbox processor         │
│  CHECK · UNIQUE · FK · tstzrange          │  │  schedulers / reconcilers │
│  audit (append-only) · outbox             │  │  SKIP LOCKED, backoff     │
└───────────────────────────────────────────┘  └───────────┬───────────────┘
                                                           ▼
                                        external providers (payment gateway,
                                        email/push) — behind ports, idempotent
```

**Layering rule (enforced by code review + import lint):**

```text
HTTP Route  →  Request Validation  →  Authorization  →  Application Service
            →  Domain Logic  →  Transaction  →  Repository  →  Outbox + Audit
```

- Route handlers **orchestrate only**: parse, authorize, delegate, respond. No SQL, no business rules.
- Application services own transactions and call domain logic; they are the only place `db.transaction(...)` appears.
- Domain logic is pure (state machines, pricing, policies) — no I/O, fully unit-testable.
- Reads (Server Components) go through read services and never mutate.

**Decision D1 — Modular monolith, not microservices.**
Why: the three verticals share one transaction kernel (idempotency/outbox/audit); splitting now would trade real correctness work for network plumbing. Invariant protected: single ACID boundary for every business fact (§45). If it fails (load outgrows one node): domain seams are already cut — souq/khidma/kraya/payments can be extracted process-by-process behind their service interfaces. PostgreSQL role: one instance, one connection pool. Recovery: n/a (no cross-service partial failure exists yet).

**Decision D2 — Vertical-owned listing entities, no god-table.**
`marketplace_items` (§17) is **rejected** in favor of `souq_products`, `khidma_services`, `kraya_assets`. Why: the three listings share almost no enforceable invariants — a circle has target quantity and deadlines, a service has schedule semantics, a rental has rates+deposit; a shared table would push all of them into JSONB, exactly what §17 forbids for critical fields. Invariant protected: every financial field is a typed column with a CHECK. If a cross-vertical "saved items" or "unified search" feature needs commonality, it reads three typed tables (search = three queries UNIONed at the API layer) rather than pretending the rows are the same. Recovery: n/a.

**Decision D3 — Money is `bigint` minor units + `char(3)` currency, always paired.**
Why: float money is disqualifying (§48). `bigint mode:"number"` in Drizzle is exact up to 2^53−1 minor units (≈90,071,992,547,740.99 MAD) — far beyond any plausible transaction; the CHECK `amount_minor > 0` lives in the DB. Invariant protected: §94 financial invariants; refund ≤ captured−refunded enforced by columns + CHECK. If rounding is ever needed: integer-only rules defined per feature (fees: `floor` to minor unit; splits: largest-remainder), never float. PostgreSQL role: `bigint` arithmetic, CHECK constraints. Recovery: bad input rejected at Zod layer **and** DB layer.

**Decision D4 — Currency: MVP is single-currency MAD** (directive example: `1000 = 10.00 MAD`). Every money column carries `currency char(3) NOT NULL DEFAULT 'MAD'` with a CHECK (`currency IN ('MAD')` initially), so multi-currency later is a migration, not a redesign. Cross-currency mixing is impossible per-row; multi-currency totals will be computed per-currency groupings only.

**Decision D5 — Time: `timestamptz`, UTC internally, half-open intervals `[start, end)`** for all scheduling (§60). Rental/service overlap math uses `tstzrange(start_time, end_time, '[)')` so adjacent bookings (end 12:00, start 12:00) never collide.

---

## 2. Domain & module boundaries

```text
src/
├── app/                        # routes only (pages + api), thin
│   ├── (public)/               # marketing, home discovery
│   ├── souq/  khidma/  kraya/  # consumer verticals
│   ├── pro/                    # provider workspace (seller + professional)
│   ├── account/                # buyer account, activity, orders
│   ├── admin/                  # ops console (dense UI allowed here)
│   └── api/v1/                 # route handlers (orchestration only)
├── components/
│   ├── dber/                   # design-system primitives (Button, Card, …)
│   ├── forms/  feedback/  layout/
│   └── souq/  khidma/  kraya/  # vertical-specific components
├── domains/
│   ├── souq/       domain/ (pure) · application/ (services+tx) · infrastructure/ (repos) · schemas/ · types/
│   ├── khidma/     same layout
│   ├── kraya/      same layout
│   ├── payments/   domain/ application/ infrastructure/ schemas/
│   ├── cancellations/  disputes/  identity/     same layout
├── infrastructure/
│   ├── idempotency/  outbox/  audit/  notifications/  logging/  request-context/
├── db/
│   ├── schema/         # drizzle schema, one file per domain area
│   ├── migrations/     # drizzle-kit generated + hand-written SQL where needed
│   ├── client.ts  transactions/
├── lib/
│   ├── auth/           # IdentityProvider port, DevHeaderIdentityProvider, RBAC
│   ├── errors/         # domain error classes → HTTP mapping
│   ├── http/           # withRoute pipeline, response envelope, correlation
│   ├── validation/     # shared zod primitives (money, uuid, interval)
│   └── state-machine/  # generic exhaustive machine kernel
├── jobs/               # worker entrypoint + job definitions
└── types/              # shared domain-agnostic types
```

**Import discipline:** `domains/*` may import `lib/*`, `db/*`, `infrastructure/*`. Nothing outside `domains/payments` may import a payment adapter. `app/` may import domains; domains never import `app/`. A lint rule (`eslint-plugin-boundaries` or import rules) enforces this from Phase 2.

**Boundary justification:** SOUQ/KHIDMA/KRAYA share the kernel (idempotency, outbox, audit, money, errors, state-machine kernel) but each owns its tables, states, pricing and services. `cancellations` and `disputes` are cross-vertical domains that reference targets by `(entity_type, entity_id)` with a **typed registry** (no magic strings, §72) mapping to a validator per entity type.

---

## 3. PostgreSQL ERD (textual)

```text
users ─────────────┬─────────────────────────────────────────────────────────┐
                   │ owner                                                   │
souq_products      │            khidma_services         kraya_assets         │
   │ 1:N           │                   │                    │                │
group_buy_circles  │                   │                    │                │
   │ 1:N           │                   │                    │                │
group_buy_participants ──┐           │                    │                │
                         │           │                    │                │
service_requests ───1:N──┼─ service_quotes ──accepted──► khidma_bookings      │
                         │                                     │ 1:1          │
                         │                              rental_bookings ──1:1─┼─► rental_contracts
                         │                                     │              │
                         └────────────► payments ◄─────────────┘              │
                                            │ 1:N                             │
                                         refunds                              │
                                                                                │
cancellation_requests (entity_type, entity_id) ──► audited transition of target │
disputes ──1:N── dispute_evidence                                │              │
   └──1:1── dispute_resolutions ──► may force refund ──► refunds │              │
                                                                                │
infrastructure: idempotency_keys · outbox_events · audit_log ·                  │
                admin_actions · provider_actions · notifications · saved_items  │
```

Cross-cutting linkage rules:

- `payments` targets exactly one business object via `category` enum + nullable FK columns (`souq_participant_id`, `khidma_booking_id`, `kraya_booking_id`) with a CHECK enforcing exactly-one-not-null per category. No polymorphic strings.
- `refunds.payment_id → payments.id`, constrained `amount_minor <= payments.captured_minor - payments.refunded_minor` (enforced by columns + trigger-free CHECK on insert-time values, plus the refund service recomputing under lock).
- `cancellation_requests` / `disputes` reference targets by `(entity_type, entity_id)`; the entity-type registry validates existence and ownership inside the transaction before any state change.
- Every important table: `id uuid PK default gen_random_uuid()`, `created_at/updated_at timestamptz NOT NULL DEFAULT now()`, and where relevant `created_by/updated_by uuid FK users`.

---

## 4. Complete initial table inventory

Enums (all `pgEnum`, no free-text states — §85):

```
user_role:            buyer | seller | professional | ops_admin | admin
user_status:          active | suspended
listing_status:       draft | active | paused | archived
circle_state:         draft | open | locked | supplier_confirmed | fulfilling
                    | delivered | completed | expired | cancelled | failed_closed
participant_payment:  none | pending | authorized | captured | refunded | failed
khidma_request_state: requested | quoted | booked | expired | cancelled
quote_state:          submitted | accepted | rejected | withdrawn | expired
khidma_booking_state: payment_pending | confirmed | in_progress | completed
                    | cancelled | disputed | refunded
kraya_booking_state:  requested | payment_pending | confirmed | active
                    | completed | cancelled | disputed | refunded
payment_state:        created | authorization_pending | authorized | capture_pending
                    | captured | void_pending | voided | refund_pending | refunded | failed
payment_category:     souq_join | khidma_service | kraya_rental | kraya_deposit
refund_state:         requested | provider_pending | completed | failed
cancellation_state:   pending | approved | executed | rejected | withdrawn
dispute_state:        opened | under_review | resolved
dispute_resolution:   force_refund | force_complete | partial_refund | dismiss
outbox_status:        pending | processing | processed | failed
idempotency_status:   in_progress | completed | abandoned
notification_kind:    group_progress | booking_confirmed | rental_starting
                    | payment_attention | refund_completed | dispute_update
```

### Identity & catalog

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `users` (exists) | `role`, `display_name`, `email?`, `status` | idx `role` |
| `souq_products` | `seller_id→users`, `title`, `description`, `base_price_minor`, `currency`, `status`, `images_json` | CHECK `base_price_minor >= 0`; idx `(seller_id)`, `(status)` |
| `khidma_services` | `professional_id→users`, `title`, `specialty`, `description`, `base_price_minor`, `currency`, `duration_minutes`, `status` | CHECK `duration_minutes > 0`; idx `(professional_id, status)` |
| `kraya_assets` | `owner_id→users`, `title`, `description`, `daily_rate_minor`, `deposit_minor`, `currency`, `status`, `metadata_jsonb` | CHECK `daily_rate_minor >= 0`, `deposit_minor >= 0`; idx `(owner_id, status)` |

### SOUQ

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `group_buy_circles` | `product_id→souq_products`, `seller_id`, `target_quantity`, `minimum_participants`, `current_quantity`, `group_price_minor`, `list_price_minor`, `currency`, `deadline_at`, `state` | CHECK `target_quantity > 0`, `minimum_participants > 0`, `0 <= current_quantity <= target_quantity`, `group_price_minor > 0`, `deadline_at > created_at`; idx `(state, deadline_at)` |
| `group_buy_participants` | `circle_id`, `user_id`, `quantity`, `payment_status`, `payment_id?` | **UNIQUE `(circle_id, user_id)`** (one participation per user); CHECK `quantity > 0`; idx `(user_id)` |

### KHIDMA

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `service_requests` | `buyer_id`, `service_id`, `description`, `requested_range tstzrange`, `state` | CHECK `NOT isempty(requested_range)`; idx `(buyer_id)`, `(state)` |
| `service_quotes` | `request_id`, `professional_id`, `amount_minor`, `currency`, `message`, `expires_at`, `state` | CHECK `amount_minor > 0`; UNIQUE `(request_id, professional_id)`; idx `(professional_id, state)` |
| `khidma_bookings` | `request_id`, `quote_id`, `buyer_id`, `professional_id`, `service_title_snapshot`, `start_time`, `end_time`, `price_snapshot_minor`, `currency`, `state`, `payment_id?` | **EXCLUSION (GiST): `professional_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&` WHERE `state IN ('payment_pending','confirmed','in_progress')`**; CHECK `end_time > start_time`; idx `(buyer_id)`, `(professional_id, state)` |

### KRAYA

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `rental_bookings` | `asset_id`, `renter_id`, `start_time`, `end_time`, `daily_rate_snapshot_minor`, `deposit_snapshot_minor`, `total_charge_minor`, `currency`, `state`, `payment_id?`, `deposit_payment_id?` | **EXCLUSION (GiST): `asset_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&` WHERE `state IN ('payment_pending','confirmed','active')`**; CHECK `end_time > start_time`, `total_charge_minor > 0`; idx `(renter_id)`, `(asset_id, state)` |
| `rental_contracts` | `booking_id` UNIQUE, `version`, `terms_json`, `asset_snapshot_json`, `price_snapshot_minor`, `deposit_snapshot_minor`, `cancellation_policy`, `accepted_at` | immutable: no update path in code; new version = new row; idx `(booking_id, version)` |

### Payments, refunds

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `payments` | `category`, `payer_id`, `amount_minor`, `captured_minor`, `refunded_minor`, `currency`, `state`, `provider`, `provider_ref?`, target FKs | CHECK `amount_minor > 0`, `refunded_minor <= captured_minor`, exactly-one-target per category; UNIQUE `(provider, provider_ref)`; idx `(payer_id)`, `(state)` |
| `refunds` | `payment_id`, `amount_minor`, `reason`, `state`, `provider_ref?` | CHECK `amount_minor > 0`; UNIQUE `(provider, provider_ref)`; idx `(payment_id)` |
| `payment_events` (webhook/event log) | `provider`, `provider_event_id`, `payload_json`, `signature_ok`, `received_at` | **UNIQUE `(provider, provider_event_id)`** — the dedupe backbone; append-only |

### Governance

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `cancellation_requests` | `requester_id`, `entity_type`, `entity_id`, `reason`, `state`, `reviewed_by?`, `reviewed_at?`, `decision_reason?` | idx `(state)`, `(entity_type, entity_id)` |
| `disputes` | `opener_id`, `entity_type`, `entity_id`, `reason`, `state`, `resolution?` | idx `(state)` |
| `dispute_evidence` | `dispute_id`, `submitted_by`, `evidence_type`, `storage_reference`, `metadata_jsonb` | append-only; idx `(dispute_id)` |
| `dispute_resolutions` | `dispute_id` UNIQUE, `resolution`, `amount_minor?`, `rationale`, `decided_by` | append-only |
| `audit_log` | `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `before_jsonb`, `after_jsonb`, `metadata_jsonb`, `request_id` | append-only; idx `(entity_type, entity_id, created_at)`, `(actor_id)`, `(request_id)` |
| `admin_actions` | `admin_id`, `action`, `entity_type`, `entity_id`, `reason` (required), `metadata_jsonb`, `request_id` | append-only; idx `(admin_id, created_at)` |
| `provider_actions` | `provider_id`, `provider_role`, `action`, `entity_type`, `entity_id`, `metadata_jsonb`, `request_id` | append-only |

### Infrastructure

| Table | Key columns | Constraints / indexes |
| --- | --- | --- |
| `idempotency_keys` | `scope`, `key`, `user_id`, `request_hash`, `status`, `response_status`, `response_body`, `expires_at` | **UNIQUE `(scope, user_id, key)`** — the concurrency lock; idx `(expires_at)` |
| `outbox_events` | `event_type`, `event_version`, `aggregate_type`, `aggregate_id`, `payload_json`, `status`, `attempt_count`, `available_at`, `locked_at?`, `processed_at?`, `last_error?` | idx `(status, available_at)`; worker uses `FOR UPDATE SKIP LOCKED` |
| `notifications` | `user_id`, `kind`, `title`, `body`, `entity_ref_jsonb`, `read_at?` | idx `(user_id, read_at)` |
| `saved_items` | `user_id`, `entity_type`, `entity_id` | UNIQUE `(user_id, entity_type, entity_id)` |

**Migration mechanics (§61, §79):** drizzle-kit generates DDL; two things require hand-written custom migrations (drizzle-kit can't express them): (a) `CREATE EXTENSION btree_gist` + the two EXCLUSION constraints, (b) production GRANT/REVOKE for append-only audit tables. Every migration ships with a written safety note (lock impact, backfill, rollback).

---

## 5. State machines

Kernel: `src/lib/state-machine` provides `defineMachine({ states, actions, transitions })` producing an exhaustive `transition(state, action) → state` with `assertNever` in the default branch (§6). Services never write `state` literals; they call `machine.transition()` and persist via **state-conditional UPDATE**:

```sql
UPDATE khidma_bookings SET state = $next, updated_at = now()
WHERE id = $id AND state = $expected
```

Rowcount 0 ⇒ someone else changed state ⇒ `InvalidStateTransitionError` (409) — no lost updates, no TOCTOU (§81).

Actors: `system` = deterministic job/derived event; every human transition records audit + emits outbox events.

### 5.1 SOUQ circle

| From | Action | Actor | To | Guard / side effects |
| --- | --- | --- | --- | --- |
| draft | `publish` | seller (owner) | open | deadline in future, price set |
| open | `reach_target` | system (on join tx) | locked | fires only inside the join transaction when `current_quantity = target_quantity`; captures authorized payments |
| open | `expire` | system (expirer job) | expired | `deadline_at <= now()`; voids authorizations |
| open | `cancel` | seller (owner) | cancelled | voids authorizations |
| locked | `confirm_supplier` | seller (owner) | supplier_confirmed | |
| locked | `fail_close` | ops_admin/admin | failed_closed | reason required; voids/refunds all captures |
| supplier_confirmed | `begin_fulfillment` | seller | fulfilling | |
| fulfilling | `mark_delivered` | seller | delivered | |
| delivered | `complete` | seller / ops (auto after window) | completed | **terminal** |
| expired, cancelled, failed_closed | — | — | — | **terminal** |

No backward transitions. `open → requested`-style reversals are unrepresentable.

### 5.2 SOUQ participant (payment_status)

`pending → authorized → captured` on the happy path; `authorized → refunded/voided` on `expired/cancelled/fail_closed`; `pending → failed` on authorization failure. A participant row is created **only** with a successful authorization intent (or `payment_status='none'` for free-to-join circles if product decides; default requires auth).

### 5.3 KHIDMA request

| From | Action | Actor | To |
| --- | --- | --- | --- |
| requested | `submit_quote` | professional | quoted |
| quoted | `accept_quote` | buyer (owner) | booked (creates booking in `payment_pending`) |
| requested/quoted | `cancel` | buyer (owner) | cancelled |
| requested/quoted | `expire` | system | expired |

Quote sub-machine: `submitted → accepted | rejected | withdrawn | expired` (one accepted quote per request; acceptance is the `accept_quote` action inside the booking transaction).

### 5.4 KHIDMA booking

| From | Action | Actor | To | Guard / side effects |
| --- | --- | --- | --- | --- |
| payment_pending | `confirm` | system (on payment captured webhook/confirmation) | confirmed | **exclusion constraint validates slot here**; on violation → auto-void path (see §6.3) |
| payment_pending | `timeout` | system (TTL job, 15 min) | cancelled | frees the held slot |
| confirmed | `start` | professional (owner) | in_progress | `now() >= start_time − grace` |
| in_progress | `complete` | professional (owner) | completed | **terminal** (after settlement) |
| payment_pending / confirmed | `cancel` | buyer / professional / approved cancellation | cancelled | refund per policy if captured |
| confirmed / in_progress / completed | `open_dispute` | buyer / professional | disputed | via disputes domain |
| disputed | `resolve_refund` | admin | refunded | creates refund |
| disputed | `resolve_complete` | admin | completed | |

### 5.5 KRAYA booking

| From | Action | Actor | To | Guard / side effects |
| --- | --- | --- | --- | --- |
| requested | `submit` | renter | payment_pending | server computes `total = rate × billable_days + deposit`; creates contract draft |
| payment_pending | `confirm` | system (deposit+rent authorized/captured per policy) | confirmed | **exclusion constraint validates slot**; writes immutable `rental_contracts` snapshot in same tx |
| payment_pending | `timeout` | system | cancelled | |
| confirmed | `activate` | system / owner at `start_time` | active | |
| active | `complete` | owner (return inspection) | completed | releases deposit hold (void or refund) |
| requested / payment_pending / confirmed | `cancel` | renter / owner / approved cancellation | cancelled | policy-based fee, remainder refunded |
| confirmed / active / completed | `open_dispute` | renter / owner | disputed | |
| disputed | `resolve_*` | admin | refunded / completed | |

### 5.6 Payment (shared)

```
created → authorization_pending → authorized → capture_pending → captured
   │              │                    │              │
   │              ▼                    ▼              ▼
   └─────────► failed ◄──── void_pending ◄───────────┘
                                  │
                                  ▼
                               voided
captured → refund_pending → refunded
```

Monotonic forward-only transitions; `authorized` may go to `voided` or `captured`, never back. `captured` can never become `authorized` (§94). Every change is triggered by a verified provider event, a reconciliation job, or an explicit user action — never by client assertion (§26).

### 5.7 Refund

`requested → provider_pending → completed | failed`. Guard at creation: `payment.state = captured` and `amount <= captured − refunded` (checked under `SELECT … FOR UPDATE` on the payment row). Failed refunds stay for reconciliation retry; they are never silently dropped.

### 5.8 Cancellation request

`pending → approved → executed` (internal state changes + refund happen in the approval transaction), `pending → rejected`, `pending → withdrawn` (requester retracts). `executed/rejected` terminal. Approval flow is specified in §6.4.

### 5.9 Dispute

`opened → under_review → resolved`. Evidence may be appended in any non-terminal state (append-only). Resolution writes `dispute_resolutions` + `admin_actions` + target-entity transition **in one transaction**.

---

## 6. Concurrency strategy (the core of DBER)

| # | Scenario | Mechanism | Failure surfaced as |
| --- | --- | --- | --- |
| 6.1 | 10 users join the last Souq slot | Single tx: INSERT participant (UNIQUE catches re-join) → **atomic conditional UPDATE** of `current_quantity` with `state='open' AND deadline_at>now() AND current_quantity+$q <= target_quantity` → rowcount 0 ⇒ capacity/state conflict | `InsufficientCapacityError` (409) |
| 6.2 | Two professionals/buyers book same Khidma slot | INSERT/UPDATE passes through **partial EXCLUSION constraint** (GiST, `btree_gist`) on `(professional_id, tstzrange)` for slot-holding states | `BookingOverlapError` (409) |
| 6.3 | Two renters book same asset window | Same EXCLUSION pattern on `(asset_id, tstzrange)` | `BookingOverlapError` (409) |
| 6.4 | Concurrent admin approval of same cancellation | `SELECT … FOR UPDATE` on target entity row inside the tx, then state-conditional transition | second actor gets 409 |
| 6.5 | Payment state updates from webhook + user action + reconciliation | State-conditional UPDATE (`WHERE state = $expected`) — first writer wins, others observe and reconcile | no-op / logged out-of-order event |
| 6.6 | Duplicate webhook deliveries | UNIQUE `(provider, provider_event_id)` on `payment_events` insert-first | duplicate insert ⇒ skip processing |
| 6.7 | Duplicate idempotent mutations | UNIQUE `(scope, user_id, key)` insert-inside-transaction | replay or 409/422 (§7) |
| 6.8 | Two outbox workers | `SELECT … FOR UPDATE SKIP LOCKED` batch claim | — |
| 6.9 | Refund vs refund race | `FOR UPDATE` on payment row recompute of refundable headroom | `PaymentStateError` (409) |

**6.1 detail — why conditional UPDATE and not SELECT-then-UPDATE:** the SELECT-then-UPDATE pattern is the forbidden TOCTOU (§21, §81). The conditional UPDATE is a single atomic statement; PostgreSQL row locking serializes contenders; the CHECK `current_quantity <= target_quantity` is the database-level backstop even if application code regresses. Verified by a concurrency test firing 100 parallel joins at capacity 100 (§63).

**6.2/6.3 detail — slot holds.** `payment_pending` bookings hold the slot and a TTL job cancels them after 15 minutes, so the (rare) confirm-time exclusion failure only happens when two payment-pending bookings overlap and both capture; the loser gets an automatic void/refund and a clear cancellation notice. The DB invariant — *no two confirmed/in-progress rentals or services ever overlap* — is absolute; the UX cost of the rare race is a fast automatic refund, which is the correct trade (payment holds are reversible; double-bookings are not).

**6.4 detail — cancellation approval transaction (§35):**

```text
BEGIN
  SELECT … FROM target FOR UPDATE          -- lock entity row
  validate current state via machine       -- e.g. confirmed → cancelled allowed
  UPDATE target state (conditional)
  INSERT/UPDATE refund record              -- if money captured
  INSERT admin_actions (reason, actor)     -- dedicated admin audit
  INSERT audit_log (before/after)
  INSERT outbox_events (cancellation.approved, refund.requested, notification)
COMMIT
```

Concurrent contradictory admin actions are impossible: the second transaction blocks on the row lock, then fails the state validation.

---

## 7. Idempotency architecture

**Data model:** `idempotency_keys(scope, key, user_id, request_hash, status, response_status, response_body, expires_at)` with UNIQUE `(scope, user_id, key)`. `scope` = route pattern (e.g. `souq.join`); `request_hash` = SHA-256 of canonicalized validated body.

**Design: transactional reservation (single-transaction).** The idempotency row is inserted **inside the same transaction as the business mutation**:

```text
BEGIN
  INSERT INTO idempotency_keys (scope, key, user_id, request_hash, status)
  VALUES ($scope, $key, $user, $hash, 'in_progress')
  ON CONFLICT (scope, user_id, key) DO NOTHING
  -- inserted?  → proceed with business mutation below
  -- conflict?  → the INSERT waits for the concurrent tx to commit/abort,
  --               then SELECTs the row:
  --     status completed + hash equal    → replay stored response (200)
  --     status completed + hash differs  → 422 IdempotencyConflictError (§8)
  --     (in_progress rows are never visible to others: the writer's tx
  --      has not committed, or it aborted and the row never existed)
  business mutation (locks, state transition, participant/payment rows)
  audit + outbox inserts
  UPDATE idempotency_keys SET status='completed',
    response_status=$n, response_body=$json
COMMIT
```

Consequences (each maps to a directive requirement):

- **Concurrent duplicates (§9):** the second request *blocks* on the unique-conflict until the first commits, then replays. Exactly one business execution. Not the forbidden `SELECT-then-INSERT`.
- **Crash before commit (§12):** PostgreSQL aborts the uncommitted tx — idempotency row *and* business rows vanish together; client retry executes cleanly.
- **Crash after commit, before response (§12):** row is `completed` with the response snapshot; client retry gets the stored response. This is what makes "request may have succeeded despite timeout" decidable.
- **Replay semantics (§7):** same key + same hash ⇒ stored response, `Idempotency-Replayed: true` header; same key + different payload ⇒ `422` (never a false replay, §8).
- **Cleanup (§59):** job deletes `completed` rows past `expires_at` (7 days) — idempotency keys are operational data, not financial records (§88).

Applied to **every** mutating route (`x-idempotency-key` required): joins, bookings, quotes, payments, cancellations, dispute resolution, admin actions. Provider calls additionally carry deterministic provider idempotency keys (§12) — DBER idempotency and provider idempotency are separate layers.

---

## 8. Outbox architecture

**Model (§10, §11):** `outbox_events(event_type, event_version, aggregate_type, aggregate_id, payload_json, status, attempt_count, available_at, locked_at, processed_at, last_error)` — inserted in the same transaction as the state change, so *the event exists if and only if the business fact exists*.

**Worker (`src/jobs`):** loop every 1s (also exposed as `POST /api/v1/jobs/tick` guarded by a shared secret for platform cron):

```sql
UPDATE outbox_events SET status='processing', locked_at=now(), attempt_count=attempt_count+1
WHERE id IN (
  SELECT id FROM outbox_events
  WHERE status='pending' AND available_at <= now()
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 20
)
RETURNING *
```

- Handlers are **idempotent**: they receive a deterministic `delivery_key = event_type + event_id` and pass it to provider adapters (payment intents, notification dedupe).
- Failure: `status='pending'`, `available_at = now() + min(60s · 2^attempt_count, 1h)`, `last_error` recorded; after N=12 attempts → `status='failed'` and an ops notification (manual inspection; §15 error states).
- Crash between side effect and completion (§12): event re-delivers; provider-side idempotency key makes it effectively-once. Acceptance criterion: *at-least-once delivery + idempotent handlers ⇒ effectively-once business semantics.*
- No email/push/webhook is ever sent inside a business transaction (§83).

---

## 9. Audit architecture

**`audit_log`** (one row per important mutation): `actor_id, actor_role, action, entity_type, entity_id, before_jsonb, after_jsonb, metadata_jsonb, request_id, created_at`. Written in the same transaction as the mutation (§13) — an audit row is part of the business fact, so a crash can't produce an unaudited mutation.

- **Append-only:** no UPDATE/DELETE code path exists; production DB role will have those grants revoked on audit tables (migration note; enforced at deploy).
- **`admin_actions`** adds `reason` (required) for every admin operation (§87); **`provider_actions`** captures professional/seller operational actions.
- Request correlation (§14): `request_id` (UUID) is created at the edge (`proxy.ts` header pass-through / `withRoute`), placed in the response envelope, `audit_log.request_id`, `outbox_events.payload_json`, structured logs, and forwarded to provider calls.
- Timelines (§55) are a read model: `audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at` rendered by `DberTimeline`.

---

## 10. Payments architecture

- **Port (§68, §69):** `PaymentGateway { authorize, capture, void, refund, getPayment }`. MVP adapter: **MockGateway** (deterministic, scriptable failures) so all unhappy paths are testable without real money; production adapter (e.g. CMI/Stripe) implements the same port and translates provider states → canonical states.
- **Server-authoritative pricing (§49):** client never submits amounts. Souq price from circle; Khidma from accepted quote; Kraya computed as `daily_rate × billable_days + deposit` with billable days defined as `ceil(hours/24)` of the half-open interval (documented, integer math).
- **Webhooks (§38):** route `POST /api/v1/webhooks/payments/[provider]` → verify signature (adapter) → INSERT `payment_events` (UNIQUE dedupe) → process: resolve payment by `provider_ref` → state-conditional transition → audit + outbox. Duplicates: second insert loses the race ⇒ skip. Out-of-order: machine rejects non-forward transitions; the event row preserves the provider's truth for reconciliation.
- **Reconciliation (§59, §70):** job scans payments stuck in `authorization_pending/capture_pending/refund_pending` beyond SLA → `getPayment` → if provider disagrees, apply the **forward-only** canonical transition, write `audit_log` (actor `system:reconciliation`), emit `payment.reconciled`. Never rewrites financial history; discrepancies append corrections.
- **Kraya deposit:** stored as a separate payment row (`category='kraya_deposit'`). Confirm requires rental payment captured **and** deposit authorized (hold) — matching §31 without conflating auth/capture (§37).

---

## 11. Event catalog (versioned, §66–67)

Every outbox row carries `event_type` + `event_version` (starts at `1`); payload schemas are Zod-defined and frozen per version.

| Domain | Events |
| --- | --- |
| souq | `souq.circle.opened` · `souq.circle.joined` · `souq.circle.locked` · `souq.circle.expired` · `souq.circle.cancelled` · `souq.circle.failed_closed` · `souq.circle.delivered` · `souq.circle.completed` |
| khidma | `khidma.request.created` · `khidma.quote.submitted` · `khidma.booking.created` · `khidma.booking.confirmed` · `khidma.booking.started` · `khidma.booking.completed` · `khidma.booking.cancelled` |
| kraya | `kraya.booking.created` · `kraya.booking.confirmed` · `kraya.booking.started` · `kraya.booking.completed` · `kraya.booking.cancelled` · `kraya.contract.created` |
| payments | `payment.authorized` · `payment.captured` · `payment.failed` · `payment.voided` · `payment.reconciled` |
| refunds | `refund.requested` · `refund.completed` · `refund.failed` |
| cancellations | `cancellation.requested` · `cancellation.approved` · `cancellation.rejected` |
| disputes | `dispute.opened` · `dispute.evidence_added` · `dispute.resolved` |

Consumers (notifications, analytics, future integrations) dispatch on `(event_type, event_version)` and must tolerate unknown versions of known types.

---

## 12. Error taxonomy & API architecture

**Domain errors (`src/lib/errors`)** → HTTP (§44): `ValidationError` 400 · `UnauthorizedError` 401 · `ForbiddenError` 403 · `ResourceNotFoundError` 404 · `ConflictError`/`InvalidStateTransitionError`/`IdempotencyConflictError`/`BookingOverlapError`/`InsufficientCapacityError` 409 · semantic failures (`PaymentStateError`, business rule rejections) 422 · unexpected 500 (logged with `request_id`, generic body). Internal DB/provider errors are never leaked (§50).

**Envelope (§65):** success `{ data, requestId }`; error `{ error: { code, message, details? }, requestId }`. `details` is a typed, whitelisted structure (e.g. capacity conflict returns `{ remainingCapacity }`). Stable machine `code`s (`INSUFFICIENT_CAPACITY`, `BOOKING_OVERLAP`, …) — the UI maps codes to domain-specific messages (§53), never raw errors.

**Pipeline (`withRoute`, the only way a mutation route is written):**

```text
request → request_id (from header or generated) → authenticate (IdentityProvider)
        → authorize (RBAC + ownership) → require x-idempotency-key
        → Zod parse → application service (tx: idempotency reservation →
          domain transition → audit → outbox → idempotency completion) → COMMIT
        → { data, requestId }
```

**API surface (v1, §42):** all mutation routes require `x-idempotency-key`; ownership re-checked server-side even when the ID came from the client (IDOR defense).

```
POST /api/v1/souq/products                seller      create product
POST /api/v1/souq/circles                 seller      create+open circle
GET  /api/v1/souq/circles                 public      list/filter
GET  /api/v1/souq/circles/:id             public      detail
POST /api/v1/souq/circles/:id/join        buyer       join (6.1)
POST /api/v1/souq/circles/:id/transition  seller/ops  lifecycle actions
POST /api/v1/khidma/requests              buyer       create request
POST /api/v1/khidma/requests/:id/quotes   professional  submit quote
POST /api/v1/khidma/quotes/:id/accept     buyer       accept → booking (tx)
POST /api/v1/khidma/bookings/:id/transition  buyer/pro/ops
POST /api/v1/kraya/assets                 owner       create asset
GET  /api/v1/kraya/assets/:id/availability  public    calendar ranges
POST /api/v1/kraya/bookings               renter      create (server pricing)
POST /api/v1/kraya/bookings/:id/transition
POST /api/v1/payments                     buyer       create payment intent
POST /api/v1/webhooks/payments/:provider  provider (signature)
POST /api/v1/cancellations                any owner   request cancellation
POST /api/v1/cancellations/:id/review     ops/admin   approve/reject (6.4)
POST /api/v1/disputes                     any party   open dispute
POST /api/v1/disputes/:id/evidence        any party   append evidence
POST /api/v1/disputes/:id/resolve         admin       resolve (idempotent, audited)
POST /api/v1/admin/actions/*              admin       privileged ops
POST /api/v1/jobs/tick                    cron secret
```

Each endpoint gets a contract block (method, auth, headers, schemas, errors, state transitions, tx boundary, idempotency behavior, audit event, outbox events) in `docs/api/` as it is implemented (§64).

---

## 13. Authentication & RBAC

- **Port:** `IdentityProvider { resolve(headers): Identity | null }` where `Identity = { userId, role }`. MVP implementation `DevHeaderIdentityProvider` reads `x-dber-user-id` / `x-dber-role` and is **hard-gated to `DBER_ENV !== 'production'`** (§50) — in a production build it throws at startup. Future: session/OIDC adapter, zero domain changes.
- **Authorization:** two layers — route-level `requireRole(…)` and service-level ownership checks (`buyer_id === identity.userId` etc.) inside the transaction. UI hiding of buttons is never the control (§16, §41).
- **Permission matrix (summary):**

| Capability | buyer | seller | professional | ops_admin | admin |
| --- | --- | --- | --- | --- | --- |
| join circles / request services / book rentals / pay | ✓ | — | — | — | — |
| manage own products & circles (lifecycle) | — | ✓ | — | — | ✓ |
| submit quotes, start/complete own bookings | — | — | ✓ | — | ✓ |
| review cancellations, operational overrides | — | — | — | ✓ | ✓ |
| resolve disputes, fail_close circles, force actions | — | — | — | ✓* | ✓ |
| user management, full audit | — | — | — | — | ✓ |

\* per assigned permissions; destructive admin actions require `reason` and are designed for a second-approval layer later (§87).

- **Seeds (§91):** deterministic dev users (one per role, fixed UUIDs), sample products/circles/bookings/rentals/payments/disputes — dev-only script, never run against production.

---

## 14. Background jobs (§59)

| Job | Schedule | Behavior |
| --- | --- | --- |
| `outbox-dispatcher` | 1s loop | §8 |
| `souq-expirer` | 1 min | `open` circles past deadline → `expired`; void authorizations |
| `booking-ttl` | 1 min | `payment_pending` bookings past 15 min → `cancelled` (frees exclusion-held slots) |
| `payment-reconciler` | 5 min | §10 |
| `refund-reconciler` | 5 min | retry `provider_pending` refunds past SLA |
| `idempotency-cleanup` | daily | §7 |
| `dispute-deadline` | daily | flag disputes open beyond SLA → ops notification |
| `notification-dispatcher` | via outbox | renders + sends notifications; in-app `notifications` row + email/push adapter |

Runtime: `instrumentation.ts` registers the interval in the Node runtime for dev/single-node; the `jobs/tick` endpoint drives serverless/cron deploys. Jobs are safe to run concurrently (SKIP LOCKED, conditional updates); running twice never double-effects (§59).

---

## 15. Failure & recovery matrix (§12)

| Failure | Detection | Recovery | User-visible behavior |
| --- | --- | --- | --- |
| Crash mid-transaction | PG abort | tx rolled back wholly (business + audit + outbox + idempotency) | retry with same key executes cleanly |
| Crash after commit, before response | client timeout | idempotency replay | retry returns original result |
| Worker crash after provider accepted, before recording | outbox `processing` + stale `locked_at` reaper (reset to `pending` after 5 min) | re-delivery; provider idempotency key dedupes | none |
| Payment provider timeout | adapter timeout | payment stays `authorization_pending`; reconciler queries `getPayment` | "payment processing" state, honest UI (§53) |
| Duplicate webhook | UNIQUE event insert | skipped | none |
| Out-of-order webhook | machine rejects backward transition | event stored, alert if unexpected | none |
| Lost Souq race | conditional UPDATE rowcount 0 | 409 `INSUFFICIENT_CAPACITY` + `remainingCapacity` | "circle filled" state, alternatives suggested |
| Lost booking race | EXCLUSION violation | 409 `BOOKING_OVERLAP` | "dates no longer available" + calendar refresh |
| Confirm-time slot loss (§6.2) | exclusion violation on confirm | auto void/refund + cancellation + notification | "payment refunded — slot taken"; money never lost |
| DB down | connection errors | requests fail 503 with request_id; no partial state | calm error state, retry affordance |
| Outbox poison event | 12 attempts → `failed` | ops alert; manual replay tooling (admin) | side-effect delay, business state intact |

---

## 16. UI architecture & design system (per UI directive)

**Visual identity:** warm editorial commerce — background `#F7F6F1`, surface `#FFFFFF`, ink `#171815`, secondary `#6E7168`, border `#E4E5DF`, DBER green `#61775A` / dark `#304536` / soft `#E6EDE2`, warm accent `#B99B62`, warning `#C38B3B`, error `#B85C52`, success `#5C8062`. Dark palette available. Tailwind 4 `@theme` tokens; restrained color-as-state, no decoration gradients.

**Typography:** Geist (already in the Next ecosystem) with tabular numerals for all money; scale: eyebrow 11–12 uppercase tracked · page title 32–48 · section 20–26 · body 14–16 · metadata 12–13 · price large/bold/high-contrast.

**Component inventory (`components/dber`):** Button (primary/secondary/tertiary/destructive, loading preserves dimensions, disabled readable), Input, Search, Select, Tabs, Badge, Avatar, Card, ProductCard, ServiceCard, RentalCard, ProfessionalCard, TransactionCard, StatusBadge, ProgressBar, Timeline, Modal, BottomSheet, Drawer, Toast, Skeleton, Calendar, PriceBreakdown, CheckoutSummary, EmptyState, ErrorState, Notification, DataTable. Vertical components: SouqCircleCard/JoinPanel/Progress, KhidmaQuoteCard/BookingTimeline, KrayaAssetCard/AvailabilityCalendar/DepositSummary.

**State-aware UI (§35 + UI §15):** a single mapping drives every transaction surface — `StatusBadge` variant + available actions + copy come from `lib/state-machine` metadata (same source as the backend), so the UI can never offer an action invalid for the current state, and the server re-validates anyway.

| State family | Treatment |
| --- | --- |
| completed states | subtle success |
| current state | strong emphasis |
| future states | muted |
| failed | calm error, clear next action |
| cancelled | neutral destructive |
| disputed | attention + next action |
| payment pending | explicit pending (never a bare spinner, §15) |

**Rendering discipline (§51, §54):** Server Components for all reads (home, listings, detail, activity, admin tables); Client Components only for join/booking/checkout/calendar/filters. **No optimistic updates for financially authoritative state** — payment status renders only server-confirmed truth. Buttons disable + show "Processing…" during mutations (duplicate-submission guard) and every mutation surfaces the §53 unhappy-path matrix (validation, auth failure, conflict, network, timeout-with-uncertain-outcome → "check activity" flow).

**Screens → routes (UI directive §38):** the 40 screens map onto: `/` (home+search), `/souq`, `/souq/[circle]` (detail+group+join flow as sheet), `/khidma`, `/khidma/pro/[id]`, `/khidma/book` (5-step flow), `/kraya`, `/kraya/[asset]` (detail+calendar), `/checkout`, `/checkout/success|failed`, `/activity` (+timeline detail), `/notifications`, `/saved`, `/account`, `/pro` (seller/professional dashboards), `/admin` (dashboard, users, entities, payments, refunds, cancellations, disputes, audit, outbox). Empty/error/offline states are first-class components on every surface (UI §20–22).

**Accessibility (UI §30):** WCAG 2.2 AA — keyboard paths, visible focus, 44px targets, status communicated by icon+text+color (never color alone), reduced-motion respected.

---

## 17. Testing strategy (§62)

- **Unit (vitest):** every state machine transition matrix (valid + a sample of illegal), pricing/billable-days, cancellation policies, refund headroom rules, RBAC checks, Zod schemas. Pure domain code needs no DB.
- **Integration (vitest + real PostgreSQL via docker-compose, per-worker schema):** transaction boundaries (audit/outbox/idempotency atomicity), idempotency replay + payload-mismatch + concurrent same-key (two connections, second blocks then replays), payment transitions via webhook duplicates/out-of-order, refund constraints, cancellation approval transaction.
- **Concurrency:** 100 parallel joins on capacity-100 circle via real connections (assert exactly 100 participants, quantity invariant holds); parallel Khidma bookings on one slot (assert 1 confirmed); parallel Kraya bookings overlapping (assert exclusion fires); concurrent double-approval of a cancellation (assert one executed).
- **Failure injection:** mock gateway scriptable timeouts/rejections; worker crash simulation (claim event, kill, reap, re-deliver); DB connection kill mid-tx.
- CI gates: `tsc --noEmit` (zero `any`), eslint with boundary rules, all tests, migration idempotency check.

---

## 18. Development phases & initial implementation plan

Aligned with directive §77; each phase ends with its verification gate:

| Phase | Scope | Gate |
| --- | --- | --- |
| **1 — Foundation** (partially done) | finish: `withRoute` pipeline, error taxonomy, correlation, logging, DevHeader auth + RBAC, config, seeds; extend users table | health route + auth-guarded ping, lint boundaries |
| **2 — Transaction kernel** | state-machine kernel, idempotency infra, audit, outbox + worker, money/validation primitives, migrations for all kernel tables | integration tests: idempotent replay, outbox retry, audit atomicity |
| **3 — SOUQ** | products, circles, join (§6.1), lifecycle, payment boundary via MockGateway, admin fail_close, UI (discovery/detail/join) | 100-parallel-join concurrency test green |
| **4 — KHIDMA** | requests, quotes, booking tx, exclusion constraint, confirm-after-payment, disputes/cancellation integration, pro workspace UI | overlap test green; unhappy-path UI review |
| **5 — KRAYA** | assets, availability, bookings + deposit, contracts snapshot, return flow, calendar UI | overlap + contract-immutability tests green |
| **6 — Governance** | admin console (entities, audit explorer, cancellation review, dispute resolution, outbox visibility) | admin flows audited end-to-end |
| **7 — Reliability** | full job suite, reconcilers, failure injection, observability polish | failure-matrix tests green |
| **8 — UX polish** | responsive, a11y pass, loading/empty/error states everywhere | design-system audit |

**First implementation increment (on approval):** Phase 1 completion — error classes + envelope, `withRoute`, correlation, RBAC + identity, users-table extension, seed script — then the Phase 2 kernel, since every vertical depends on it.

---

## 19. Master invariants (enforcement summary, §94)

| Invariant | Enforced by |
| --- | --- |
| `0 ≤ current_quantity ≤ target_quantity` | CHECK + conditional UPDATE + test |
| locked/expired circles accept no joins | state guard in UPDATE + job |
| no overlapping Khidma confirmed bookings | partial EXCLUSION (GiST) |
| no overlapping Kraya confirmed rentals | partial EXCLUSION (GiST) |
| confirmed ⇒ payment condition satisfied | transition guard reads payment state in-tx |
| refund ≤ captured − refunded; no double refund | payment row FOR UPDATE + CHECK + UNIQUE provider refs |
| captured never → authorized | forward-only machine + conditional UPDATE |
| every important mutation audited | audit insert in same tx; boundary lint |
| side-effect-producing changes emit outbox | services construct via `withTransactionEffects` helper |
| same key + same payload = same result | §7 transactional reservation |
| contract/quote snapshots immutable | no update paths; append-only versions |

---

## 20. V1 production-completeness additions (2026-09-19)

The following closes the remaining V1 directive gaps; all layers are connected (DB → domain → API → UI → flow).

**Authentication (§3/§4).** Real credential auth replaces dev-only identity in all environments:
scrypt password hashing (`lib/auth/password.ts`), server-side sessions with SHA-256-hashed opaque
tokens (`lib/auth/session.ts`), single-use email-verification / password-reset tokens
(`auth_tokens`), and the `authenticate()` / `requireAuth()` / `getCurrentUser()` boundary in
`lib/auth/identity.ts`. Dev headers/cookies remain hard-gated to non-production. Routes:
`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`,
`/account/security` (change password + session revocation). Auth emails use an `EmailSender`
port: console delivery in dev, honest `delivered: false` in production until a provider is
configured (§79).

**Provider workspaces (§5/§6/§9/§15).** `/pro/seller/*` (products create→draft→publish gate,
group-buy launch, inventory view, earnings, store settings), `/pro/professional/*` (rich
profile — headline/bio/specialties/service area/languages, services with publish gate, weekly
availability editor, request feed + quotes, bookings, earnings), `/pro/rental/*` (asset form
with real photo upload, blocked-window calendar editor, bookings with return/completion,
earnings). Products and services now start as `draft`; publishing is a server-validated
transition (photo/price/inventory/location gates) with a `restore` path from archived.

**Media (§47).** `StorageAdapter` port with a local-volume dev implementation
(`.data/uploads`, gitignored) and upload registry table. `POST /api/v1/media` validates
type/size (JPEG/PNG/WebP/AVIF ≤ 5 MB), stores alt text, and returns the serving URL used
verbatim in listing image arrays; `GET /api/v1/media/[id]` serves with immutable caching.

**Payouts (§22/§23).** The ledger is cross-vertical: `payouts(entity_type, entity_id)` rows are
created inside the completion transaction for SOUQ circles (seller), KHIDMA bookings
(professional), and KRAYA rentals (owner); settlement remains outbox-driven
(pending → processing → paid/failed).

**Engagement.** Reviews tied to completed transactions only (author = paying customer, subject
= provider, one per transaction per author, unique-enforced); contextual per-transaction
message threads (participants authorized by the owning domain service — no free chat);
support tickets with an ops queue and audited state changes; save/favorite toggles persisted
server-side across all verticals.

**Payments (§19/§20).** `PaymentGateway` is selected from validated env
(`DBER_PAYMENT_PROVIDER=mock|stripe`); a Stripe adapter (`stripe-gateway.ts`) implements the
documented REST contract (manual-capture PaymentIntents, Refunds, Payouts) and the documented
webhook signature scheme. New `pending` outcome semantics: the provider accepted but the
canonical state advances ONLY from a verified provider event. Production env validation fails
fast without real provider configuration; the mock adapter is refused in production.

**Admin (§31/§32/§44).** Added `/admin/users` (search + activity counts), `/admin/listings`
(cross-vertical moderation: approve/reject/disable/restore with mandatory reason, recorded in
`listing_moderations` + `admin_actions` + audit), `/admin/support` (ticket queue),
`/admin/jobs` (live job/system health: outbox backlog, dead-letters, stale TTLs, stuck
payments, worker heartbeat, DB reachability).

**UX.** `loading.tsx` skeletons on all primary routes, state-aware status map extended
(payouts, support, listing, verification states), role-aware shell (Workspace / Operations
entries, real sign-out), vertical identity tokens (KHIDMA clay, KRAYA azure) with corrected
media gradients.

**Tests.** 52 passing: original suites plus `tests/completeness.test.ts` (password hashing,
Stripe webhook signature verification incl. tamper/staleness, publish gating, ownership,
review lifecycle, cross-vertical payouts, support tickets, messaging authorization).
