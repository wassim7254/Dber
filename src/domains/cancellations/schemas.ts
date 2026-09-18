import { z } from "zod";

export const requestCancellationSchema = z.object({
  entityType: z.enum(["souq_circle", "khidma_booking", "kraya_booking"]),
  entityId: z.uuid(),
  reason: z.string().min(3).max(1000),
});

export const reviewCancellationSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  decisionReason: z.string().min(3).max(1000),
});
