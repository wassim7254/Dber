import { resetPassword } from "@/domains/identity/application/auth-service";
import { resetPasswordSchema } from "@/domains/identity/schemas";
import { authRoute } from "@/lib/http/auth-route";

export const POST = authRoute({
  scope: "auth.reset_password",
  body: resetPasswordSchema,
  rateLimit: { limit: 10, windowMs: 5 * 60_000 },
  handler: async ({ body }) => {
    await resetPassword(body.token, body.password);
    return { reset: true, message: "Your password has been updated. Sign in with your new password." };
  },
});

export const dynamic = "force-dynamic";
