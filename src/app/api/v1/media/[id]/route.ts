import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { uploads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { storage } from "@/infrastructure/storage/adapter";

/** Serves uploaded media by id. Public read (listing images are public). */
export async function GET(_req: Request, segment: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await segment.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  try {
    const { bytes } = await storage.get(row.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": row.mimeType,
        "content-length": String(row.sizeBytes),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Media unavailable", { status: 503 });
  }
}
