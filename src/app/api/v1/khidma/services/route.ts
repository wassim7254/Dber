import { mutationRoute } from "@/lib/http/with-route";
import { createServiceSchema, setAvailabilitySchema } from "@/domains/khidma/schemas";
import { createService, setAvailability } from "@/domains/khidma/application/khidma-service";

export const POST = mutationRoute({
  scope: "khidma.service.create",
  auth: ["professional"],
  body: createServiceSchema,
  handler: ({ tx, identity, body }) => createService(tx, identity, body),
});

export const PUT = mutationRoute({
  scope: "khidma.availability.set",
  auth: ["professional"],
  body: setAvailabilitySchema,
  handler: ({ tx, identity, body }) => setAvailability(tx, identity, body.slots),
});
