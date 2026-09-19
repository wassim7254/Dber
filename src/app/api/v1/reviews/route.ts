import { z } from "zod";

import { createReview } from "@/domains/engagement/reviews-service";
import { mutationRoute } from "@/lib/http/with-route";

const bodySchema = z.object({
  entityType: z.enum(["souq_circle", "khidma_booking", "kraya_booking"]),
  entityId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).default(""),
  body: z.string().max(4000).default(""),
});

/** Create a review tied to a completed transaction (§35). */
export const POST = mutationRoute({
  scope: "review.create",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: bodySchema,
  handler: ({ tx, identity, body }) => createReview(tx, identity, body),
});
