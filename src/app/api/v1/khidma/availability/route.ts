import { setAvailabilitySchema } from "@/domains/khidma/schemas";
import { setAvailability } from "@/domains/khidma/application/khidma-service";
import { mutationRoute } from "@/lib/http/with-route";

export const POST = mutationRoute({
  scope: "khidma.availability.set",
  auth: ["professional"],
  body: setAvailabilitySchema,
  handler: ({ tx, identity, body }) => setAvailability(tx, identity, body.slots),
});
