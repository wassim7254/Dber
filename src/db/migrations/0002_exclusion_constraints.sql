-- Custom migration: database-enforced scheduling invariants (§6.2/§6.3).
-- Drizzle-kit cannot express exclusion constraints, so they are added here.
--
-- Safety notes:
-- - btree_gist is required for scalar equality (=) inside a GiST exclusion constraint.
-- - The constraints are partial: only slot-holding states block intervals, so
--   cancelled/completed bookings release their slot immediately.
-- - Intervals are half-open [start_time, end_time) — adjacent bookings never collide.
-- - Adding the constraint takes a brief ACCESS EXCLUSIVE lock on each table; both
--   tables are empty on fresh installs and small in dev. For large production
--   tables this must run in a low-traffic window.

CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

ALTER TABLE "khidma_bookings" ADD CONSTRAINT "khidma_bookings_no_overlap"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("start_time", "end_time", '[)') WITH &&
  )
  WHERE ("state" IN ('payment_pending', 'confirmed', 'in_progress'));--> statement-breakpoint

ALTER TABLE "rental_bookings" ADD CONSTRAINT "rental_bookings_no_overlap"
  EXCLUDE USING gist (
    "asset_id" WITH =,
    tstzrange("start_time", "end_time", '[)') WITH &&
  )
  WHERE ("state" IN ('payment_pending', 'confirmed', 'active'));
