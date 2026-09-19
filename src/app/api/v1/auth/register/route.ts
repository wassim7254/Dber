import { register } from "@/domains/identity/application/auth-service";
import { registerSchema } from "@/domains/identity/schemas";
import { setSessionCookie } from "@/lib/auth/session";
import { authRoute } from "@/lib/http/auth-route";

export const POST = authRoute({
  scope: "auth.register",
  body: registerSchema,
  rateLimit: { limit: 5, windowMs: 10 * 60_000 },
  handler: async ({ body, req }) => {
    const result = await register(body, req.headers.get("user-agent") ?? "");
    if (result.sessionToken && result.sessionExpiresAt) {
      await setSessionCookie(result.sessionToken, result.sessionExpiresAt);
    }
    return {
      userId: result.identity.userId,
      role: result.role,
      displayName: result.displayName,
      email: result.email,
      emailVerified: result.emailVerified,
    };
  },
});

export const dynamic = "force-dynamic";
