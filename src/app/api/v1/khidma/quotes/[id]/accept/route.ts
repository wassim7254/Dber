import { mutationRoute } from "@/lib/http/with-route";
import { acceptQuoteSchema } from "@/domains/khidma/schemas";
import { acceptQuote } from "@/domains/khidma/application/khidma-service";

export const POST = mutationRoute({
  scope: "khidma.quote.accept",
  auth: ["buyer"],
  body: acceptQuoteSchema,
  handler: ({ tx, identity, body, params }) => acceptQuote(tx, identity, { quoteId: params.id, startTime: body.startTime, endTime: body.endTime }),
});
