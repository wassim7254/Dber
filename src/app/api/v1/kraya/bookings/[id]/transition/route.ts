import { mutationRoute } from "@/lib/http/with-route";
import { krayaTransitionSchema } from "@/domains/kraya/schemas";
import { transitionRentalBooking } from "@/domains/kraya/application/kraya-service";

export const POST = mutationRoute({
  scope: "kraya.booking.transition",
  auth: ["buyer", "seller", "professional", "admin"],
  body: krayaTransitionSchema,
  handler: ({ tx, identity, body, params }) =>
    transitionRentalBooking(tx, { identity, bookingId: params.id, action: body.action, reason: body.reason }),
});
