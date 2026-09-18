import { mutationRoute } from "@/lib/http/with-route";
import { khidmaTransitionSchema } from "@/domains/khidma/schemas";
import { transitionBooking } from "@/domains/khidma/application/khidma-service";

export const POST = mutationRoute({
  scope: "khidma.booking.transition",
  auth: ["buyer", "professional", "admin"],
  body: khidmaTransitionSchema,
  handler: ({ tx, identity, body, params }) =>
    transitionBooking(tx, { identity, bookingId: params.id, action: body.action, reason: body.reason }),
});
