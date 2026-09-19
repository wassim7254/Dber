import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditEntityTypeEnum,
  messageTargetEnum,
  moderationEntityEnum,
  reviewEntityEnum,
  supportStateEnum,
} from "@/db/schema/enums";
import { users } from "@/db/schema/identity";
import type { Json } from "@/types/json";

/**
 * Reviews are tied to completed transactions only (§35): the author must be a
 * participant of the referenced transaction and one review per author per
 * transaction is enforced by the unique constraint.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: reviewEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    /** The reviewed provider (seller / professional / rental owner). */
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => users.id),
    rating: integer("rating").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    unique("reviews_entity_author_unique").on(t.entityType, t.entityId, t.authorId),
    index("reviews_subject_idx").on(t.subjectId),
    index("reviews_entity_idx").on(t.entityType, t.entityId),
  ],
);

/**
 * Contextual transaction messaging (§28): one thread per business object,
 * participants authorized by the owning domain service — never a free chat.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: messageTargetEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("messages_body_nonempty", sql`length(trim(${t.body})) > 0`),
    index("messages_thread_idx").on(t.entityType, t.entityId, t.createdAt),
  ],
);

/** Support tickets (§70) — optionally anchored to a business entity. */
export const supportRequests = pgTable(
  "support_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    entityType: auditEntityTypeEnum("entity_type"),
    entityId: uuid("entity_id"),
    state: supportStateEnum("state").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    handledBy: uuid("handled_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("support_subject_nonempty", sql`length(trim(${t.subject})) > 0`),
    index("support_requests_user_idx").on(t.userId, t.createdAt),
    index("support_requests_state_idx").on(t.state),
  ],
);

/**
 * Upload registry. Bytes live behind the storage adapter (local dev volume or
 * object storage); this row is the metadata + access reference.
 */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Storage-adapter key, e.g. "dev/2026/09/<uuid>.jpg". */
    storageKey: text("storage_key").notNull(),
    /** Short human alt text required at upload time (§47, a11y). */
    altText: text("alt_text").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("uploads_size_positive", sql`${t.sizeBytes} > 0`),
    index("uploads_owner_idx").on(t.ownerId, t.createdAt),
  ],
);

/**
 * Cross-vertical moderation decision log for admin listing review (§31). The
 * per-vertical `status` column owns the commercial lifecycle; this append-only
 * table records each admin moderation action with its reason.
 */
export const listingModerations = pgTable(
  "listing_moderations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: moderationEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** approve | reject | disable | restore */
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    moderatedBy: uuid("moderated_by")
      .notNull()
      .references(() => users.id),
    metadata: jsonb("metadata").$type<Json>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("listing_moderations_entity_idx").on(t.entityType, t.entityId),
    index("listing_moderations_created_idx").on(t.createdAt),
  ],
);
