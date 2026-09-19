import { z } from "zod";

import { positiveMinorSchema, quantitySchema, isoDateTimeSchema, nonNegativeMinorSchema, positiveIntSchema } from "@/lib/validation";
import { CIRCLE_USER_ACTIONS } from "@/domains/souq/domain/machine";

export const createProductSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.string().min(2).max(60).default("general"),
  subcategory: z.string().max(60).default(""),
  sku: z.string().max(60).optional(),
  basePriceMinor: positiveMinorSchema,
  unit: z.string().min(1).max(30).default("unit"),
  maxAvailableQuantity: quantitySchema,
  deliveryMethod: z.enum(["delivery", "pickup", "both"]).default("delivery"),
  deliveryFeeMinor: nonNegativeMinorSchema.default(0),
  fulfillmentHours: positiveIntSchema.max(24 * 60).default(48),
  location: z.string().max(200).default(""),
  images: z.array(z.string().min(1).max(200)).max(6).default([]),
});

export const updateProductSchema = createProductSchema.partial();

export const productTransitionSchema = z.object({
  action: z.enum(["publish", "pause", "archive", "restore"]),
});

export const createCircleSchema = z
  .object({
    productId: z.uuid(),
    targetQuantity: quantitySchema,
    minimumParticipants: quantitySchema,
    groupPriceMinor: positiveMinorSchema,
    listPriceMinor: positiveMinorSchema,
    deadlineAt: isoDateTimeSchema,
  })
  .refine((input) => input.groupPriceMinor <= input.listPriceMinor, {
    message: "Group price must not exceed the list price",
    path: ["groupPriceMinor"],
  });

export const joinCircleSchema = z.object({
  quantity: quantitySchema.default(1),
});

export const circleTransitionSchema = z.object({
  action: z.enum(CIRCLE_USER_ACTIONS),
  reason: z.string().min(3).max(500).optional(),
});
