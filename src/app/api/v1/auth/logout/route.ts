import { clearSessionCookie, readSessionCookie, resolveSessionIdentity, revokeSession } from "@/lib/auth/session";
import { authRoute } from "@/lib/http/auth-route";
import { z } from "zod";

export const POST = authRoute({
  scope: "auth.logout",
  body: z.object({}).default({}),
  rateLimit: { limit: 30, windowMs: 60_000 },
  handler: async () => {
    const token = await readSessionCookie();
    const session = await resolveSessionIdentity(token);
    if (session) {
      await revokeSession(session.sessionId);
    }
    await clearSessionCookie();
    return { signedOut: true };
  },
});

export const dynamic = "force-dynamic";
