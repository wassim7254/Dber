import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isProduction } from "@/lib/config/env";
import { InternalError, UnauthorizedError } from "@/lib/errors";
import type { Identity, ParticipantRole, Role } from "@/lib/auth/types";
import { USER_ROLES } from "@/lib/auth/types";
import { listUserRoles } from "@/domains/identity/application/role-service";
import { resolveSessionIdentity, SESSION_COOKIE } from "@/lib/auth/session";

const identitySchema = z.object({
  userId: z.uuid(),
  role: z.enum(USER_ROLES),
});

export const DEV_USER_ID_HEADER = "x-dber-user-id";
export const DEV_ROLE_HEADER = "x-dber-role";
export const DEV_USER_ID_COOKIE = "dber_user_id";
export const DEV_ROLE_COOKIE = "dber_role";

function parseIdentity(raw: { userId: string | null; role: string | null }): Identity | null {
  if (raw.userId === null || raw.role === null) return null;
  const parsed = identitySchema.safeParse({ userId: raw.userId, role: raw.role });
  if (!parsed.success) return null;
  return { userId: parsed.data.userId, role: parsed.data.role satisfies Role };
}

/** Shared by header-based and cookie-based dev identity resolution. */
export const parseIdentityRaw = parseIdentity;

/**
 * Development header identity. Hard-disabled outside development/test so it
 * can never authenticate production traffic (§50).
 */
export function resolveIdentityFromHeaders(headers: Headers): Identity | null {
  if (isProduction) {
    throw new InternalError("Development header identity is disabled in production");
  }
  return parseIdentity({ userId: headers.get(DEV_USER_ID_HEADER), role: headers.get(DEV_ROLE_HEADER) });
}

export { resolveSessionIdentity, SESSION_COOKIE };

/**
 * The authentication boundary (§3). The rest of the application depends only
 * on Identity — never on the mechanism that produced it:
 *  1. server-side session cookie (all environments),
 *  2. development headers / dev cookies (development and test only).
 */
export async function authenticate(): Promise<Identity | null> {
  const jar = await cookies();
  const session = await resolveSessionIdentity(jar.get(SESSION_COOKIE)?.value);
  if (session) return session.identity;
  if (isProduction) return null;
  return parseIdentity({
    userId: jar.get(DEV_USER_ID_COOKIE)?.value ?? null,
    role: jar.get(DEV_ROLE_COOKIE)?.value ?? null,
  });
}

export async function requireAuth(): Promise<Identity> {
  const identity = await authenticate();
  if (!identity) throw new UnauthorizedError();
  return identity;
}

export interface CurrentUser extends Identity {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  country: string | null;
  locale: string;
  hasPassword: boolean;
  /** All marketplace roles this account can switch into (§38). */
  roles: ParticipantRole[];
}

/** Identity + profile fields for UI surfaces. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const identity = await authenticate();
  if (!identity) return null;
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      phone: users.phone,
      country: users.country,
      locale: users.locale,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);
  if (!row) return null;
  const entitlements = await listUserRoles(db, row.id);
  return {
    userId: row.id,
    role: row.role,
    displayName: row.displayName,
    email: row.email,
    emailVerified: row.emailVerifiedAt !== null,
    phone: row.phone,
    country: row.country,
    locale: row.locale,
    hasPassword: row.passwordHash !== null,
    roles: entitlements.length > 0 ? entitlements : [row.role as ParticipantRole],
  };
}
