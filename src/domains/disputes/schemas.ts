import { z } from "zod";

import { positiveMinorSchema } from "@/lib/validation";

export const openDisputeSchema = z.object({
  entityType: z.enum(["khidma_booking", "kraya_booking"]),
  entityId: z.uuid(),
  reason: z.string().min(10).max(2000),
});

export const addEvidenceSchema = z.object({
  evidenceType: z.string().min(2).max(60),
  storageReference: z.string().min(2).max(500),
});

export const resolveDisputeSchema = z
  .object({
    resolution: z.enum(["force_refund", "force_complete", "partial_refund", "dismiss"]),
    rationale: z.string().min(3).max(2000),
    amountMinor: positiveMinorSchema.optional(),
  })
  .refine((input) => input.resolution !== "partial_refund" || input.amountMinor !== undefined, {
    message: "partial_refund requires amountMinor",
    path: ["amountMinor"],
  });
