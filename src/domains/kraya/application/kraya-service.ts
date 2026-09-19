import { and, eq, gt, lt } from "drizzle-orm";

import { krayaAssets, krayaAvailability, rentalBookings, rentalContracts } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit, recordProviderAction } from "@/infrastructure/audit/writer";
import { enqueueOutboxEvents } from "@/infrastructure/outbox/writer";
import {
  createPaymentWithIntent,
  createRefundUnderLock,
  enqueuePaymentIntent,
  findPaymentByTarget,
  refundFullHeadroom,
} from "@/domains/payments/infrastructure/payment-repository";
import { createPayout } from "@/domains/payments/application/payout-lifecycle";
import type { Identity } from "@/lib/auth/types";
import { requireSelf } from "@/lib/auth/rbac";
import { BookingOverlapError, ConflictError, ResourceNotFoundError, ValidationError } from "@/lib/errors";
import { DomainEvent, DomainEvents } from "@/lib/events";
import { asCurrency, computeRentalQuote } from "@/lib/money";
import {
  assertKrayaBookingActionPermission,
  krayaBookingMachine,
  type KrayaBookingUserAction,
} from "@/domains/kraya/domain/machine";
import { krayaCancellationPolicy } from "@/domains/kraya/domain/policy";
import {
  getAssetById,
  getBookingById,
  listBookingsToActivate,
  listStalePaymentPendingBookings,
  lockBooking,
  transitionBookingState,
} from "@/domains/kraya/infrastructure/kraya-repository";
import type { JsonObject } from "@/types/json";

//
// Assets
//

export interface BlockedWindowInput {
  startTime: Date;
  endTime: Date;
  note?: string;
}

export interface CreateAssetInput {
  title: string;
  description: string;
  category: "equipment" | "vehicle" | "space" | "tool" | "other";
  dailyRateMinor: number;
  depositMinor: number;
  location: string;
  capacity?: number;
  images: string[];
  rules?: string;
  minDurationHours?: number;
  /** Owner-blocked windows created atomically with the asset (availability step of the wizard). */
  blockedWindows?: BlockedWindowInput[];
}

/**
 * Creates an asset in `draft` with its availability blocks. Publishing is a
 * separate, gated transition (the provider wizard's final step).
 */
export async function createAsset(
  tx: Tx,
  identity: Identity,
  input: CreateAssetInput,
): Promise<{ assetId: string }> {
  for (const window of input.blockedWindows ?? []) {
    if (window.endTime.getTime() <= window.startTime.getTime()) {
      throw new ValidationError("Blocked windows must end after they start");
    }
  }
  const [asset] = await tx
    .insert(krayaAssets)
    .values({
      ownerId: identity.userId,
      title: input.title,
      description: input.description,
      category: input.category,
      dailyRateMinor: input.dailyRateMinor,
      depositMinor: input.depositMinor,
      location: input.location,
      capacity: input.capacity ?? null,
      rules: input.rules ?? "",
      minDurationHours: input.minDurationHours ?? 1,
      images: input.images,
      status: "draft",
    })
    .returning({ id: krayaAssets.id });
  if (input.blockedWindows && input.blockedWindows.length > 0) {
    await tx.insert(krayaAvailability).values(
      input.blockedWindows.map((window) => ({
        assetId: asset.id,
        startTime: window.startTime,
        endTime: window.endTime,
        note: window.note ?? "",
        createdBy: identity.userId,
      })),
    );
  }
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "kraya.asset.created",
    entityType: "kraya_asset",
    entityId: asset.id,
    after: {
      title: input.title,
      dailyRateMinor: input.dailyRateMinor,
      depositMinor: input.depositMinor,
      state: "draft",
      blockedWindows: input.blockedWindows?.length ?? 0,
    },
  });
  return { assetId: asset.id };
}

export type AssetUpdateInput = Partial<CreateAssetInput>;

export async function updateAsset(
  tx: Tx,
  identity: Identity,
  assetId: string,
  input: AssetUpdateInput,
): Promise<{ assetId: string }> {
  const [asset] = await tx.select().from(krayaAssets).where(eq(krayaAssets.id, assetId)).limit(1);
  if (!asset) throw new ResourceNotFoundError("Asset", assetId);
  requireSelf(identity, asset.ownerId, "asset");
  const [updated] = await tx
    .update(krayaAssets)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.dailyRateMinor !== undefined ? { dailyRateMinor: input.dailyRateMinor } : {}),
      ...(input.depositMinor !== undefined ? { depositMinor: input.depositMinor } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.rules !== undefined ? { rules: input.rules } : {}),
      ...(input.minDurationHours !== undefined ? { minDurationHours: input.minDurationHours } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
      updatedAt: new Date(),
    })
    .where(eq(krayaAssets.id, assetId))
    .returning({ id: krayaAssets.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "kraya.asset.updated",
    entityType: "kraya_asset",
    entityId: assetId,
    before: { title: asset.title, dailyRateMinor: asset.dailyRateMinor, depositMinor: asset.depositMinor },
    after: input as JsonObject,
  });
  return { assetId: updated.id };
}

export type AssetTransitionAction = "publish" | "pause" | "archive" | "restore";

const ASSET_TRANSITIONS: Record<
  AssetTransitionAction,
  { from: ("draft" | "active" | "paused" | "archived")[]; to: "draft" | "active" | "paused" | "archived" }
> = {
  publish: { from: ["draft", "paused"], to: "active" },
  pause: { from: ["active"], to: "paused" },
  archive: { from: ["draft", "active", "paused"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};

/**
 * Asset lifecycle transition (the wizard's "Publish" and later changes).
 * Publishing is gated: at least one photo, a non-empty location, and positive
 * pricing — wizard steps enforced client-side are re-validated server-side.
 */
export async function transitionAsset(
  tx: Tx,
  identity: Identity,
  input: { assetId: string; action: AssetTransitionAction },
): Promise<{ assetId: string; status: string }> {
  const [asset] = await tx
    .select()
    .from(krayaAssets)
    .where(eq(krayaAssets.id, input.assetId))
    .for("update")
    .limit(1);
  if (!asset) throw new ResourceNotFoundError("Rental", input.assetId);
  requireSelf(identity, asset.ownerId, "asset");

  const transition = ASSET_TRANSITIONS[input.action];
  if (!transition.from.includes(asset.status)) {
    throw new ConflictError(`Cannot ${input.action} an asset that is ${asset.status}`);
  }
  if (input.action === "publish") {
    if (asset.images.length === 0) {
      throw new ValidationError("Add at least one photo before publishing");
    }
    if (asset.location.trim().length === 0) {
      throw new ValidationError("Add a location before publishing");
    }
    if (asset.dailyRateMinor <= 0) {
      throw new ValidationError("Set a daily rate before publishing");
    }
  }
  const [updated] = await tx
    .update(krayaAssets)
    .set({ status: transition.to, updatedAt: new Date() })
    .where(and(eq(krayaAssets.id, asset.id), eq(krayaAssets.status, asset.status)))
    .returning({ id: krayaAssets.id, status: krayaAssets.status });
  if (!updated) throw new ConflictError("The asset changed concurrently — retry");

  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: `kraya.asset.${input.action}`,
    entityType: "kraya_asset",
    entityId: asset.id,
    before: { status: asset.status },
    after: { status: transition.to },
  });
  if (identity.role === "seller") {
    await recordProviderAction(tx, {
      providerId: identity.userId,
      providerRole: "seller",
      action: `kraya.asset.${input.action}`,
      entityType: "kraya_asset",
      entityId: asset.id,
    });
  }
  if (input.action === "publish") {
    await enqueueOutboxEvents(tx, [
      {
        eventType: DomainEvents.assetPublished,
        aggregateType: "kraya_asset",
        aggregateId: asset.id,
        payload: { assetId: asset.id },
      },
    ]);
  }
  return { assetId: asset.id, status: transition.to };
}

/** Adds an owner-blocked window (availability step / calendar management). */
export async function addBlockedWindow(
  tx: Tx,
  identity: Identity,
  input: { assetId: string; startTime: Date; endTime: Date; note?: string },
): Promise<{ windowId: string }> {
  const asset = await getAssetById(tx, input.assetId);
  if (!asset) throw new ResourceNotFoundError("Rental", input.assetId);
  requireSelf(identity, asset.ownerId, "asset");
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    throw new ValidationError("Blocked windows must end after they start");
  }
  const [window] = await tx
    .insert(krayaAvailability)
    .values({
      assetId: asset.id,
      startTime: input.startTime,
      endTime: input.endTime,
      note: input.note ?? "",
      createdBy: identity.userId,
    })
    .returning({ id: krayaAvailability.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "kraya.availability.blocked",
    entityType: "kraya_asset",
    entityId: asset.id,
    after: {
      windowId: window.id,
      startTime: input.startTime.toISOString(),
      endTime: input.endTime.toISOString(),
    },
  });
  return { windowId: window.id };
}

/** Removes an owner-blocked window (operational data — bookable state, not financial history). */
export async function removeBlockedWindow(
  tx: Tx,
  identity: Identity,
  input: { assetId: string; windowId: string },
): Promise<{ removed: boolean }> {
  const asset = await getAssetById(tx, input.assetId);
  if (!asset) throw new ResourceNotFoundError("Rental", input.assetId);
  requireSelf(identity, asset.ownerId, "asset");
  const removed = await tx
    .delete(krayaAvailability)
    .where(and(eq(krayaAvailability.id, input.windowId), eq(krayaAvailability.assetId, asset.id)))
    .returning({ id: krayaAvailability.id });
  if (removed.length > 0) {
    await recordAudit(tx, {
      actorId: identity.userId,
      actorRole: identity.role,
      action: "kraya.availability.unblocked",
      entityType: "kraya_asset",
      entityId: asset.id,
      metadata: { windowId: input.windowId },
    });
  }
  return { removed: removed.length > 0 };
}

// Bookings
//

export interface CreateRentalBookingInput {
  assetId: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Creates a rental booking with server-authoritative pricing (§30/§49) and
 * transitions it to `payment_pending`, where the partial exclusion
 * constraint holds the asset slot (§6.3). Two payments are created:
 * the rental charge and the refundable deposit hold.
 */
export async function createRentalBooking(
  tx: Tx,
  identity: Identity,
  input: CreateRentalBookingInput,
): Promise<{ bookingId: string; rentalPaymentId: string; depositPaymentId: string }> {
  if (input.endTime.getTime() <= input.startTime.getTime()) {
    throw new ValidationError("The rental end must be after its start");
  }
  if (input.startTime.getTime() <= Date.now()) {
    throw new ValidationError("The rental start must be in the future");
  }
  const asset = await getAssetById(tx, input.assetId);
  if (!asset) throw new ResourceNotFoundError("Rental", input.assetId);
  if (asset.status !== "active") throw new ConflictError("This rental is not available for booking");

  const durationHours = (input.endTime.getTime() - input.startTime.getTime()) / 3_600_000;
  if (durationHours < asset.minDurationHours) {
    throw new ValidationError(
      `This rental requires a minimum of ${asset.minDurationHours} hour${asset.minDurationHours === 1 ? "" : "s"}`,
    );
  }

  // Owner-blocked windows (maintenance/personal use) reject new bookings.
  const blocked = await tx
    .select({ id: krayaAvailability.id })
    .from(krayaAvailability)
    .where(
      and(
        eq(krayaAvailability.assetId, input.assetId),
        lt(krayaAvailability.startTime, input.endTime),
        gt(krayaAvailability.endTime, input.startTime),
      ),
    )
    .limit(1);
  if (blocked.length > 0) {
    throw new BookingOverlapError("The owner has blocked these dates");
  }

  const quote = computeRentalQuote({
    dailyRateMinor: asset.dailyRateMinor,
    depositMinor: asset.depositMinor,
    start: input.startTime,
    end: input.endTime,
  });
  const currency = asCurrency(asset.currency);

  const [booking] = await tx
    .insert(rentalBookings)
    .values({
      assetId: asset.id,
      renterId: identity.userId,
      startTime: input.startTime,
      endTime: input.endTime,
      dailyRateSnapshotMinor: asset.dailyRateMinor,
      depositSnapshotMinor: asset.depositMinor,
      totalChargeMinor: quote.chargeMinor,
      currency,
      state: "requested",
    })
    .returning({ id: rentalBookings.id });

  krayaBookingMachine.transition("requested", "submit");
  const submitted = await transitionBookingState(tx, {
    bookingId: booking.id,
    from: ["requested"],
    to: "payment_pending",
  });
  if (!submitted) throw new ConflictError("The booking state changed concurrently — retry");

  const rentalPayment = await createPaymentWithIntent(tx, {
    category: "kraya_rental",
    payerId: identity.userId,
    amountMinor: quote.chargeMinor,
    currency,
    krayaBookingId: booking.id,
  });
  const depositPayment = await createPaymentWithIntent(tx, {
    category: "kraya_deposit",
    payerId: identity.userId,
    amountMinor: quote.depositMinor,
    currency,
    krayaBookingId: booking.id,
  });

  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "kraya.booking.created",
    entityType: "kraya_booking",
    entityId: booking.id,
    after: {
      state: "payment_pending",
      totalChargeMinor: quote.chargeMinor,
      depositMinor: quote.depositMinor,
      days: quote.days,
    },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.rentalBookingCreated,
      aggregateType: "kraya_booking",
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        notify: {
          userId: asset.ownerId,
          kind: "booking_confirmed",
          title: "New rental request",
          body: `"${asset.title}" was booked for ${quote.days} day${quote.days === 1 ? "" : "s"}.`,
          entityType: "kraya_booking",
          entityId: booking.id,
        },
      },
    },
  ]);
  return { bookingId: booking.id, rentalPaymentId: rentalPayment.id, depositPaymentId: depositPayment.id };
}

export interface TransitionRentalInput {
  identity: Identity;
  bookingId: string;
  action: KrayaBookingUserAction;
  reason?: string;
}

export async function transitionRentalBooking(
  tx: Tx,
  input: TransitionRentalInput,
): Promise<JsonObject> {
  const booking = await lockBooking(tx, input.bookingId);
  if (!booking) throw new ResourceNotFoundError("Rental booking", input.bookingId);
  const asset = await getAssetById(tx, booking.assetId);
  if (!asset) throw new ResourceNotFoundError("Rental", booking.assetId);
  assertKrayaBookingActionPermission(input.action, input.identity, booking, asset);

  if (input.action === "activate") {
    const oneHourBefore = booking.startTime.getTime() - 3_600_000;
    if (Date.now() < oneHourBefore) {
      throw new ConflictError("The rental can be activated at the earliest one hour before its start");
    }
  }

  const nextState = krayaBookingMachine.transition(booking.state, input.action);
  const updated = await transitionBookingState(tx, {
    bookingId: booking.id,
    from: [booking.state],
    to: nextState,
  });
  if (!updated) throw new ConflictError("The booking state changed concurrently — retry");

  if (input.action === "cancel") {
    const asRenter = input.identity.userId === booking.renterId;
    const decision = asRenter
      ? krayaCancellationPolicy(new Date(), booking.startTime, booking.totalChargeMinor)
      : { cancellable: true, refundMinor: booking.totalChargeMinor, basis: "full" as const, explanation: "" };
    if (!decision.cancellable) throw new ConflictError(decision.explanation);
    await unwindRentalFinancials(tx, booking, decision.refundMinor, input.identity.userId, input.reason ?? "Rental cancelled");
  }

  if (input.action === "complete") {
    // Return flow: deposit resolution (release the hold, or refund a captured deposit)…
    const deposit = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_deposit" });
    if (deposit) {
      if (deposit.state === "authorized" || deposit.state === "capture_pending") {
        await enqueuePaymentIntent(tx, deposit.id, "void");
      } else if (deposit.state === "captured") {
        await refundFullHeadroom(tx, {
          paymentId: deposit.id,
          reason: "Deposit released after return",
          requestedBy: input.identity.userId,
        });
      }
    }
    // …and payout creation: gross charge − platform fee, settled via the outbox.
    await createPayoutForBooking(tx, booking.id, asset.ownerId, booking.totalChargeMinor, asCurrency(booking.currency));
  }

  const eventType: DomainEvent =
    input.action === "activate"
      ? DomainEvents.rentalBookingStarted
      : input.action === "complete"
        ? DomainEvents.rentalBookingCompleted
        : DomainEvents.rentalBookingCancelled;
  const counterpartId = input.identity.userId === booking.renterId ? asset.ownerId : booking.renterId;

  await recordAudit(tx, {
    actorId: input.identity.userId,
    actorRole: input.identity.role,
    action: `kraya.booking.${input.action}`,
    entityType: "kraya_booking",
    entityId: booking.id,
    before: { state: booking.state },
    after: { state: nextState },
    metadata: { ...(input.reason ? { reason: input.reason } : {}) },
  });
  if (input.identity.userId === asset.ownerId) {
    await recordProviderAction(tx, {
      providerId: input.identity.userId,
      providerRole: "seller",
      action: `kraya.booking.${input.action}`,
      entityType: "kraya_booking",
      entityId: booking.id,
    });
  }
  await enqueueOutboxEvents(tx, [
    {
      eventType,
      aggregateType: "kraya_booking",
      aggregateId: booking.id,
      payload: {
        bookingId: booking.id,
        action: input.action,
        notify: {
          userId: counterpartId,
          kind:
            input.action === "cancel"
              ? ("booking_cancelled" as const)
              : input.action === "activate"
                ? ("rental_starting" as const)
                : ("refund_completed" as const),
          title:
            input.action === "activate"
              ? "Your rental has started"
              : input.action === "complete"
                ? "Your rental is complete"
                : "Your rental was cancelled",
          body: `Rental of "${asset.title}" — state: ${nextState}.`,
          entityType: "kraya_booking",
          entityId: booking.id,
        },
      },
    },
  ]);
  return { bookingId: booking.id, state: nextState };
}

async function unwindRentalFinancials(
  tx: Tx,
  booking: typeof rentalBookings.$inferSelect,
  rentalRefundMinor: number,
  actorId: string,
  reason: string,
): Promise<void> {
  const rental = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_rental" });
  const deposit = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_deposit" });
  if (rental) {
    if (rental.state === "captured" && rentalRefundMinor > 0) {
      await createRefundUnderLock(tx, { paymentId: rental.id, amountMinor: rentalRefundMinor, reason, requestedBy: actorId });
    } else if (rental.state === "authorized" || rental.state === "capture_pending") {
      await enqueuePaymentIntent(tx, rental.id, "void");
    }
  }
  if (deposit) {
    if (deposit.state === "captured") {
      await refundFullHeadroom(tx, { paymentId: deposit.id, reason: "Deposit released on cancellation", requestedBy: actorId });
    } else if (deposit.state === "authorized" || deposit.state === "capture_pending") {
      await enqueuePaymentIntent(tx, deposit.id, "void");
    }
  }
}

/** TTL job: payment_pending rentals older than the cutoff are cancelled (frees the held slot). */
export async function cancelStaleRentalBookings(db: DbExecutor, ttlMinutes = 15): Promise<{ cancelled: number }> {
  const cutoff = new Date(Date.now() - ttlMinutes * 60_000);
  const stale = await listStalePaymentPendingBookings(db, cutoff, 50);
  let cancelled = 0;
  for (const ref of stale) {
    await db.transaction(async (tx) => {
      krayaBookingMachine.transition("payment_pending", "timeout");
      const updated = await transitionBookingState(tx, {
        bookingId: ref.id,
        from: ["payment_pending"],
        to: "cancelled",
      });
      if (!updated) return;
      await unwindRentalFinancials(tx, updated, 0, updated.renterId, "Payment not completed in time");
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "kraya.booking.timeout",
        entityType: "kraya_booking",
        entityId: ref.id,
        before: { state: "payment_pending" },
        after: { state: "cancelled" },
        metadata: { reason: "payment_not_completed_in_time" },
      });
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.rentalBookingCancelled,
          aggregateType: "kraya_booking",
          aggregateId: ref.id,
          payload: {
            bookingId: ref.id,
            action: "timeout",
            notify: {
              userId: updated.renterId,
              kind: "payment_attention",
              title: "Rental expired",
              body: "Payment was not completed in time, so the dates were released.",
              entityType: "kraya_booking",
              entityId: ref.id,
            },
          },
        },
      ]);
      cancelled += 1;
    });
  }
  return { cancelled };
}

/** Activation job: confirmed rentals whose start time has arrived become active. */
export async function activateDueRentals(db: DbExecutor): Promise<{ activated: number }> {
  const now = new Date();
  const due = await listBookingsToActivate(db, now, 50);
  let activated = 0;
  for (const ref of due) {
    await db.transaction(async (tx) => {
      krayaBookingMachine.transition("confirmed", "activate");
      const updated = await transitionBookingState(tx, { bookingId: ref.id, from: ["confirmed"], to: "active" });
      if (!updated) return;
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "kraya.booking.activate",
        entityType: "kraya_booking",
        entityId: ref.id,
        before: { state: "confirmed" },
        after: { state: "active" },
      });
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.rentalBookingStarted,
          aggregateType: "kraya_booking",
          aggregateId: ref.id,
          payload: { bookingId: ref.id, action: "activate" },
        },
      ]);
      activated += 1;
    });
  }
  return { activated };
}

//
// Payment event projection + confirmation
//

export type KrayaPaymentEventKind = "authorized" | "captured" | "failed" | "voided" | "refunded";

export async function applyKrayaPaymentEvent(
  tx: Tx,
  payment: { id: string; krayaBookingId: string | null },
  kind: KrayaPaymentEventKind,
): Promise<void> {
  if (!payment.krayaBookingId) return;
  if (kind === "captured" || kind === "authorized") {
    // Either leg completing can make the booking confirmable.
    await tryConfirmRentalBooking(tx, payment.krayaBookingId);
    return;
  }
  if (kind === "failed" || kind === "voided") {
    const booking = await getBookingById(tx, payment.krayaBookingId);
    if (!booking || booking.state !== "payment_pending") return;
    krayaBookingMachine.transition("payment_pending", "timeout");
    const updated = await transitionBookingState(tx, {
      bookingId: booking.id,
      from: ["payment_pending"],
      to: "cancelled",
    });
    if (!updated) return;
    // Release the other leg if it was holding funds.
    const rental = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_rental" });
    const deposit = await findPaymentByTarget(tx, { krayaBookingId: booking.id, category: "kraya_deposit" });
    for (const other of [rental, deposit]) {
      if (other && other.id !== payment.id && (other.state === "authorized" || other.state === "capture_pending")) {
        await enqueuePaymentIntent(tx, other.id, "void");
      }
    }
    await recordAudit(tx, {
      actorId: null,
      actorRole: "system",
      action: "kraya.booking.payment_unwound",
      entityType: "kraya_booking",
      entityId: booking.id,
      before: { state: "payment_pending" },
      after: { state: "cancelled" },
      metadata: { paymentEvent: kind, paymentId: payment.id },
    });
  }
}

/**
 * Confirms a rental when the commercial conditions hold: rental charge
 * captured AND deposit authorized (or captured). Confirmation writes the
 * immutable contract snapshot in the SAME transaction (§33).
 */
export async function tryConfirmRentalBooking(tx: Tx, bookingId: string): Promise<void> {
  const booking = await getBookingById(tx, bookingId);
  if (!booking || booking.state !== "payment_pending") return;
  const rental = await findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_rental" });
  const deposit = await findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_deposit" });
  if (!rental || !deposit) return;
  if (rental.state !== "captured" || !(deposit.state === "authorized" || deposit.state === "captured")) {
    return;
  }

  krayaBookingMachine.transition("payment_pending", "confirm");
  const updated = await transitionBookingState(tx, {
    bookingId,
    from: ["payment_pending"],
    to: "confirmed",
  });
  if (!updated) return;

  const asset = await getAssetById(tx, booking.assetId);
  await tx.insert(rentalContracts).values({
    bookingId,
    version: 1,
    terms: {
      cancellation: "Free cancellation up to 24h before start (full rental refund); 50% within 24h; deposit always released.",
      deposit: "Deposit is held as an authorization and released after return inspection.",
      interval: "Half-open [start, end) — adjacent bookings are permitted.",
    },
    assetSnapshot: {
      title: asset?.title ?? "",
      location: asset?.location ?? "",
      category: asset?.category ?? "other",
    },
    priceSnapshotMinor: booking.totalChargeMinor,
    depositSnapshotMinor: booking.depositSnapshotMinor,
    cancellationPolicy: "Full refund ≥24h before start; 50% within 24h; deposit released on return.",
    acceptedAt: new Date(),
  });

  await recordAudit(tx, {
    actorId: null,
    actorRole: "system",
    action: "kraya.booking.confirm",
    entityType: "kraya_booking",
    entityId: bookingId,
    before: { state: "payment_pending" },
    after: { state: "confirmed" },
    metadata: { rentalPaymentId: rental.id, depositPaymentId: deposit.id },
  });
  await enqueueOutboxEvents(tx, [
    {
      eventType: DomainEvents.rentalBookingConfirmed,
      aggregateType: "kraya_booking",
      aggregateId: bookingId,
      payload: {
        bookingId,
        notify: {
          userId: booking.renterId,
          kind: "booking_confirmed",
          title: "Rental confirmed",
          body: "Your rental dates are confirmed. The deposit is held and released after return.",
          entityType: "kraya_booking",
          entityId: bookingId,
        },
      },
    },
    {
      eventType: DomainEvents.contractCreated,
      aggregateType: "rental_contract",
      aggregateId: bookingId,
      payload: { bookingId },
    },
  ]);
}

/** Governance helpers for the dispute engine. */
export async function loadRentalForGovernance(tx: Tx, bookingId: string) {
  const booking = await lockBooking(tx, bookingId);
  if (!booking) throw new ResourceNotFoundError("Rental booking", bookingId);
  return booking;
}

export async function findRentalPayment(tx: Tx, bookingId: string) {
  return findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_rental" });
}

export async function findDepositPayment(tx: Tx, bookingId: string) {
  return findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_deposit" });
}

export async function refundRentalFully(tx: Tx, bookingId: string, actorId: string, reason: string): Promise<void> {
  const rental = await findPaymentByTarget(tx, { krayaBookingId: bookingId, category: "kraya_rental" });
  if (!rental) return;
  await refundFullHeadroom(tx, { paymentId: rental.id, reason, requestedBy: actorId });
}


/**
 * Creates the provider payout row for a completed rental (pending) and
 * enqueues its settlement event — same transaction as the completion.
 */
export async function createPayoutForBooking(
  tx: Tx,
  bookingId: string,
  ownerId: string,
  grossMinor: number,
  currency: ReturnType<typeof asCurrency>,
): Promise<{ payoutId: string } | null> {
  return createPayout(tx, {
    entityType: "kraya_booking",
    entityId: bookingId,
    ownerId,
    grossMinor,
    currency,
  });
}
