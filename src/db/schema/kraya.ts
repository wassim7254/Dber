import { sql } from "drizzle-orm";
import {
  bigint,
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
  assetCategoryEnum,
  krayaBookingStateEnum,
  listingStatusEnum,
  payoutStateEnum,
  paymentProviderEnum,
} from "@/db/schema/enums";
import { users } from "@/db/schema/identity";

export const krayaAssets = pgTable(
  "kraya_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: assetCategoryEnum("category").notNull().default("other"),
    dailyRateMinor: bigint("daily_rate_minor", { mode: "number" }).notNull(),
    depositMinor: bigint("deposit_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    location: text("location").notNull().default(""),
    capacity: integer("capacity"),
    /** House rules shown to renters before checkout and frozen into contracts. */
    rules: text("rules").notNull().default(""),
    /** Shortest bookable duration in hours (renter-facing guard, server-enforced). */
    minDurationHours: integer("min_duration_hours").notNull().default(1),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: listingStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("kraya_assets_rate_nonnegative", sql`${t.dailyRateMinor} >= 0`),
    check("kraya_assets_deposit_nonnegative", sql`${t.depositMinor} >= 0`),
    check("kraya_assets_min_duration_positive", sql`${t.minDurationHours} >= 1`),
    index("kraya_assets_owner_idx").on(t.ownerId, t.status),
    index("kraya_assets_status_idx").on(t.status),
  ],
);

/**
 * Owner-blocked windows (maintenance, personal use). Union with booked
 * ranges forms the renter-facing calendar. Blocks only affect NEW bookings —
 * existing slot holds are honored (§6.3 note).
 */
export const krayaAvailability = pgTable(
  "kraya_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => krayaAssets.id),
    startTime: timestamp("start_time", { withTimezone: true, mode: "date" }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true, mode: "date" }).notNull(),
    note: text("note").notNull().default(""),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("kraya_availability_window_order", sql`${t.endTime} > ${t.startTime}`),
    index("kraya_availability_asset_idx").on(t.assetId, t.startTime),
  ],
);

export const rentalBookings = pgTable(
  "rental_bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => krayaAssets.id),
    renterId: uuid("renter_id")
      .notNull()
      .references(() => users.id),
    startTime: timestamp("start_time", { withTimezone: true, mode: "date" }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true, mode: "date" }).notNull(),
    dailyRateSnapshotMinor: bigint("daily_rate_snapshot_minor", { mode: "number" }).notNull(),
    depositSnapshotMinor: bigint("deposit_snapshot_minor", { mode: "number" }).notNull(),
    totalChargeMinor: bigint("total_charge_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    state: krayaBookingStateEnum("state").notNull().default("requested"),
    stateBeforeDispute: krayaBookingStateEnum("state_before_dispute"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("kraya_bookings_window_order", sql`${t.endTime} > ${t.startTime}`),
    check("kraya_bookings_charge_positive", sql`${t.totalChargeMinor} > 0`),
    index("kraya_bookings_renter_idx").on(t.renterId),
    index("kraya_bookings_asset_idx").on(t.assetId, t.state),
    index("kraya_bookings_ttl_idx").on(t.state, t.createdAt),
  ],
);

/**
 * Immutable commercial snapshot created at confirmation. Never updated;
 * new versions are new rows (booking_id, version).
 */
export const rentalContracts = pgTable(
  "rental_contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => rentalBookings.id),
    version: integer("version").notNull().default(1),
    terms: jsonb("terms").$type<Record<string, string>>().notNull().default({}),
    assetSnapshot: jsonb("asset_snapshot").$type<Record<string, string>>().notNull().default({}),
    priceSnapshotMinor: bigint("price_snapshot_minor", { mode: "number" }).notNull(),
    depositSnapshotMinor: bigint("deposit_snapshot_minor", { mode: "number" }).notNull(),
    cancellationPolicy: text("cancellation_policy").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique("rental_contracts_booking_version_unique").on(t.bookingId, t.version)],
);

/**
 * Provider earnings ledger. One row per completed rental: gross charge minus
 * the platform fee, settled to the owner via the payment provider. Created
 * in the completion transaction, settled by the outbox worker.
 */
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => rentalBookings.id),
    grossMinor: bigint("gross_minor", { mode: "number" }).notNull(),
    feeMinor: bigint("fee_minor", { mode: "number" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    state: payoutStateEnum("state").notNull().default("pending"),
    provider: paymentProviderEnum("provider").notNull().default("mock"),
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("payouts_amounts_positive", sql`${t.grossMinor} > 0 AND ${t.feeMinor} >= 0 AND ${t.amountMinor} = ${t.grossMinor} - ${t.feeMinor} AND ${t.amountMinor} > 0`),
    unique("payouts_booking_unique").on(t.bookingId),
    unique("payouts_provider_ref_unique").on(t.provider, t.providerRef),
    index("payouts_owner_idx").on(t.ownerId, t.state),
    index("payouts_state_idx").on(t.state),
  ],
);
