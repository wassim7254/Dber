import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "buyer",
  "seller",
  "professional",
  "rental_owner",
  "ops_admin",
  "admin",
]);

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);

export const circleStateEnum = pgEnum("circle_state", [
  "draft",
  "open",
  "locked",
  "supplier_confirmed",
  "fulfilling",
  "delivered",
  "completed",
  "expired",
  "cancelled",
  "failed_closed",
]);

export const participantPaymentStatusEnum = pgEnum("participant_payment_status", [
  "none",
  "pending",
  "authorized",
  "captured",
  "refunded",
  "voided",
  "failed",
]);

export const khidmaRequestStateEnum = pgEnum("khidma_request_state", [
  "requested",
  "quoted",
  "booked",
  "expired",
  "cancelled",
]);

export const quoteStateEnum = pgEnum("quote_state", [
  "submitted",
  "accepted",
  "rejected",
  "withdrawn",
  "expired",
]);

export const khidmaBookingStateEnum = pgEnum("khidma_booking_state", [
  "payment_pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
]);

export const krayaBookingStateEnum = pgEnum("kraya_booking_state", [
  "requested",
  "payment_pending",
  "confirmed",
  "active",
  "completed",
  "cancelled",
  "disputed",
  "refunded",
]);

export const paymentStateEnum = pgEnum("payment_state", [
  "created",
  "authorization_pending",
  "authorized",
  "capture_pending",
  "captured",
  "void_pending",
  "voided",
  "refund_pending",
  "refunded",
  "failed",
]);

export const paymentCategoryEnum = pgEnum("payment_category", [
  "souq_join",
  "khidma_service",
  "kraya_rental",
  "kraya_deposit",
]);

export const paymentProviderEnum = pgEnum("payment_provider", ["mock", "stripe"]);

export const refundStateEnum = pgEnum("refund_state", [
  "requested",
  "provider_pending",
  "completed",
  "failed",
]);

export const cancellationStateEnum = pgEnum("cancellation_state", [
  "pending",
  "approved",
  "executed",
  "rejected",
  "withdrawn",
]);

export const disputeStateEnum = pgEnum("dispute_state", ["opened", "under_review", "resolved"]);

export const disputeResolutionEnum = pgEnum("dispute_resolution", [
  "force_refund",
  "force_complete",
  "partial_refund",
  "dismiss",
]);

export const cancellationTargetEnum = pgEnum("cancellation_target_type", [
  "souq_circle",
  "khidma_booking",
  "kraya_booking",
]);

export const auditEntityTypeEnum = pgEnum("audit_entity_type", [
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
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);

export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "in_progress",
  "completed",
  "abandoned",
]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "group_progress",
  "group_locked",
  "booking_confirmed",
  "booking_cancelled",
  "rental_starting",
  "payment_attention",
  "refund_completed",
  "dispute_update",
]);

export const savedEntityEnum = pgEnum("saved_entity_type", [
  "souq_product",
  "khidma_service",
  "kraya_asset",
  "professional",
]);

export const assetCategoryEnum = pgEnum("asset_category", [
  "equipment",
  "vehicle",
  "space",
  "tool",
  "other",
]);

export const payoutStateEnum = pgEnum("payout_state", [
  "pending",
  "processing",
  "paid",
  "failed",
]);

export const payoutEntityEnum = pgEnum("payout_entity_type", [
  "souq_circle",
  "khidma_booking",
  "kraya_booking",
]);

export const authTokenTypeEnum = pgEnum("auth_token_type", [
  "email_verification",
  "password_reset",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending_review",
  "verified",
]);

export const supportStateEnum = pgEnum("support_state", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const messageTargetEnum = pgEnum("message_target_type", [
  "souq_circle",
  "khidma_booking",
  "kraya_booking",
]);

export const reviewEntityEnum = pgEnum("review_entity_type", [
  "souq_circle",
  "khidma_booking",
  "kraya_booking",
]);

export const deliveryMethodEnum = pgEnum("delivery_method", ["delivery", "pickup", "both"]);

export const moderationEntityEnum = pgEnum("moderation_entity_type", [
  "souq_product",
  "khidma_service",
  "kraya_asset",
]);
