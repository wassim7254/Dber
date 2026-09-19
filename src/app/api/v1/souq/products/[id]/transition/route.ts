import { productTransitionSchema } from "@/domains/souq/schemas";
import { transitionProduct } from "@/domains/souq/application/souq-service";
import { mutationRoute } from "@/lib/http/with-route";

export const POST = mutationRoute({
  scope: "souq.product.transition",
  auth: ["seller"],
  body: productTransitionSchema,
  handler: ({ tx, identity, body, params }) => transitionProduct(tx, identity, params.id, body.action),
});
