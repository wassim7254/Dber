import { z } from "zod";

import { listMessages, postMessage } from "@/domains/engagement/messaging-service";
import { db } from "@/db/client";
import { mutationRoute, queryRoute } from "@/lib/http/with-route";

export const GET = queryRoute({
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  handler: async ({ identity, url }) => {
    if (!identity) throw new Error("unreachable");
    const entityType = z.enum(["souq_circle", "khidma_booking", "kraya_booking"]).parse(url.searchParams.get("entityType"));
    const entityId = z.uuid().parse(url.searchParams.get("entityId"));
    const messages = await listMessages(db, identity, entityType, entityId);
    return { messages };
  },
});

export const POST = mutationRoute({
  scope: "messages.post",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: z.object({
    entityType: z.enum(["souq_circle", "khidma_booking", "kraya_booking"]),
    entityId: z.uuid(),
    body: z.string().trim().min(1).max(2000),
  }),
  handler: ({ tx, identity, body }) => postMessage(tx, identity, body),
});
