import { z } from "zod";

import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { listActiveSessions, readSessionCookie, resolveSessionIdentity, revokeSession } from "@/lib/auth/session";
import { ResourceNotFoundError, UnauthorizedError } from "@/lib/errors";
import { mutationRoute, queryRoute } from "@/lib/http/with-route";

/** Lists active sessions for the security page. */
export const GET = queryRoute({
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  handler: async ({ identity }) => {
    if (!identity) throw new UnauthorizedError();
    const current = await resolveSessionIdentity(await readSessionCookie());
    const rows = await listActiveSessions(identity.userId);
    return {
      currentSessionId: current?.sessionId ?? null,
      sessions: rows,
    };
  },
});

/** Revoke one of the caller's own sessions. */
export const POST = mutationRoute({
  scope: "account.sessions.revoke",
  auth: ["buyer", "seller", "professional", "ops_admin", "admin"],
  body: z.object({ sessionId: z.uuid() }),
  handler: async ({ body, identity }) => {
    const [row] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, body.sessionId), eq(sessions.userId, identity.userId)))
      .limit(1);
    if (!row) throw new ResourceNotFoundError("Session", body.sessionId);
    await revokeSession(row.id);
    return { revoked: true };
  },
});
