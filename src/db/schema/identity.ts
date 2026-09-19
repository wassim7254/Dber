import { sql } from "drizzle-orm";
import {
  boolean,
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
  authTokenTypeEnum,
  userRoleEnum,
  userStatusEnum,
  verificationStatusEnum,
} from "@/db/schema/enums";
import type { Json } from "@/types/json";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    /** scrypt hash — never a plaintext password (§4). Null = no password set (dev-only identities). */
    passwordHash: text("password_hash"),
    phone: text("phone"),
    country: text("country"),
    city: text("city"),
    locale: text("locale").notNull().default("en"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    status: userStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("users_email_unique").on(t.email),
    index("users_role_idx").on(t.role),
  ],
);

/**
 * Server-side sessions. The browser holds only an opaque random token; this
 * table stores its SHA-256 hash so a database leak cannot resurrect sessions.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userAgent: text("user_agent").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("sessions_token_hash_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

/** Single-use email-verification and password-reset tokens (hash-stored). */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: authTokenTypeEnum("kind").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("auth_tokens_token_hash_unique").on(t.tokenHash),
    index("auth_tokens_user_idx").on(t.userId, t.kind),
  ],
);

/**
 * Multi-role entitlements (§38): one account can act as customer, seller,
 * professional and rental owner at the same time. `users.role` stays the
 * ACTIVE context (what RBAC evaluates); this table is what the user is
 * allowed to switch into. Rows are created at registration and by the
 * onboarding wizard; admins grant nothing here.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique("user_roles_user_role_unique").on(t.userId, t.role), index("user_roles_user_idx").on(t.userId)],
);

/**
 * Seller business profile (store identity, fulfillment and payout details).
 * One row per seller; the workspace wizard creates it on first save.
 */
export const sellerProfiles = pgTable("seller_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  storeName: text("store_name").notNull(),
  description: text("description").notNull().default(""),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("MA"),
  deliveryInfo: text("delivery_info").notNull().default(""),
  pickupInfo: text("pickup_info").notNull().default(""),
  /** Payout destination reference handed to the payment provider — never bank credentials. */
  payoutHandle: text("payout_handle").notNull().default(""),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

/** Rich professional profile — "what I do, who I help, how I work" (§9). */
export const professionalProfiles = pgTable("professional_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  headline: text("headline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  /** Portrait shown on professional cards and the public profile. */
  photoUrl: text("photo_url"),
  specialties: jsonb("specialties").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  serviceArea: text("service_area").notNull().default(""),
  yearsExperience: integer("years_experience"),
  languages: jsonb("languages").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  /** [{ title, description, mediaId? }] — kept as JSON until portfolio media exists. */
  portfolio: jsonb("portfolio").$type<Json>().notNull().default(sql`'[]'::jsonb`),
  /** online | in_person | both */
  serviceMode: text("service_mode").notNull().default("both"),
  payoutHandle: text("payout_handle").notNull().default(""),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

/** Rental provider profile — ownership context, rental policies, payout details. */
export const rentalProviderProfiles = pgTable("rental_provider_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  businessName: text("business_name").notNull(),
  description: text("description").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("MA"),
  rentalPolicies: text("rental_policies").notNull().default(""),
  payoutHandle: text("payout_handle").notNull().default(""),
  verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});

/** Notification channel preferences (in-app is always on; email/push opt-in). */
export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  /** Channel-level opt-outs by notification kind; missing kind = enabled. */
  disabledKinds: jsonb("disabled_kinds").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
});
