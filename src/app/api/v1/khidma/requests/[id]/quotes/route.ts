import { mutationRoute, queryRoute } from "@/lib/http/with-route";
import { submitQuoteSchema } from "@/domains/khidma/schemas";
import { submitQuote } from "@/domains/khidma/application/khidma-service";
import { getRequestQuotes, getRequestView } from "@/domains/khidma/application/khidma-read";
import { getRequestById } from "@/domains/khidma/infrastructure/khidma-repository";
import { ForbiddenError, ResourceNotFoundError } from "@/lib/errors";
import { db } from "@/db/client";

export const POST = mutationRoute({
  scope: "khidma.quote.submit",
  auth: ["professional"],
  body: submitQuoteSchema,
  handler: ({ tx, identity, body }) => submitQuote(tx, identity, body),
});

/** Quotes are visible to the request owner (and admins); professionals see only their own. */
export const GET = queryRoute({
  handler: async ({ params, identity }) => {
    const request = await getRequestView(db, params.id);
    const requestRow = await getRequestById(db, params.id);
    if (!requestRow) throw new ResourceNotFoundError("Request", params.id);
    if (!identity) throw new ForbiddenError("Authentication is required to view quotes");
    let quotes = await getRequestQuotes(db, params.id);
    if (identity.userId !== requestRow.buyerId && identity.role !== "admin") {
      quotes = quotes.filter((quote) => quote.professionalId === identity.userId);
    }
    return { request, quotes };
  },
});
