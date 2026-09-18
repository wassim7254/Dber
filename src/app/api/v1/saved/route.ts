import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { savedItems } from "@/db/schema";
import { mutationRoute } from "@/lib/http/with-route";

const toggleSavedSchema = z.object({
  entityType: z.enum(["souq_product", "khidma_service", "kraya_asset", "professional"]),
  entityId: z.uuid(),
});

/** Toggles a saved item for the signed-in user (user preference, not a financial mutation). */
export const POST = mutationRoute({
  scope: "saved.toggle",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: toggleSavedSchema,
  handler: async ({ tx, identity, body }) => {
    const existing = await tx
      .select({ id: savedItems.id })
      .from(savedItems)
      .where(
        and(
          eq(savedItems.userId, identity.userId),
          eq(savedItems.entityType, body.entityType),
          eq(savedItems.entityId, body.entityId),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      await tx.delete(savedItems).where(eq(savedItems.id, existing[0].id));
      return { saved: false };
    }
    await tx.insert(savedItems).values({
      userId: identity.userId,
      entityType: body.entityType,
      entityId: body.entityId,
    });
    return { saved: true };
  },
});
