import { cookies } from "next/headers";
import { z } from "zod";

import { isProduction } from "@/lib/config/env";
import { InternalError } from "@/lib/errors";
import type { Identity, Role } from "@/lib/auth/types";
import { USER_ROLES } from "@/lib/auth/types";

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
 * MVP development identity: plaintext headers. Hard-disabled outside
 * development/test so it can never authenticate production traffic.
 * The rest of the application depends only on Identity, never on these
 * headers, so a real identity provider replaces this function alone.
 */
export function resolveIdentityFromHeaders(headers: Headers): Identity | null {
  if (isProduction) {
    throw new InternalError("Development header identity is disabled in production");
  }
  return parseIdentity({ userId: headers.get(DEV_USER_ID_HEADER), role: headers.get(DEV_ROLE_HEADER) });
}

/** Browser-friendly variant used by server components (dev session cookies). */
export async function resolveIdentityFromCookies(): Promise<Identity | null> {
  if (isProduction) {
    throw new InternalError("Development cookie identity is disabled in production");
  }
  const jar = await cookies();
  return parseIdentity({ userId: jar.get(DEV_USER_ID_COOKIE)?.value ?? null, role: jar.get(DEV_ROLE_COOKIE)?.value ?? null });
}
