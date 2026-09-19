import { updateServiceSchema, serviceTransitionSchema } from "@/domains/khidma/schemas";
import { transitionService, updateService } from "@/domains/khidma/application/khidma-service";
import { mutationRoute } from "@/lib/http/with-route";

export const PATCH = mutationRoute({
  scope: "khidma.service.update",
  auth: ["professional"],
  body: updateServiceSchema,
  handler: ({ tx, identity, body, params }) => updateService(tx, identity, params.id, body),
});

export const POST = mutationRoute({
  scope: "khidma.service.transition",
  auth: ["professional"],
  body: serviceTransitionSchema,
  handler: ({ tx, identity, body, params }) => transitionService(tx, identity, params.id, body.action),
});
