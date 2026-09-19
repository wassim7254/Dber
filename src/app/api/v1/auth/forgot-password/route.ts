import { requestPasswordReset } from "@/domains/identity/application/auth-service";
import { forgotPasswordSchema } from "@/domains/identity/schemas";
import { authRoute } from "@/lib/http/auth-route";

/**
 * Always returns a uniform response: the endpoint cannot be used to
 * discover whether an email is registered (§63).
 */
export const POST = authRoute({
  scope: "auth.forgot_password",
  body: forgotPasswordSchema,
  rateLimit: { limit: 5, windowMs: 10 * 60_000 },
  limitKey: (_req, body) => body.email,
  handler: async ({ body }) => {
    const result = await requestPasswordReset(body.email);
    return {
      accepted: true,
      emailDelivered: result.delivered,
      message: result.delivered
        ? "If an account exists for that email, a reset link is on its way."
        : "Reset emails are not configured on this deployment — contact support to reset your password.",
    };
  },
});

export const dynamic = "force-dynamic";
