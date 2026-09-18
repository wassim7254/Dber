import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { isDevelopment } from "@/lib/config/env";

/** Lists seeded dev users for the development account switcher. */
export async function GET(): Promise<Response> {
  if (!isDevelopment) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Disabled" } }, { status: 403 });
  }
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    .orderBy(asc(users.createdAt))
    .limit(50);
  return NextResponse.json({ data: { users: rows }, requestId: "dev" });
}
