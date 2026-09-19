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
  circleStateEnum,
  deliveryMethodEnum,
  listingStatusEnum,
  participantPaymentStatusEnum,
} from "@/db/schema/enums";
import { users } from "@/db/schema/identity";

export const souqProducts = pgTable(
  "souq_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull().default("general"),
    subcategory: text("subcategory").notNull().default(""),
    sku: text("sku"),
    basePriceMinor: bigint("base_price_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    /** Sale unit shown to buyers ("1L bottle", "piece", "kg"). */
    unit: text("unit").notNull().default("unit"),
    /** Total units the seller makes available across all circles. */
    maxAvailableQuantity: integer("max_available_quantity").notNull().default(0),
    deliveryMethod: deliveryMethodEnum("delivery_method").notNull().default("delivery"),
    deliveryFeeMinor: bigint("delivery_fee_minor", { mode: "number" }).notNull().default(0),
    /** Estimated fulfillment time after a circle locks, in hours. */
    fulfillmentHours: integer("fulfillment_hours").notNull().default(48),
    location: text("location").notNull().default(""),
    status: listingStatusEnum("status").notNull().default("draft"),
    /** UI image descriptors / media ids (deterministic visual themes, no external assets). */
    images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("souq_products_base_price_nonnegative", sql`${t.basePriceMinor} >= 0`),
    check("souq_products_delivery_fee_nonnegative", sql`${t.deliveryFeeMinor} >= 0`),
    check("souq_products_max_available_nonnegative", sql`${t.maxAvailableQuantity} >= 0`),
    check("souq_products_fulfillment_positive", sql`${t.fulfillmentHours} > 0`),
    index("souq_products_seller_idx").on(t.sellerId),
    index("souq_products_status_idx").on(t.status),
  ],
);

export const groupBuyCircles = pgTable(
  "group_buy_circles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => souqProducts.id),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    targetQuantity: integer("target_quantity").notNull(),
    minimumParticipants: integer("minimum_participants").notNull(),
    currentQuantity: integer("current_quantity").notNull().default(0),
    groupPriceMinor: bigint("group_price_minor", { mode: "number" }).notNull(),
    listPriceMinor: bigint("list_price_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("MAD"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true, mode: "date" }).notNull(),
    state: circleStateEnum("state").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("circles_target_positive", sql`${t.targetQuantity} > 0`),
    check("circles_min_participants_positive", sql`${t.minimumParticipants} > 0`),
    check(
      "circles_quantity_within_target",
      sql`${t.currentQuantity} >= 0 AND ${t.currentQuantity} <= ${t.targetQuantity}`,
    ),
    check("circles_group_price_positive", sql`${t.groupPriceMinor} > 0`),
    check("circles_list_price_positive", sql`${t.listPriceMinor} > 0`),
    check("circles_deadline_after_creation", sql`${t.deadlineAt} > ${t.createdAt}`),
    index("circles_state_deadline_idx").on(t.state, t.deadlineAt),
    index("circles_seller_idx").on(t.sellerId),
  ],
);

export const groupBuyParticipants = pgTable(
  "group_buy_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => groupBuyCircles.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    quantity: integer("quantity").notNull(),
    paymentStatus: participantPaymentStatusEnum("payment_status").notNull().default("none"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("group_buy_participants_circle_user_unique").on(t.circleId, t.userId),
    check("participants_quantity_positive", sql`${t.quantity} > 0`),
    index("participants_user_idx").on(t.userId),
  ],
);
