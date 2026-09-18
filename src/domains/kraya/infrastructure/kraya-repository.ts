import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";

import { krayaAssets, krayaAvailability, payouts, rentalBookings, rentalContracts, users } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import type { KrayaBookingState } from "@/domains/kraya/domain/machine";

export type KrayaAssetRow = typeof krayaAssets.$inferSelect;
export type RentalBookingRow = typeof rentalBookings.$inferSelect;
export type RentalContractRow = typeof rentalContracts.$inferSelect;

export async function getAssetById(executor: DbExecutor, assetId: string): Promise<KrayaAssetRow | null> {
  const [row] = await executor.select().from(krayaAssets).where(eq(krayaAssets.id, assetId)).limit(1);
  return row ?? null;
}

export async function lockBooking(tx: Tx, bookingId: string): Promise<RentalBookingRow | null> {
  const [row] = await tx.select().from(rentalBookings).where(eq(rentalBookings.id, bookingId)).for("update").limit(1);
  return row ?? null;
}

export async function getBookingById(executor: DbExecutor, bookingId: string): Promise<RentalBookingRow | null> {
  const [row] = await executor.select().from(rentalBookings).where(eq(rentalBookings.id, bookingId)).limit(1);
  return row ?? null;
}

export async function transitionBookingState(
  tx: Tx,
  input: {
    bookingId: string;
    from: readonly KrayaBookingState[];
    to: KrayaBookingState;
    stateBeforeDispute?: KrayaBookingState | null;
    clearStateBeforeDispute?: boolean;
  },
): Promise<RentalBookingRow | null> {
  const [row] = await tx
    .update(rentalBookings)
    .set({
      state: input.to,
      updatedAt: new Date(),
      ...(input.stateBeforeDispute !== undefined ? { stateBeforeDispute: input.stateBeforeDispute } : {}),
      ...(input.clearStateBeforeDispute ? { stateBeforeDispute: null } : {}),
    })
    .where(and(eq(rentalBookings.id, input.bookingId), inArray(rentalBookings.state, [...input.from])))
    .returning();
  return row ?? null;
}

export async function getContract(executor: DbExecutor, bookingId: string): Promise<RentalContractRow | null> {
  const [row] = await executor
    .select()
    .from(rentalContracts)
    .where(eq(rentalContracts.bookingId, bookingId))
    .limit(1);
  return row ?? null;
}

export interface AssetCardRow {
  id: string;
  title: string;
  description: string;
  category: string;
  dailyRateMinor: number;
  depositMinor: number;
  currency: string;
  location: string;
  images: string[];
  ownerName: string;
}

export async function listActiveAssets(executor: DbExecutor, search: string | null, limit: number): Promise<AssetCardRow[]> {
  return executor
    .select({
      id: krayaAssets.id,
      title: krayaAssets.title,
      description: krayaAssets.description,
      category: krayaAssets.category,
      dailyRateMinor: krayaAssets.dailyRateMinor,
      depositMinor: krayaAssets.depositMinor,
      currency: krayaAssets.currency,
      location: krayaAssets.location,
      images: krayaAssets.images,
      ownerName: users.displayName,
    })
    .from(krayaAssets)
    .innerJoin(users, eq(krayaAssets.ownerId, users.id))
    .where(
      search
        ? and(
            eq(krayaAssets.status, "active"),
            or(
              sql`${krayaAssets.title} ILIKE ${`%${search}%`}`,
              sql`${krayaAssets.location} ILIKE ${`%${search}%`}`,
            ),
          )
        : eq(krayaAssets.status, "active"),
    )
    .orderBy(asc(krayaAssets.dailyRateMinor))
    .limit(limit);
}

export async function listAssetsByOwner(executor: DbExecutor, ownerId: string): Promise<KrayaAssetRow[]> {
  return executor
    .select()
    .from(krayaAssets)
    .where(eq(krayaAssets.ownerId, ownerId))
    .orderBy(desc(krayaAssets.createdAt))
    .limit(50);
}

/** Booked future ranges for the availability calendar (slot-holding states only). */
export async function listBookedRanges(executor: DbExecutor, assetId: string): Promise<
  { startTime: Date; endTime: Date; state: KrayaBookingState }[]
> {
  return executor
    .select({
      startTime: rentalBookings.startTime,
      endTime: rentalBookings.endTime,
      state: rentalBookings.state,
    })
    .from(rentalBookings)
    .where(
      and(
        eq(rentalBookings.assetId, assetId),
        inArray(rentalBookings.state, ["payment_pending", "confirmed", "active"]),
      ),
    )
    .orderBy(asc(rentalBookings.startTime))
    .limit(200);
}

export async function listBookingsForRenter(executor: DbExecutor, renterId: string): Promise<RentalBookingRow[]> {
  return executor
    .select()
    .from(rentalBookings)
    .where(eq(rentalBookings.renterId, renterId))
    .orderBy(desc(rentalBookings.createdAt))
    .limit(50);
}

export async function listBookingsForOwner(executor: DbExecutor, ownerId: string): Promise<RentalBookingRow[]> {
  return executor
    .select({ booking: rentalBookings })
    .from(rentalBookings)
    .innerJoin(krayaAssets, eq(rentalBookings.assetId, krayaAssets.id))
    .where(eq(krayaAssets.ownerId, ownerId))
    .orderBy(desc(rentalBookings.createdAt))
    .limit(50)
    .then((rows) => rows.map((row) => row.booking));
}

export async function listStalePaymentPendingBookings(executor: DbExecutor, cutoff: Date, limit: number): Promise<
  { id: string }[]
> {
  return executor
    .select({ id: rentalBookings.id })
    .from(rentalBookings)
    .where(and(eq(rentalBookings.state, "payment_pending"), lt(rentalBookings.createdAt, cutoff)))
    .limit(limit);
}

/** Confirmed bookings whose start time has arrived (activation scan). */
export async function listBookingsToActivate(executor: DbExecutor, now: Date, limit: number): Promise<
  { id: string }[]
> {
  return executor
    .select({ id: rentalBookings.id })
    .from(rentalBookings)
    .where(and(eq(rentalBookings.state, "confirmed"), lt(rentalBookings.startTime, now)))
    .limit(limit);
}

/** Owner-blocked windows for an asset (availability calendar, owner side). */
export async function listBlockedWindows(executor: DbExecutor, assetId: string): Promise<
  { id: string; startTime: Date; endTime: Date; note: string }[]
> {
  return executor
    .select({
      id: krayaAvailability.id,
      startTime: krayaAvailability.startTime,
      endTime: krayaAvailability.endTime,
      note: krayaAvailability.note,
    })
    .from(krayaAvailability)
    .where(eq(krayaAvailability.assetId, assetId))
    .orderBy(asc(krayaAvailability.startTime))
    .limit(100);
}

export async function listPayoutsForOwner(executor: DbExecutor, ownerId: string): Promise<
  (typeof payouts.$inferSelect)[]
> {
  return executor
    .select()
    .from(payouts)
    .where(eq(payouts.ownerId, ownerId))
    .orderBy(desc(payouts.createdAt))
    .limit(50);
}

export async function listRecentPayouts(executor: DbExecutor, limit = 30): Promise<
  (typeof payouts.$inferSelect)[]
> {
  return executor.select().from(payouts).orderBy(desc(payouts.createdAt)).limit(limit);
}
