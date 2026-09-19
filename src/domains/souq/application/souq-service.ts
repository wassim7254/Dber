import { and, eq, gt, inArray, sql } from "drizzle-orm";

import { groupBuyCircles, groupBuyParticipants, souqProducts } from "@/db/schema";
import { participantPaymentStatusEnum } from "@/db/schema/enums";
import type { Tx, DbExecutor } from "@/db/tx";
import { recordAudit, recordProviderAction } from "@/infrastructure/audit/writer";
import { enqueueOutboxEvents, type OutboxEventInput } from "@/infrastructure/outbox/writer";
import {
  createPaymentWithIntent,
  createRefundUnderLock,
  enqueuePaymentIntent,
} from "@/domains/payments/infrastructure/payment-repository";
import type { Identity } from "@/lib/auth/types";
import { createPayout } from "@/domains/payments/application/payout-lifecycle";
import { requireSelf } from "@/lib/auth/rbac";
import {
  ConflictError,
  InsufficientCapacityError,
  InternalError,
  ResourceNotFoundError,
  ValidationError,
} from "@/lib/errors";
import { DomainEvent, DomainEvents } from "@/lib/events";
import { asCurrency } from "@/lib/money";
import {
  assertCircleActionPermission,
  circleMachine,
  type CircleState,
  type CircleUserAction,
} from "@/domains/souq/domain/machine";
import {
  listCirclePaymentsInStates,
  listExpiredOpenCircles,
  lockCircle,
  transitionCircleState,
} from "@/domains/souq/infrastructure/souq-repository";
import type { JsonObject } from "@/types/json";

//
// Products
//

export interface CreateProductInput {
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  sku?: string;
  basePriceMinor: number;
  unit?: string;
  maxAvailableQuantity: number;
  deliveryMethod: "delivery" | "pickup" | "both";
  deliveryFeeMinor?: number;
  fulfillmentHours?: number;
  location?: string;
  images: string[];
}

/** Products start as DRAFT; publishing is a separate gated transition (§6). */
export async function createProduct(
  tx: Tx,
  identity: Identity,
  input: CreateProductInput,
): Promise<{ productId: string }> {
  const [product] = await tx
    .insert(souqProducts)
    .values({
      sellerId: identity.userId,
      title: input.title,
      description: input.description,
      category: input.category,
      subcategory: input.subcategory ?? "",
      sku: input.sku ?? null,
      basePriceMinor: input.basePriceMinor,
      unit: input.unit ?? "unit",
      maxAvailableQuantity: input.maxAvailableQuantity,
      deliveryMethod: input.deliveryMethod,
      deliveryFeeMinor: input.deliveryFeeMinor ?? 0,
      fulfillmentHours: input.fulfillmentHours ?? 48,
      location: input.location ?? "",
      images: input.images,
      status: "draft",
    })
    .returning({ id: souqProducts.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "souq.product.created",
    entityType: "souq_product",
    entityId: product.id,
    after: { title: input.title, basePriceMinor: input.basePriceMinor, state: "draft" },
  });
  return { productId: product.id };
}

export type ProductUpdateInput = Partial<CreateProductInput>;

export async function updateProduct(
  tx: Tx,
  identity: Identity,
  productId: string,
  input: ProductUpdateInput,
): Promise<{ productId: string }> {
  const [product] = await tx.select().from(souqProducts).where(eq(souqProducts.id, productId)).limit(1);
  if (!product) throw new ResourceNotFoundError("Product", productId);
  requireSelf(identity, product.sellerId, "product");
  if (input.title !== undefined && input.title.length < 3) {
    throw new ValidationError("The product title is too short");
  }
  const [updated] = await tx
    .update(souqProducts)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.subcategory !== undefined ? { subcategory: input.subcategory } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.basePriceMinor !== undefined ? { basePriceMinor: input.basePriceMinor } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.maxAvailableQuantity !== undefined ? { maxAvailableQuantity: input.maxAvailableQuantity } : {}),
      ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
      ...(input.deliveryFeeMinor !== undefined ? { deliveryFeeMinor: input.deliveryFeeMinor } : {}),
      ...(input.fulfillmentHours !== undefined ? { fulfillmentHours: input.fulfillmentHours } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
      updatedAt: new Date(),
    })
    .where(eq(souqProducts.id, productId))
    .returning({ id: souqProducts.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "souq.product.updated",
    entityType: "souq_product",
    entityId: productId,
    before: { title: product.title, basePriceMinor: product.basePriceMinor, maxAvailableQuantity: product.maxAvailableQuantity },
    after: input as JsonObject,
  });
  return { productId: updated.id };
}

export type ProductLifecycleAction = "publish" | "pause" | "archive" | "restore";

const PRODUCT_TRANSITIONS: Record<
  ProductLifecycleAction,
  { from: readonly ("draft" | "active" | "paused" | "archived")[]; to: "draft" | "active" | "paused" | "archived" }
> = {
  publish: { from: ["draft", "paused"], to: "active" },
  pause: { from: ["active"], to: "paused" },
  archive: { from: ["draft", "active", "paused"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};

/**
 * Publishing gate (§6): a listing cannot go live with missing media, an
 * invalid price, zero available quantity, or no location when pickup is
 * offered. Whatever the wizard validated client-side is re-validated here.
 */
export async function transitionProduct(
  tx: Tx,
  identity: Identity,
  productId: string,
  action: ProductLifecycleAction,
): Promise<{ productId: string; state: string }> {
  const [product] = await tx.select().from(souqProducts).where(eq(souqProducts.id, productId)).limit(1);
  if (!product) throw new ResourceNotFoundError("Product", productId);
  requireSelf(identity, product.sellerId, "product");

  const transition = PRODUCT_TRANSITIONS[action];
  if (!transition.from.includes(product.status)) {
    throw new ConflictError(`A ${product.status} product cannot be ${action === "publish" ? "published" : action + "d"}`);
  }
  if (action === "publish") {
    if (product.images.length === 0) {
      throw new ValidationError("Add at least one photo before publishing");
    }
    if (product.basePriceMinor <= 0) {
      throw new ValidationError("Set a price greater than zero before publishing");
    }
    if (product.maxAvailableQuantity <= 0) {
      throw new ValidationError("Set the available quantity before publishing");
    }
    if (product.deliveryMethod !== "delivery" && product.location.trim().length === 0) {
      throw new ValidationError("Add a pickup location before publishing");
    }
  }
  const [updated] = await tx
    .update(souqProducts)
    .set({ status: transition.to, updatedAt: new Date() })
    .where(and(eq(souqProducts.id, productId), eq(souqProducts.status, product.status)))
    .returning({ id: souqProducts.id });
  if (!updated) throw new ConflictError("The product was changed concurrently — retry");

  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: `souq.product.${action}`,
    entityType: "souq_product",
    entityId: productId,
    before: { status: product.status },
    after: { status: transition.to },
  });
  if (identity.role === "seller") {
    await recordProviderAction(tx, {
      providerId: identity.userId,
      providerRole: "seller",
      action: `souq.product.${action}`,
      entityType: "souq_product",
      entityId: productId,
      metadata: { status: transition.to },
    });
  }
  return { productId, state: transition.to };
}

//
// Circles
//

export interface CreateCircleInput {
  productId: string;
  targetQuantity: number;
  minimumParticipants: number;
  groupPriceMinor: number;
  listPriceMinor: number;
  deadlineAt: Date;
}

export async function createCircle(
  tx: Tx,
  identity: Identity,
  input: CreateCircleInput,
): Promise<{ circleId: string }> {
  const [productRow] = await tx
    .select()
    .from(souqProducts)
    .where(eq(souqProducts.id, input.productId))
    .limit(1);
  if (!productRow) throw new ResourceNotFoundError("Product", input.productId);
  requireSelf(identity, productRow.sellerId, "product");
  if (input.deadlineAt.getTime() <= Date.now()) {
    throw new ValidationError("The circle deadline must be in the future");
  }
  const [circle] = await tx
    .insert(groupBuyCircles)
    .values({
      productId: input.productId,
      sellerId: productRow.sellerId,
      targetQuantity: input.targetQuantity,
      minimumParticipants: input.minimumParticipants,
      groupPriceMinor: input.groupPriceMinor,
      listPriceMinor: input.listPriceMinor,
      currency: productRow.currency,
      deadlineAt: input.deadlineAt,
      state: "draft",
    })
    .returning({ id: groupBuyCircles.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "souq.circle.created",
    entityType: "souq_circle",
    entityId: circle.id,
    after: {
      state: "draft",
      targetQuantity: input.targetQuantity,
      deadlineAt: input.deadlineAt.toISOString(),
    },
  });
  return { circleId: circle.id };
}

/**
 * Joins a circle. The database enforces every invariant:
 *  1. UNIQUE(circle_id, user_id) — one participation per user.
 *  2. A single atomic conditional UPDATE enforces
 *     state=open ∧ deadline unexpired ∧ current_quantity + q ≤ target_quantity.
 *  3. CHECK current_quantity <= target_quantity is the final backstop.
 * Reaching the target locks the circle in the same transaction and emits the
 * lock event (capture of authorizations is driven by the outbox).
 */
export async function joinCircle(
  tx: Tx,
  input: { identity: Identity; circleId: string; quantity: number },
): Promise<JsonObject> {
  const now = new Date();

  const inserted = await tx
    .insert(groupBuyParticipants)
    .values({
      circleId: input.circleId,
      userId: input.identity.userId,
      quantity: input.quantity,
      paymentStatus: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: groupBuyParticipants.id });
  if (inserted.length === 0) {
    throw new ConflictError("You have already joined this group");
  }
  const participantId = inserted[0].id;

  const updated = await tx
    .update(groupBuyCircles)
    .set({
      currentQuantity: sql`${groupBuyCircles.currentQuantity} + ${input.quantity}`,
      updatedAt: now,
    })
    .where(
      and(
        eq(groupBuyCircles.id, input.circleId),
        eq(groupBuyCircles.state, "open"),
        gt(groupBuyCircles.deadlineAt, now),
        sql`${groupBuyCircles.currentQuantity} + ${input.quantity} <= ${groupBuyCircles.targetQuantity}`,
      ),
    )
    .returning({
      id: groupBuyCircles.id,
      currentQuantity: groupBuyCircles.currentQuantity,
      targetQuantity: groupBuyCircles.targetQuantity,
      groupPriceMinor: groupBuyCircles.groupPriceMinor,
      currency: groupBuyCircles.currency,
    });

  if (updated.length === 0) {
    const [circle] = await tx
      .select({
        state: groupBuyCircles.state,
        deadlineAt: groupBuyCircles.deadlineAt,
        currentQuantity: groupBuyCircles.currentQuantity,
        targetQuantity: groupBuyCircles.targetQuantity,
      })
      .from(groupBuyCircles)
      .where(eq(groupBuyCircles.id, input.circleId))
      .limit(1);
    if (!circle) throw new ResourceNotFoundError("Group", input.circleId);
    if (circle.state !== "open") {
      throw new ConflictError(
        `This group is ${circle.state.replace(/_/g, " ")} and no longer accepts joins`,
      );
    }
    if (circle.deadlineAt.getTime() <= now.getTime()) {
      throw new ConflictError("This group has passed its deadline");
    }
    throw new InsufficientCapacityError(circle.targetQuantity - circle.currentQuantity);
  }

  const circle = updated[0];
  const currency = asCurrency(circle.currency);
  const payment = await createPaymentWithIntent(tx, {
    category: "souq_join",
    payerId: input.identity.userId,
    amountMinor: circle.groupPriceMinor * input.quantity,
    currency,
    souqParticipantId: participantId,
  });

  const events: OutboxEventInput[] = [
    {
      eventType: DomainEvents.circleJoined,
      aggregateType: "souq_circle",
      aggregateId: input.circleId,
      payload: {
        circleId: input.circleId,
        userId: input.identity.userId,
        quantity: input.quantity,
        currentQuantity: circle.currentQuantity,
        paymentId: payment.id,
        notify: {
          userId: input.identity.userId,
          kind: "group_progress",
          title: "Join confirmed",
          body: `You joined the group — ${circle.currentQuantity} of ${circle.targetQuantity} spots filled.`,
          entityType: "souq_circle",
          entityId: input.circleId,
        },
      },
    },
  ];

  let locked = false;
  if (circle.currentQuantity === circle.targetQuantity) {
    // Machine validation first: "open --reach_target--> locked" must be legal.
    circleMachine.transition("open", "reach_target");
    const lockResult = await transitionCircleState(tx, {
      circleId: input.circleId,
      from: "open",
      to: "locked",
    });
    if (!lockResult) throw new InternalError("Circle lock lost after capacity update");
    locked = true;
    events.push({
      eventType: DomainEvents.circleLocked,
      aggregateType: "souq_circle",
      aggregateId: input.circleId,
      payload: {
        circleId: input.circleId,
        currentQuantity: circle.currentQuantity,
        notify: {
          userId: input.identity.userId,
          kind: "group_locked",
          title: "Group locked",
          body: "The group reached its target. Your payment will be captured and the order confirmed.",
          entityType: "souq_circle",
          entityId: input.circleId,
        },
      },
    });
  }

  await recordAudit(tx, {
    actorId: input.identity.userId,
    actorRole: input.identity.role,
    action: "souq.circle.joined",
    entityType: "souq_circle",
    entityId: input.circleId,
    before: { currentQuantity: circle.currentQuantity - input.quantity, state: "open" },
    after: { currentQuantity: circle.currentQuantity, state: locked ? "locked" : "open" },
    metadata: { participantId, paymentId: payment.id, quantity: input.quantity },
  });
  await enqueueOutboxEvents(tx, events);

  return {
    participantId,
    paymentId: payment.id,
    currentQuantity: circle.currentQuantity,
    targetQuantity: circle.targetQuantity,
    state: locked ? "locked" : "open",
  };
}

export interface TransitionCircleInput {
  identity: Identity;
  circleId: string;
  action: CircleUserAction;
  reason?: string;
}

/** Seller/ops lifecycle transition. Validates state machine + permissions, then applies side effects. */
export async function transitionCircle(tx: Tx, input: TransitionCircleInput): Promise<JsonObject> {
  const circle = await lockCircle(tx, input.circleId);
  if (!circle) throw new ResourceNotFoundError("Circle", input.circleId);
  assertCircleActionPermission(input.action, input.identity, circle);

  if (input.action === "fail_close" && !input.reason) {
    throw new ValidationError("A reason is required to fail-close a circle");
  }

  const nextState = circleMachine.transition(circle.state, input.action);
  const updated = await transitionCircleState(tx, {
    circleId: circle.id,
    from: circle.state,
    to: nextState,
  });
  if (!updated) {
    throw new ConflictError("The circle state changed concurrently — retry");
  }

  const metadata: JsonObject = {
    action: input.action,
    ...(input.reason ? { reason: input.reason } : {}),
  };

  // Seller earnings are settled when the circle completes (§22/§23).
  if (input.action === "complete") {
    const captured = await listCirclePaymentsInStates(tx, circle.id, ["captured"]);
    const grossMinor = captured.reduce((sum, payment) => sum + payment.amountMinor, 0);
    if (grossMinor > 0) {
      await createPayout(tx, {
        entityType: "souq_circle",
        entityId: circle.id,
        ownerId: circle.sellerId,
        grossMinor,
        currency: asCurrency(circle.currency),
      });
      metadata.payoutGrossMinor = grossMinor;
    }
  }

  // Financial unwind for terminal failure paths.
  if (input.action === "cancel" || input.action === "fail_close") {
    const authorized = await listCirclePaymentsInStates(tx, circle.id, ["authorized"]);
    for (const payment of authorized) {
      await enqueuePaymentIntent(tx, payment.id, "void");
    }
    metadata.releasedAuthorizations = authorized.length;
    if (input.action === "fail_close") {
      const captured = await listCirclePaymentsInStates(tx, circle.id, ["captured"]);
      for (const payment of captured) {
        await createRefundUnderLock(tx, {
          paymentId: payment.id,
          amountMinor: payment.amountMinor,
          reason: input.reason ?? "Group could not be supplied",
          requestedBy: input.identity.userId,
        });
      }
      metadata.refundedCaptures = captured.length;
    }
  }

  const events: OutboxEventInput[] = [];
  if (input.action === "publish") {
    events.push({
      eventType: DomainEvents.circleOpened,
      aggregateType: "souq_circle",
      aggregateId: circle.id,
      payload: { circleId: circle.id },
    });
  } else {
    const eventType: DomainEvent =
      input.action === "cancel"
        ? DomainEvents.circleCancelled
        : input.action === "fail_close"
          ? DomainEvents.circleFailedClosed
          : input.action === "mark_delivered"
            ? DomainEvents.circleDelivered
            : input.action === "complete"
              ? DomainEvents.circleCompleted
              : // confirm_supplier / begin_fulfillment: audit trail only, no dedicated event
                DomainEvents.circleOpened;
    const notify: JsonObject | undefined =
      input.action === "fail_close" || input.action === "cancel" || input.action === "complete"
        ? {
            userId: input.identity.userId,
            kind:
              input.action === "complete"
                ? ("group_progress" as const)
                : ("payment_attention" as const),
            title:
              input.action === "fail_close"
                ? "Group could not be fulfilled"
                : input.action === "cancel"
                  ? "Group cancelled"
                  : "Group completed",
            body:
              input.action === "fail_close"
                ? "The supplier could not fulfill this group. Payments will be released."
                : input.action === "cancel"
                  ? "The seller cancelled this group before it locked."
                  : "This group order is complete.",
            entityType: "souq_circle",
            entityId: circle.id,
          }
        : undefined;
    events.push({
      eventType,
      aggregateType: "souq_circle",
      aggregateId: circle.id,
      payload: { circleId: circle.id, action: input.action, ...(notify ? { notify } : {}) },
    });
  }

  await recordAudit(tx, {
    actorId: input.identity.userId,
    actorRole: input.identity.role,
    action: `souq.circle.${input.action}`,
    entityType: "souq_circle",
    entityId: circle.id,
    before: { state: circle.state },
    after: { state: nextState },
    metadata,
  });
  if (input.identity.role === "seller") {
    await recordProviderAction(tx, {
      providerId: input.identity.userId,
      providerRole: "seller",
      action: `souq.circle.${input.action}`,
      entityType: "souq_circle",
      entityId: circle.id,
      metadata,
    });
  }
  await enqueueOutboxEvents(tx, events);

  return { circleId: circle.id, state: nextState };
}

/** Expiry job: open circles past their deadline become expired; authorizations are released. */
export async function expireOpenCircles(db: DbExecutor): Promise<{ expired: number }> {
  const now = new Date();
  const due = await listExpiredOpenCircles(db, now, 50);
  let expired = 0;
  for (const circleRef of due) {
    await db.transaction(async (tx) => {
      const circle = await lockCircle(tx, circleRef.id);
      if (!circle || circle.state !== "open" || circle.deadlineAt.getTime() > now.getTime()) return;
      circleMachine.transition(circle.state, "expire");
      const updated = await transitionCircleState(tx, { circleId: circle.id, from: "open", to: "expired" });
      if (!updated) return;
      const unsettled = await listCirclePaymentsInStates(tx, circle.id, ["authorized"]);
      for (const payment of unsettled) {
        await enqueuePaymentIntent(tx, payment.id, "void");
      }
      await recordAudit(tx, {
        actorId: null,
        actorRole: "system",
        action: "souq.circle.expire",
        entityType: "souq_circle",
        entityId: circle.id,
        before: { state: "open" },
        after: { state: "expired" },
        metadata: { releasedAuthorizations: unsettled.length },
      });
      await enqueueOutboxEvents(tx, [
        {
          eventType: DomainEvents.circleExpired,
          aggregateType: "souq_circle",
          aggregateId: circle.id,
          payload: { circleId: circle.id, releasedAuthorizations: unsettled.length },
        },
      ]);
      expired += 1;
    });
  }
  return { expired };
}

export type SouqPaymentEventKind = "authorized" | "captured" | "failed" | "voided" | "refunded";

const PARTICIPANT_TARGET_BY_EVENT: Record<
  SouqPaymentEventKind,
  {
    status: (typeof participantPaymentStatusEnum.enumValues)[number];
    from: readonly (typeof participantPaymentStatusEnum.enumValues)[number][];
  }
> = {
  authorized: { status: "authorized", from: ["pending"] },
  // The lock can race ahead of the authorized projection — accept both.
  captured: { status: "captured", from: ["authorized", "pending"] },
  failed: { status: "failed", from: ["pending"] },
  voided: { status: "voided", from: ["authorized"] },
  refunded: { status: "refunded", from: ["authorized", "captured"] },
};

/**
 * Projects payment lifecycle events onto the participant's payment status,
 * and auto-requests capture when the circle is already locked (the final
 * joiner's authorization can complete after the lock).
 */
export async function applySouqPaymentEvent(
  tx: Tx,
  payment: { id: string; souqParticipantId: string | null },
  kind: SouqPaymentEventKind,
): Promise<void> {
  if (!payment.souqParticipantId) return;
  const target = PARTICIPANT_TARGET_BY_EVENT[kind];

  const [updated] = await tx
    .update(groupBuyParticipants)
    .set({ paymentStatus: target.status, updatedAt: new Date() })
    .where(
      and(
        eq(groupBuyParticipants.id, payment.souqParticipantId),
        inArray(groupBuyParticipants.paymentStatus, [...target.from]),
      ),
    )
    .returning({ id: groupBuyParticipants.id, circleId: groupBuyParticipants.circleId });
  if (!updated) return;

  if (kind === "authorized") {
    const [circle] = await tx
      .select({ state: groupBuyCircles.state })
      .from(groupBuyCircles)
      .where(eq(groupBuyCircles.id, updated.circleId))
      .limit(1);
    if (circle && ["locked", "supplier_confirmed", "fulfilling", "delivered"].includes(circle.state)) {
      await enqueuePaymentIntent(tx, payment.id, "capture");
    }
  }
}

export type CircleStateInfo = CircleState;
