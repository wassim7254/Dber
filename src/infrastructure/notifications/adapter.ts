import { logger } from "@/infrastructure/logging/logger";
import type { AuditEntityType } from "@/db/schema";

export type NotificationKind =
  | "group_progress"
  | "group_locked"
  | "booking_confirmed"
  | "booking_cancelled"
  | "rental_starting"
  | "payment_attention"
  | "refund_completed"
  | "dispute_update";

export interface NotificationDelivery {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: AuditEntityType;
  entityId?: string;
}

/**
 * NotificationService port (§68). The console adapter is the MVP delivery
 * channel; email/push providers plug in here without touching domains.
 */
export interface NotificationAdapter {
  readonly channel: string;
  deliver(notification: NotificationDelivery): Promise<void>;
}

export const consoleNotificationAdapter: NotificationAdapter = {
  channel: "console",
  async deliver(notification) {
    logger.info("notification.delivered", {
      channel: "console",
      userId: notification.userId,
      kind: notification.kind,
      title: notification.title,
    });
  },
};
