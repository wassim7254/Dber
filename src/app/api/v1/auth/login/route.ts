import { login } from "@/domains/identity/application/auth-service";
import { loginSchema } from "@/domains/identity/schemas";
import { setSessionCookie } from "@/lib/auth/session";
import { authRoute } from "@/lib/http/auth-route";

export const POST = authRoute({
  scope: "auth.login",
  body: loginSchema,
  rateLimit: { limit: 10, windowMs: 5 * 60_000 },
  limitKey: (_req, body) => body.email,
  handler: async ({ body, req }) => {
    const result = await login(body, req.headers.get("user-agent") ?? "");
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
