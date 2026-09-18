import { z } from "zod";

import { mutationRoute } from "@/lib/http/with-route";
import { withdrawCancellation } from "@/domains/cancellations/application/cancellation-service";

export const POST = mutationRoute({
  scope: "cancellation.withdraw",
  auth: ["buyer", "seller", "professional", "admin"],
  body: z.object({}).optional(),
  handler: ({ tx, identity, params }) => withdrawCancellation(tx, identity, params.id),
});
