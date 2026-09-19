import { notifications, type AuditEntityType } from "@/db/schema";
import { consoleNotificationAdapter } from "@/infrastructure/notifications/adapter";
import type { NotificationKind, NotificationDelivery } from "@/infrastructure/notifications/adapter";
import { logger } from "@/infrastructure/logging/logger";
import type { OutboxHandler } from "@/infrastructure/outbox/dispatcher";
import { DomainEvents } from "@/lib/events";
import type { Json } from "@/types/json";
import {
  handleCaptureRequested,
  handlePaymentRequested,
  handleRefundRequested,
  handleVoidRequested,
} from "@/domains/payments/application/payment-lifecycle";
import { handlePayoutRequested } from "@/domains/payments/application/payout-lifecycle";

const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  "group_progress",
  "group_locked",
  "booking_confirmed",
  "booking_cancelled",
  "rental_starting",
  "payment_attention",
  "refund_completed",
  "dispute_update",
];

const AUDIT_ENTITY_TYPES: readonly string[] = [
  "souq_product",
  "souq_circle",
  "souq_participant",
  "khidma_request",
  "khidma_quote",
  "khidma_booking",
  "khidma_service",
  "kraya_asset",
  "kraya_booking",
  "rental_contract",
  "payment",
  "refund",
  "cancellation_request",
  "dispute",
  "user",
];

interface NotifyPayload {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: AuditEntityType;
  entityId?: string;
}

function isNotifyPayload(value: unknown): value is NotifyPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.userId !== "string" || typeof record.title !== "string" || typeof record.body !== "string") {
    return false;
  }
  if (typeof record.kind !== "string" || !NOTIFICATION_KINDS.includes(record.kind as NotificationKind)) {
    return false;
  }
  if (record.entityType !== undefined && (typeof record.entityType !== "string" || !AUDIT_ENTITY_TYPES.includes(record.entityType))) {
    return false;
  }
  return record.entityId === undefined || typeof record.entityId === "string";
}

/**
 * Persists the in-app notification (a plain DB write, same process) and hands
 * off to the delivery adapter. This runs OUTSIDE any business transaction —
 * it is the consumer side of the outbox.
 */
export const notificationHandler: OutboxHandler = async (db, event) => {
  const notify = (event.payload as { notify?: unknown }).notify;
  if (!isNotifyPayload(notify)) return;
  const delivery: NotificationDelivery = {
    userId: notify.userId,
    kind: notify.kind,
    title: notify.title,
    body: notify.body,
    ...(notify.entityType ? { entityType: notify.entityType } : {}),
    ...(notify.entityId ? { entityId: notify.entityId } : {}),
  };
  await db.transaction(async (tx) => {
    await tx.insert(notifications).values({
      userId: delivery.userId,
      kind: delivery.kind,
      title: delivery.title,
      body: delivery.body,
      entityType: delivery.entityType ?? null,
      entityId: delivery.entityId ?? null,
    });
  });
  await consoleNotificationAdapter.deliver(delivery);
};

function payloadString(payload: Json, key: string): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/** Payment lifecycle events drive the mock-gateway flows. */
const PAYMENT_HANDLERS: Record<string, OutboxHandler> = {
  [DomainEvents.paymentRequested]: (db, event) => {
    const paymentId = payloadString(event.payload, "paymentId");
    return paymentId
      ? handlePaymentRequested(db, { paymentId })
      : Promise.reject(new Error(`payment.requested event ${event.id} missing paymentId`));
  },
  [DomainEvents.paymentCaptureRequested]: (db, event) => {
    const paymentId = payloadString(event.payload, "paymentId");
    return paymentId
      ? handleCaptureRequested(db, { paymentId })
      : Promise.reject(new Error(`capture event ${event.id} missing paymentId`));
  },
  [DomainEvents.paymentVoidRequested]: (db, event) => {
    const paymentId = payloadString(event.payload, "paymentId");
    return paymentId
      ? handleVoidRequested(db, { paymentId })
      : Promise.reject(new Error(`void event ${event.id} missing paymentId`));
  },
  [DomainEvents.refundRequested]: (db, event) => {
    const refundId = payloadString(event.payload, "refundId");
    return refundId
      ? handleRefundRequested(db, { refundId })
      : Promise.reject(new Error(`refund event ${event.id} missing refundId`));
  },
  [DomainEvents.payoutRequested]: (db, event) => {
    const payoutId = payloadString(event.payload, "payoutId");
    return payoutId
      ? handlePayoutRequested(db, { payoutId })
      : Promise.reject(new Error(`payout event ${event.id} missing payoutId`));
  },
};

export function resolveEventHandler(eventType: string): OutboxHandler | null {
  const paymentHandler = PAYMENT_HANDLERS[eventType];
  if (paymentHandler) return paymentHandler;
  // Everything else flows through the generic notification projector.
  logger.debug("outbox_default_handler", { eventType });
  return notificationHandler;
}
