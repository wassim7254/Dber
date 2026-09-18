import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createRequestContext, runWithRequestContext } from "@/infrastructure/request-context/request-context";
import {
  DEV_ROLE_COOKIE,
  DEV_USER_ID_COOKIE,
} from "@/lib/auth/identity";
import { isDevelopment } from "@/lib/config/env";
import { fail } from "@/lib/http/envelope";
import { enforceRateLimit } from "@/lib/http/rate-limit";

const sessionSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["buyer", "seller", "professional", "ops_admin", "admin"]),
});

/** Dev-only session bootstrap for browser flows (the header auth is API-only). */
export async function POST(request: Request): Promise<Response> {
  return runWithRequestContext(createRequestContext({ kind: "http" }), async () => {
    if (!isDevelopment) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Dev sessions are disabled" } }, { status: 403 });
    }
    try {
      enforceRateLimit("dev-session", 60, 60_000);
      const body = sessionSchema.parse(await request.json());
      const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, body.userId)).limit(1);
      if (!user || user.role !== body.role) {
        return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Unknown user or role mismatch" } }, { status: 400 });
      }
      const response = NextResponse.json({ data: { userId: user.id, role: user.role }, requestId: "dev" });
      response.cookies.set(DEV_USER_ID_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      response.cookies.set(DEV_ROLE_COOKIE, user.role, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
      return response;
    } catch (error) {
      return fail(error);
    }
  });
}

export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ data: { signedOut: true }, requestId: "dev" });
  response.cookies.delete(DEV_USER_ID_COOKIE);
  response.cookies.delete(DEV_ROLE_COOKIE);
  return response;
}
