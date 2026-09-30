import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationPreferences, users } from "@/db/schema";
import { profileUpdateSchema } from "@/domains/identity/schemas";
import { recordAudit } from "@/infrastructure/audit/writer";
import { mutationRoute } from "@/lib/http/with-route";

const bodySchema = profileUpdateSchema.extend({
  emailNotificationsEnabled: z.boolean().optional(),
});

/** Updates the signed-in user's personal information (§37). */
export const POST = mutationRoute({
  scope: "account.profile.update",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: bodySchema,
  handler: async ({ body, identity, tx }) => {
    const [before] = await tx
      .select({
        displayName: users.displayName,
        phone: users.phone,
        country: users.country,
        city: users.city,
        locale: users.locale,
      })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);

    await tx
      .update(users)
      .set({
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, identity.userId));

    if (body.emailNotificationsEnabled !== undefined) {
      await tx
        .insert(notificationPreferences)
        .values({ userId: identity.userId, emailEnabled: body.emailNotificationsEnabled })
        .onConflictDoUpdate({
          target: notificationPreferences.userId,
          set: { emailEnabled: body.emailNotificationsEnabled, updatedAt: new Date() },
        });
    }

    await recordAudit(tx, {
      actorId: identity.userId,
      actorRole: identity.role,
      action: "user.profile_updated",
      entityType: "user",
      entityId: identity.userId,
      before: before ?? null,
      after: {
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.country !== undefined ? { country: body.country } : {}),
        ...(body.city !== undefined ? { city: body.city } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      },
    });

    return { updated: true };
  },
});
