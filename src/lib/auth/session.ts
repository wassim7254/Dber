import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";

import { db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import type { DbExecutor } from "@/db/tx";
import { isProduction } from "@/lib/config/env";
import type { Identity } from "@/lib/auth/types";

export const SESSION_COOKIE = "dber_session";
const SESSION_TTL_MS = 30 * 24 * 3_600_000; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a server-side session and returns the opaque cookie token. The
 * database stores only the SHA-256 of the token, so a database leak cannot
 * be replayed as a valid session.
 */
export async function createSession(
  userId: string,
  userAgent: string,
  executor: DbExecutor = db,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await executor.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    userAgent: userAgent.slice(0, 300),
    expiresAt,
  });
  return { token, expiresAt };
}

export interface ResolvedSession {
  identity: Identity;
  sessionId: string;
}

/**
 * Resolves the signed-in identity from the session cookie. Returns null when
 * the cookie is absent, the session is expired/revoked, or the account is
 * suspended.
 */
export async function resolveSessionIdentity(token: string | undefined): Promise<ResolvedSession | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      role: users.role,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.status !== "active") return null;
  return { identity: { userId: row.userId, role: row.role }, sessionId: row.sessionId };
}

export async function touchSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Revokes every active session of a user, optionally sparing one (the current). */
export async function revokeAllSessionsForUser(userId: string, exceptSessionId?: string): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  const targets = rows.filter((row) => row.id !== exceptSessionId);
  for (const row of targets) {
    await revokeSession(row.id);
  }
  return targets.length;
}

/** Housekeeping job support: expired sessions are operational data, not records. */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, new Date()), lt(sessions.revokedAt, new Date(Date.now() - 7 * 24 * 3_600_000))))
    .returning({ id: sessions.id });
  return deleted.length;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: isProduction, path: "/", maxAge: 0 });
}

export async function readSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

/**
 * Lists active sessions for the security page. The raw token is never
 * returned — only metadata the user can reason about.
 */
export async function listActiveSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sessions.lastUsedAt);
}
