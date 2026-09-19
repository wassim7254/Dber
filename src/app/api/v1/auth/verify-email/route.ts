import { verifyEmail } from "@/domains/identity/application/auth-service";
import { verifyEmailSchema } from "@/domains/identity/schemas";
import { authRoute } from "@/lib/http/auth-route";

export const POST = authRoute({
  scope: "auth.verify_email",
  body: verifyEmailSchema,
  rateLimit: { limit: 10, windowMs: 5 * 60_000 },
  handler: async ({ body }) => {
    await verifyEmail(body.token);
    return { verified: true, message: "Your email address is confirmed." };
  },
});

export const dynamic = "force-dynamic";
