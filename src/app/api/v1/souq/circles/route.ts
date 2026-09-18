import { mutationRoute, queryRoute } from "@/lib/http/with-route";
import { createCircleSchema } from "@/domains/souq/schemas";
import { createCircle } from "@/domains/souq/application/souq-service";
import { listOpenCircleCards } from "@/domains/souq/application/souq-read";
import { db } from "@/db/client";

export const POST = mutationRoute({
  scope: "souq.circle.create",
  auth: ["seller"],
  body: createCircleSchema,
  handler: ({ tx, identity, body }) => createCircle(tx, identity, body),
});

export const GET = queryRoute({
  handler: async ({ url }) => {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 24) || 24, 50);
    const circles = await listOpenCircleCards(db, limit);
    return { circles };
  },
});
