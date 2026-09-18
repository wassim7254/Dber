import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  khidmaBookingStateEnum,
  khidmaRequestStateEnum,
  listingStatusEnum,
  quoteStateEnum,
} from "@/db/schema/enums";
import { users } from "@/db/schema/identity";

export const khidmaServices = pgTable(
  "khidma_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    specialty: text("specialty").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("general"),
    basePriceMinor: bigint("base_price_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    durationMinutes: integer("duration_minutes").notNull(),
    status: listingStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("khidma_services_price_nonnegative", sql`${t.basePriceMinor} >= 0`),
    check("khidma_services_duration_positive", sql`${t.durationMinutes} > 0`),
    index("khidma_services_professional_idx").on(t.professionalId, t.status),
  ],
);

/** Weekly availability template (display + scheduling hints, not a hard lock). */
export const khidmaAvailability = pgTable(
  "khidma_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => users.id),
    /** 0 = Sunday … 6 = Saturday */
    weekday: integer("weekday").notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
  },
  (t) => [
    check("khidma_availability_weekday", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("khidma_availability_window", sql`${t.endMinute} > ${t.startMinute}`),
    unique("khidma_availability_slot_unique").on(t.professionalId, t.weekday, t.startMinute),
  ],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    serviceId: uuid("service_id").references(() => khidmaServices.id),
    description: text("description").notNull(),
    requestedStart: timestamp("requested_start", { withTimezone: true, mode: "date" }),
    requestedEnd: timestamp("requested_end", { withTimezone: true, mode: "date" }),
    state: khidmaRequestStateEnum("state").notNull().default("requested"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check(
      "khidma_requests_window_order",
      sql`${t.requestedEnd} IS NULL OR ${t.requestedStart} IS NULL OR ${t.requestedEnd} > ${t.requestedStart}`,
    ),
    index("khidma_requests_buyer_idx").on(t.buyerId),
    index("khidma_requests_state_idx").on(t.state),
  ],
);

export const serviceQuotes = pgTable(
  "service_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => serviceRequests.id),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => users.id),
    serviceId: uuid("service_id").references(() => khidmaServices.id),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    message: text("message").notNull().default(""),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    state: quoteStateEnum("state").notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("khidma_quotes_amount_positive", sql`${t.amountMinor} > 0`),
    unique("khidma_quotes_request_professional_unique").on(t.requestId, t.professionalId),
    index("khidma_quotes_professional_idx").on(t.professionalId, t.state),
  ],
);

export const khidmaBookings = pgTable(
  "khidma_bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => serviceRequests.id),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => serviceQuotes.id),
    buyerId: uuid("buyer_id")
      .notNull()
      .references(() => users.id),
    professionalId: uuid("professional_id")
      .notNull()
      .references(() => users.id),
    serviceId: uuid("service_id").references(() => khidmaServices.id),
    serviceTitleSnapshot: text("service_title_snapshot").notNull(),
    startTime: timestamp("start_time", { withTimezone: true, mode: "date" }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true, mode: "date" }).notNull(),
    priceSnapshotMinor: bigint("price_snapshot_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    state: khidmaBookingStateEnum("state").notNull().default("payment_pending"),
    /** Restored on dispute dismissal — the one dynamic transition, strictly guarded. */
    stateBeforeDispute: khidmaBookingStateEnum("state_before_dispute"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("khidma_bookings_window_order", sql`${t.endTime} > ${t.startTime}`),
    check("khidma_bookings_price_positive", sql`${t.priceSnapshotMinor} > 0`),
    unique("khidma_bookings_quote_unique").on(t.quoteId),
    index("khidma_bookings_buyer_idx").on(t.buyerId),
    index("khidma_bookings_professional_idx").on(t.professionalId, t.state),
    index("khidma_bookings_ttl_idx").on(t.state, t.createdAt),
  ],
);
