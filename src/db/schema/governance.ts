import { sql } from "drizzle-orm";
import {
  bigint,
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
  cancellationStateEnum,
  cancellationTargetEnum,
  disputeResolutionEnum,
  disputeStateEnum,
} from "@/db/schema/enums";
import { payments } from "@/db/schema/payments";
import { users } from "@/db/schema/identity";

export const cancellationRequests = pgTable(
  "cancellation_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    entityType: cancellationTargetEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    reason: text("reason").notNull(),
    state: cancellationStateEnum("state").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "date" }),
    decisionReason: text("decision_reason"),
    /** Set when the approval executes a refund. */
    refundPaymentId: uuid("refund_payment_id").references(() => payments.id),
    refundAmountMinor: bigint("refund_amount_minor", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("cancellation_requests_state_idx").on(t.state),
    index("cancellation_requests_target_idx").on(t.entityType, t.entityId),
    index("cancellation_requests_requester_idx").on(t.requesterId),
  ],
);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    openerId: uuid("opener_id")
      .notNull()
      .references(() => users.id),
    entityType: cancellationTargetEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    reason: text("reason").notNull(),
    state: disputeStateEnum("state").notNull().default("opened"),
    resolution: disputeResolutionEnum("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("disputes_state_idx").on(t.state),
    index("disputes_target_idx").on(t.entityType, t.entityId),
    index("disputes_opener_idx").on(t.openerId),
  ],
);

/** Append-only evidence records — never destroyed (§40). */
export const disputeEvidence = pgTable(
  "dispute_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => disputes.id),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id),
    evidenceType: text("evidence_type").notNull(),
    storageReference: text("storage_reference").notNull(),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("dispute_evidence_dispute_idx").on(t.disputeId)],
);

export const disputeResolutions = pgTable(
  "dispute_resolutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => disputes.id),
    resolution: disputeResolutionEnum("resolution").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    rationale: text("rationale").notNull(),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("dispute_resolutions_dispute_unique").on(t.disputeId),
    check("dispute_resolutions_amount_positive", sql`${t.amountMinor} IS NULL OR ${t.amountMinor} > 0`),
  ],
);
