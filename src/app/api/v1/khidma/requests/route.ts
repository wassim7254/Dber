import { mutationRoute } from "@/lib/http/with-route";
import { createRequestSchema } from "@/domains/khidma/schemas";
import { createRequest } from "@/domains/khidma/application/khidma-service";

export const POST = mutationRoute({
  scope: "khidma.request.create",
  auth: ["buyer"],
  body: createRequestSchema,
  handler: ({ tx, identity, body }) => createRequest(tx, identity, body),
});
