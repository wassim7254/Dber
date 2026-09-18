import { z } from "zod";

import { isoDateTimeSchema, positiveMinorSchema, positiveIntSchema } from "@/lib/validation";

export const createServiceSchema = z.object({
  title: z.string().min(3).max(200),
  specialty: z.string().min(2).max(120),
  description: z.string().min(10).max(5000),
  category: z.string().min(2).max(60).default("general"),
  basePriceMinor: positiveMinorSchema,
  durationMinutes: positiveIntSchema.max(24 * 60),
});

export const availabilitySlotSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(24 * 60 - 1),
  endMinute: z.number().int().min(1).max(24 * 60),
});

export const setAvailabilitySchema = z
  .object({ slots: z.array(availabilitySlotSchema).max(50) })
  .refine(
    (input) => input.slots.every((slot) => slot.endMinute > slot.startMinute),
    { message: "Availability windows must end after they start", path: ["slots"] },
  );

export const createRequestSchema = z
  .object({
    serviceId: z.uuid().optional(),
    description: z.string().min(10).max(2000),
    requestedStart: isoDateTimeSchema.optional(),
    requestedEnd: isoDateTimeSchema.optional(),
  })
  .refine(
    (input) => !input.requestedStart || !input.requestedEnd || input.requestedEnd > input.requestedStart,
    { message: "requestedEnd must be after requestedStart", path: ["requestedEnd"] },
  );

export const submitQuoteSchema = z.object({
  requestId: z.uuid(),
  serviceId: z.uuid().optional(),
  amountMinor: positiveMinorSchema,
  message: z.string().max(2000).default(""),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});

export const acceptQuoteSchema = z.object({
  startTime: isoDateTimeSchema,
  endTime: isoDateTimeSchema,
});

export const khidmaTransitionSchema = z.object({
  action: z.enum(["start", "complete", "cancel"]),
  reason: z.string().min(3).max(500).optional(),
});
