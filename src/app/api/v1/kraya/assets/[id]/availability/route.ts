import { mutationRoute } from "@/lib/http/with-route";
import { blockedWindowSchema } from "@/domains/kraya/schemas";
import { addBlockedWindow } from "@/domains/kraya/application/kraya-service";

/** Owner blocks a window (maintenance / personal use). New bookings in the window are rejected. */
export const POST = mutationRoute({
  scope: "kraya.availability.block",
  auth: ["seller", "professional", "admin"],
  body: blockedWindowSchema,
  handler: ({ tx, identity, body, params }) =>
    addBlockedWindow(tx, identity, {
      assetId: params.id,
      startTime: body.startTime,
      endTime: body.endTime,
      note: body.note,
    }),
});
