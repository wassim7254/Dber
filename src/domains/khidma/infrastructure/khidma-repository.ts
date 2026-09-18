import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";

import { khidmaAvailability, khidmaBookings, khidmaServices, serviceQuotes, serviceRequests, users } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import type { KhidmaBookingState, KhidmaQuoteState, KhidmaRequestState } from "@/domains/khidma/domain/machine";

export type KhidmaBookingRow = typeof khidmaBookings.$inferSelect;
export type KhidmaServiceRow = typeof khidmaServices.$inferSelect;
export type ServiceRequestRow = typeof serviceRequests.$inferSelect;
export type ServiceQuoteRow = typeof serviceQuotes.$inferSelect;

export async function getServiceById(executor: DbExecutor, serviceId: string): Promise<KhidmaServiceRow | null> {
  const [row] = await executor.select().from(khidmaServices).where(eq(khidmaServices.id, serviceId)).limit(1);
  return row ?? null;
}

export async function lockBooking(tx: Tx, bookingId: string): Promise<KhidmaBookingRow | null> {
  const [row] = await tx.select().from(khidmaBookings).where(eq(khidmaBookings.id, bookingId)).for("update").limit(1);
  return row ?? null;
}

export async function getBookingById(executor: DbExecutor, bookingId: string): Promise<KhidmaBookingRow | null> {
  const [row] = await executor.select().from(khidmaBookings).where(eq(khidmaBookings.id, bookingId)).limit(1);
  return row ?? null;
}

export async function lockRequest(tx: Tx, requestId: string): Promise<ServiceRequestRow | null> {
  const [row] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)).for("update").limit(1);
  return row ?? null;
}

export async function getRequestById(executor: DbExecutor, requestId: string): Promise<ServiceRequestRow | null> {
  const [row] = await executor.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
  return row ?? null;
}

export async function getQuoteById(executor: DbExecutor, quoteId: string): Promise<ServiceQuoteRow | null> {
  const [row] = await executor.select().from(serviceQuotes).where(eq(serviceQuotes.id, quoteId)).limit(1);
  return row ?? null;
}

export async function lockQuote(tx: Tx, quoteId: string): Promise<ServiceQuoteRow | null> {
  const [row] = await tx.select().from(serviceQuotes).where(eq(serviceQuotes.id, quoteId)).for("update").limit(1);
  return row ?? null;
}

export async function transitionBookingState(
  tx: Tx,
  input: { bookingId: string; from: readonly KhidmaBookingState[]; to: KhidmaBookingState; stateBeforeDispute?: KhidmaBookingState | null; clearStateBeforeDispute?: boolean },
): Promise<KhidmaBookingRow | null> {
  const [row] = await tx
    .update(khidmaBookings)
    .set({
      state: input.to,
      updatedAt: new Date(),
      ...(input.stateBeforeDispute !== undefined ? { stateBeforeDispute: input.stateBeforeDispute } : {}),
      ...(input.clearStateBeforeDispute ? { stateBeforeDispute: null } : {}),
    })
    .where(and(eq(khidmaBookings.id, input.bookingId), inArray(khidmaBookings.state, [...input.from])))
    .returning();
  return row ?? null;
}

export async function transitionRequestState(
  tx: Tx,
  input: { requestId: string; from: readonly KhidmaRequestState[]; to: KhidmaRequestState },
): Promise<ServiceRequestRow | null> {
  const [row] = await tx
    .update(serviceRequests)
    .set({ state: input.to, updatedAt: new Date() })
    .where(and(eq(serviceRequests.id, input.requestId), inArray(serviceRequests.state, [...input.from])))
    .returning();
  return row ?? null;
}

export async function transitionQuoteState(
  tx: Tx,
  input: { quoteId: string; from: readonly KhidmaQuoteState[]; to: KhidmaQuoteState },
): Promise<ServiceQuoteRow | null> {
  const [row] = await tx
    .update(serviceQuotes)
    .set({ state: input.to, updatedAt: new Date() })
    .where(and(eq(serviceQuotes.id, input.quoteId), inArray(serviceQuotes.state, [...input.from])))
    .returning();
  return row ?? null;
}

export interface ServiceCardRow {
  id: string;
  title: string;
  specialty: string;
  category: string;
  basePriceMinor: number;
  currency: string;
  durationMinutes: number;
  professionalId: string;
  professionalName: string;
}

export async function listActiveServices(executor: DbExecutor, search: string | null, limit: number): Promise<ServiceCardRow[]> {
  const query = executor
    .select({
      id: khidmaServices.id,
      title: khidmaServices.title,
      specialty: khidmaServices.specialty,
      category: khidmaServices.category,
      basePriceMinor: khidmaServices.basePriceMinor,
      currency: khidmaServices.currency,
      durationMinutes: khidmaServices.durationMinutes,
      professionalId: khidmaServices.professionalId,
      professionalName: users.displayName,
    })
    .from(khidmaServices)
    .innerJoin(users, eq(khidmaServices.professionalId, users.id))
    .where(
      search
        ? and(eq(khidmaServices.status, "active"), sql`${khidmaServices.title} ILIKE ${`%${search}%`}`)
        : eq(khidmaServices.status, "active"),
    )
    .orderBy(asc(khidmaServices.basePriceMinor))
    .limit(limit);
  return query;
}

export async function listServicesByProfessional(executor: DbExecutor, professionalId: string): Promise<KhidmaServiceRow[]> {
  return executor
    .select()
    .from(khidmaServices)
    .where(eq(khidmaServices.professionalId, professionalId))
    .orderBy(desc(khidmaServices.createdAt))
    .limit(50);
}

export async function listAvailability(
  executor: DbExecutor,
  professionalId: string,
): Promise<(typeof khidmaAvailability.$inferSelect)[]> {
  return executor
    .select()
    .from(khidmaAvailability)
    .where(eq(khidmaAvailability.professionalId, professionalId))
    .orderBy(asc(khidmaAvailability.weekday), asc(khidmaAvailability.startMinute));
}

export async function listOpenRequestsForProfessional(executor: DbExecutor, professionalId: string): Promise<
  {
    request: ServiceRequestRow;
    quotedByMe: boolean;
  }[]
> {
  const rows = await executor
    .select({
      request: serviceRequests,
      quotedByMe: sql<boolean>`EXISTS (
        SELECT 1 FROM ${serviceQuotes}
        WHERE ${serviceQuotes.requestId} = ${serviceRequests.id}
          AND ${serviceQuotes.professionalId} = ${professionalId}
      )`,
    })
    .from(serviceRequests)
    .where(inArray(serviceRequests.state, ["requested", "quoted"]))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);
  return rows;
}

export async function listQuotesForRequest(executor: DbExecutor, requestId: string): Promise<
  (ServiceQuoteRow & { professionalName: string })[]
> {
  const rows = await executor
    .select({
      quote: serviceQuotes,
      professionalName: users.displayName,
    })
    .from(serviceQuotes)
    .innerJoin(users, eq(serviceQuotes.professionalId, users.id))
    .where(eq(serviceQuotes.requestId, requestId))
    .orderBy(asc(serviceQuotes.amountMinor))
    .limit(50);
  return rows.map((row) => ({ ...row.quote, professionalName: row.professionalName }));
}

export async function listBookingsForBuyer(executor: DbExecutor, buyerId: string): Promise<KhidmaBookingRow[]> {
  return executor
    .select()
    .from(khidmaBookings)
    .where(eq(khidmaBookings.buyerId, buyerId))
    .orderBy(desc(khidmaBookings.createdAt))
    .limit(50);
}

export async function listBookingsForProfessional(executor: DbExecutor, professionalId: string): Promise<KhidmaBookingRow[]> {
  return executor
    .select()
    .from(khidmaBookings)
    .where(eq(khidmaBookings.professionalId, professionalId))
    .orderBy(desc(khidmaBookings.createdAt))
    .limit(50);
}

export async function listQuotesByProfessional(executor: DbExecutor, professionalId: string): Promise<
  (ServiceQuoteRow & { requestDescription: string })[]
> {
  const rows = await executor
    .select({
      quote: serviceQuotes,
      requestDescription: serviceRequests.description,
    })
    .from(serviceQuotes)
    .innerJoin(serviceRequests, eq(serviceQuotes.requestId, serviceRequests.id))
    .where(eq(serviceQuotes.professionalId, professionalId))
    .orderBy(desc(serviceQuotes.createdAt))
    .limit(50);
  return rows.map((row) => ({ ...row.quote, requestDescription: row.requestDescription }));
}

export async function listRequestsForBuyer(executor: DbExecutor, buyerId: string): Promise<ServiceRequestRow[]> {
  return executor
    .select()
    .from(serviceRequests)
    .where(eq(serviceRequests.buyerId, buyerId))
    .orderBy(desc(serviceRequests.createdAt))
    .limit(50);
}

/** TTL scan input: bookings stuck in payment_pending past the deadline. */
export async function listStalePaymentPendingBookings(executor: DbExecutor, cutoff: Date, limit: number): Promise<
  { id: string }[]
> {
  return executor
    .select({ id: khidmaBookings.id })
    .from(khidmaBookings)
    .where(and(eq(khidmaBookings.state, "payment_pending"), lt(khidmaBookings.createdAt, cutoff)))
    .limit(limit);
}

export async function listExpiredQuotes(executor: DbExecutor, now: Date, limit: number): Promise<
  { id: string }[]
> {
  return executor
    .select({ id: serviceQuotes.id })
    .from(serviceQuotes)
    .where(and(eq(serviceQuotes.state, "submitted"), lt(serviceQuotes.expiresAt, now)))
    .limit(limit);
}

/** Upcoming bookings for the reconcilers/dashboards. */
export async function listBookingsStartingAfter(executor: DbExecutor, from: Date, limit: number): Promise<
  KhidmaBookingRow[]
> {
  return executor
    .select()
    .from(khidmaBookings)
    .where(and(inArray(khidmaBookings.state, ["confirmed", "in_progress"]), gt(khidmaBookings.startTime, from)))
    .orderBy(asc(khidmaBookings.startTime))
    .limit(limit);
}
