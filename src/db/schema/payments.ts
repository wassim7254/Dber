import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  paymentCategoryEnum,
  paymentProviderEnum,
  paymentStateEnum,
  refundStateEnum,
} from "@/db/schema/enums";
import { groupBuyParticipants } from "@/db/schema/souq";
import { khidmaBookings } from "@/db/schema/khidma";
import { rentalBookings } from "@/db/schema/kraya";
import { users } from "@/db/schema/identity";
import type { Json } from "@/types/json";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    category: paymentCategoryEnum("category").notNull(),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    capturedMinor: bigint("captured_minor", { mode: "number" }).notNull().default(0),
    refundedMinor: bigint("refunded_minor", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("MAD"),
    state: paymentStateEnum("state").notNull().default("created"),
    provider: paymentProviderEnum("provider").notNull().default("mock"),
    providerRef: text("provider_ref"),
    /** Exactly one target is set, enforced by `payments_single_target`. */
    souqParticipantId: uuid("souq_participant_id").references(() => groupBuyParticipants.id),
    khidmaBookingId: uuid("khidma_booking_id").references(() => khidmaBookings.id),
    krayaBookingId: uuid("kraya_booking_id").references(() => rentalBookings.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("payments_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "payments_captured_bounds",
      sql`${t.capturedMinor} >= 0 AND ${t.capturedMinor} <= ${t.amountMinor}`,
    ),
    check(
      "payments_refunded_bounds",
      sql`${t.refundedMinor} >= 0 AND ${t.refundedMinor} <= ${t.capturedMinor}`,
    ),
    check(
      "payments_single_target",
      sql`(
        ${t.category} = 'souq_join' AND ${t.souqParticipantId} IS NOT NULL AND ${t.khidmaBookingId} IS NULL AND ${t.krayaBookingId} IS NULL
        OR ${t.category} = 'khidma_service' AND ${t.souqParticipantId} IS NULL AND ${t.khidmaBookingId} IS NOT NULL AND ${t.krayaBookingId} IS NULL
        OR ${t.category} IN ('kraya_rental', 'kraya_deposit') AND ${t.souqParticipantId} IS NULL AND ${t.khidmaBookingId} IS NULL AND ${t.krayaBookingId} IS NOT NULL
      )`,
    ),
    unique("payments_provider_ref_unique").on(t.provider, t.providerRef),
    index("payments_payer_idx").on(t.payerId),
    index("payments_state_idx").on(t.state),
    index("payments_souq_participant_idx").on(t.souqParticipantId),
    index("payments_khidma_booking_idx").on(t.khidmaBookingId),
    index("payments_kraya_booking_idx").on(t.krayaBookingId),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    state: refundStateEnum("state").notNull().default("requested"),
    provider: paymentProviderEnum("provider").notNull().default("mock"),
    providerRef: text("provider_ref"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("refunds_amount_positive", sql`${t.amountMinor} > 0`),
    unique("refunds_provider_ref_unique").on(t.provider, t.providerRef),
    index("refunds_payment_idx").on(t.paymentId),
    index("refunds_state_idx").on(t.state),
  ],
);

/**
 * Append-only log of provider events (webhooks and provider-generated
 * internal events). The (provider, provider_event_id) unique constraint is
 * the deduplication backbone for duplicate and replayed callbacks.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: paymentProviderEnum("provider").notNull().default("mock"),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Json>().notNull().default(sql`'{}'::jsonb`),
    signatureVerified: boolean("signature_verified").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("payment_events_provider_event_unique").on(t.provider, t.providerEventId),
    index("payment_events_processed_idx").on(t.processedAt),
  ],
);
