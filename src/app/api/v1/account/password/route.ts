import { changePassword } from "@/domains/identity/application/auth-service";
import { changePasswordSchema } from "@/domains/identity/schemas";
import { readSessionCookie, resolveSessionIdentity } from "@/lib/auth/session";
import { mutationRoute } from "@/lib/http/with-route";

/**
 * Change password (signed-in user). All other sessions are revoked; the
 * current one survives so the user is not signed out of this device.
 */
export const POST = mutationRoute({
  scope: "account.change_password",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: changePasswordSchema,
  rateLimit: { limit: 5, windowMs: 10 * 60_000 },
  handler: async ({ body, identity }) => {
    const token = await readSessionCookie();
    const session = await resolveSessionIdentity(token);
    await changePassword(
      identity,
      body.currentPassword,
      body.newPassword,
      session?.sessionId,
    );
    return { changed: true, message: "Your password has been updated. Other sessions were signed out." };
  },
});
