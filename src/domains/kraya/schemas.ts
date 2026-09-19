import { z } from "zod";

import { isoDateTimeSchema, nonNegativeMinorSchema, positiveIntSchema } from "@/lib/validation";

export const createAssetSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  category: z.enum(["equipment", "vehicle", "space", "tool", "other"]),
  dailyRateMinor: nonNegativeMinorSchema,
  depositMinor: nonNegativeMinorSchema,
  location: z.string().max(200).default(""),
  capacity: z.number().int().min(1).max(10_000).optional(),
  images: z.array(z.string().min(1).max(40)).max(6).default([]),
  rules: z.string().max(4000).default(""),
  minDurationHours: positiveIntSchema.max(24 * 30).default(1),
  /** Availability step: owner-blocked windows created atomically with the draft. */
  blockedWindows: z
    .array(
      z.object({
        startTime: isoDateTimeSchema,
        endTime: isoDateTimeSchema,
        note: z.string().max(200).optional(),
      }),
    )
    .max(50)
    .default([]),
});

export const createRentalBookingSchema = z.object({
  assetId: z.uuid(),
  startTime: isoDateTimeSchema,
  endTime: isoDateTimeSchema,
});

export const krayaTransitionSchema = z.object({
  action: z.enum(["activate", "complete", "cancel"]),
  reason: z.string().min(3).max(500).optional(),
});

export const updateAssetSchema = createAssetSchema.omit({ blockedWindows: true }).partial();

export const assetTransitionSchema = z.object({
  action: z.enum(["publish", "pause", "archive", "restore"]),
});

export const rentalProviderProfileSchema = z.object({
  businessName: z.string().min(2).max(120).optional(),
  description: z.string().max(5000).default(""),
  city: z.string().max(120).default(""),
  country: z.string().max(60).default("MA"),
  rentalPolicies: z.string().max(4000).default(""),
  payoutHandle: z.string().max(120).default(""),
});

export const blockedWindowSchema = z
  .object({
    startTime: isoDateTimeSchema,
    endTime: isoDateTimeSchema,
    note: z.string().max(200).optional(),
  })
  .refine((input) => input.endTime > input.startTime, {
    message: "Blocked windows must end after they start",
    path: ["endTime"],
  });
