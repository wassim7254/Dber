import { mutationRoute } from "@/lib/http/with-route";
import { requestCancellationSchema } from "@/domains/cancellations/schemas";
import { requestCancellation } from "@/domains/cancellations/application/cancellation-service";

export const POST = mutationRoute({
  scope: "cancellation.request",
  auth: ["buyer", "seller", "professional", "admin"],
  body: requestCancellationSchema,
  handler: ({ tx, identity, body }) => requestCancellation(tx, identity, body),
});
