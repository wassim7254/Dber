import { mutationRoute } from "@/lib/http/with-route";
import { createRentalBookingSchema } from "@/domains/kraya/schemas";
import { createRentalBooking } from "@/domains/kraya/application/kraya-service";

export const POST = mutationRoute({
  scope: "kraya.booking.create",
  auth: ["buyer"],
  rateLimit: { limit: 20, windowMs: 60_000 },
  body: createRentalBookingSchema,
  handler: ({ tx, identity, body }) =>
    createRentalBooking(tx, identity, {
      assetId: body.assetId,
      startTime: body.startTime,
      endTime: body.endTime,
    }),
});
