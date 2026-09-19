import { resendVerificationEmail } from "@/domains/identity/application/auth-service";
import { mutationRoute } from "@/lib/http/with-route";
import { z } from "zod";

export const POST = mutationRoute({
  scope: "account.resend_verification",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: z.object({}).default({}),
  rateLimit: { limit: 3, windowMs: 10 * 60_000 },
  handler: async ({ identity }) => {
    const result = await resendVerificationEmail(identity);
    return {
      accepted: true,
      delivered: result.delivered,
      message: result.delivered
        ? "A fresh verification email is on its way."
        : "Email delivery is not configured on this deployment — contact support.",
    };
  },
});
