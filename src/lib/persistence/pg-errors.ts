import {
  BookingOverlapError,
  ConflictError,
  ValidationError,
} from "@/lib/errors";

/**
 * Structural view of a PostgreSQL error surfaced by postgres.js / Drizzle.
 * Narrowed with a type guard — no `any`, no unsafe casts.
 */
interface PgErrorLike {
  readonly code?: string;
  readonly constraint?: string;
  readonly detail?: string;
}

const PG_UNIQUE_VIOLATION = "23505";
const PG_EXCLUSION_VIOLATION = "23P01";
const PG_CHECK_VIOLATION = "23514";
const PG_FK_VIOLATION = "23503";

export function asPgError(error: unknown): PgErrorLike | null {
  // Drizzle wraps driver errors (DrizzleQueryError.cause → postgres.js PostgresError),
  // so traverse the cause chain to find the PostgreSQL-reported code.
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (current === null || typeof current !== "object") return null;
    const candidate = current as { code?: unknown; constraint?: unknown; detail?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint === "string" ? candidate.constraint : undefined,
        detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
      };
    }
    current = candidate.cause;
  }
  return null;
}

/** Constraint names registered in the custom migration for exclusion invariants. */
const BOOKING_OVERLAP_CONSTRAINTS = new Set([
  "khidma_bookings_no_overlap",
  "rental_bookings_no_overlap",
]);

/**
 * Translates known persistence violations into typed domain errors so route
 * handlers never leak SQL. Returns the original error when it is not one of
 * the recognized codes (the caller decides how to surface it).
 */
export function translatePersistenceError(error: unknown): Error {
  const pg = asPgError(error);
  if (!pg) {
    return error instanceof Error ? error : new Error("Unknown persistence error");
  }
  switch (pg.code) {
    case PG_EXCLUSION_VIOLATION:
      if (pg.constraint !== undefined && BOOKING_OVERLAP_CONSTRAINTS.has(pg.constraint)) {
        return new BookingOverlapError();
      }
      return new ConflictError("The operation conflicts with an existing record");
    case PG_UNIQUE_VIOLATION:
      if (pg.constraint !== undefined && pg.constraint.includes("participants")) {
        return new ConflictError("You have already joined this group");
      }
      return new ConflictError("This record already exists");
    case PG_CHECK_VIOLATION:
      return new ValidationError("The operation violates a business constraint");
    case PG_FK_VIOLATION:
      return new ConflictError("The operation references a record that does not exist");
    default:
      return error instanceof Error ? error : new Error("Unknown persistence error");
  }
}
