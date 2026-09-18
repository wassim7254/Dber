import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  auditEntityTypeEnum,
  cancellationTargetEnum,
  idempotencyStatusEnum,
  notificationKindEnum,
  outboxStatusEnum,
  savedEntityEnum,
  userRoleEnum,
} from "@/db/schema/enums";
import { users } from "@/db/schema/identity";
import type { AggregateType, DomainEvent } from "@/lib/events";
import type { Json } from "@/types/json";

/**
 * Idempotency reservation table. UNIQUE(scope, user_id, key) is the
 * concurrency lock: the row is inserted inside the business transaction
 * (§7 architecture), so concurrent duplicates serialize on this index.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: varchar("scope", { length: 120 }).notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: idempotencyStatusEnum("status").notNull().default("in_progress"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Json>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now() + interval '7 days'`),
  },
  (t) => [
    unique("idempotency_keys_scope_user_key_unique").on(t.scope, t.userId, t.key),
    index("idempotency_keys_expires_idx").on(t.expiresAt),
  ],
);

/** Transactional outbox (§10–11): written in the business transaction, drained by the worker. */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 120 }).$type<DomainEvent>().notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    aggregateType: varchar("aggregate_type", { length: 60 }).$type<AggregateType>().notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Json>().notNull().default(sql`'{}'::jsonb`),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("outbox_events_status_available_idx").on(t.status, t.availableAt),
    index("outbox_events_aggregate_idx").on(t.aggregateType, t.aggregateId),
  ],
);

/**
 * Append-only audit log (§13). Written inside the business transaction; no
 * application code path updates or deletes rows here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Null actor = system (jobs, reconcilers). */
    actorId: uuid("actor_id").references(() => users.id),
    actorRole: varchar("actor_role", { length: 20 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: auditEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before").$type<Json>(),
    after: jsonb("after").$type<Json>(),
    metadata: jsonb("metadata").$type<Json>().notNull().default(sql`'{}'::jsonb`),
    requestId: varchar("request_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_request_idx").on(t.requestId),
  ],
);

export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: auditEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").$type<Json>().notNull().default(sql`'{}'::jsonb`),
    requestId: varchar("request_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("admin_actions_admin_idx").on(t.adminId, t.createdAt)],
);

export const providerActions = pgTable(
  "provider_actions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => users.id),
    providerRole: userRoleEnum("provider_role").notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: auditEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Json>().notNull().default(sql`'{}'::jsonb`),
    requestId: varchar("request_id", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("provider_actions_provider_idx").on(t.providerId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: auditEntityTypeEnum("entity_type"),
    entityId: uuid("entity_id"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const savedItems = pgTable(
  "saved_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    entityType: savedEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique("saved_items_user_entity_unique").on(t.userId, t.entityType, t.entityId)],
);

/** Target registry shared by cancellations and disputes. */
export const CANCELLATION_TARGETS = ["souq_circle", "khidma_booking", "kraya_booking"] as const;
export type CancellationTargetType = (typeof cancellationTargetEnum.enumValues)[number];
export type AuditEntityType = (typeof auditEntityTypeEnum.enumValues)[number];
