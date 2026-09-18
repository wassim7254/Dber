import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { notifications } from "@/db/schema";
import { mutationRoute } from "@/lib/http/with-route";

export const POST = mutationRoute({
  scope: "notification.read",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: z.object({}).optional(),
  handler: async ({ tx, identity, params }) => {
    await tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, params.id), eq(notifications.userId, identity.userId)));
    return { read: true };
  },
});
