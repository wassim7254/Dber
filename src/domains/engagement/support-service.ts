import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { supportRequests, users } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import type { Identity } from "@/lib/auth/types";
import { ResourceNotFoundError } from "@/lib/errors";
import type { JsonObject } from "@/types/json";

export const createSupportSchema = z.object({
  subject: z.string().trim().min(4).max(200),
  body: z.string().trim().min(10).max(5000),
  entityType: z
    .enum(["souq_circle", "khidma_booking", "kraya_booking", "payment"])
    .optional(),
  entityId: z.string().uuid().optional(),
});

export const updateSupportSchema = z.object({
  state: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export interface SupportRequestDto {
  id: string;
  userId: string;
  userName: string;
  subject: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  state: string;
  resolutionNote: string | null;
  createdAt: string;
}

function toDto(row: {
  id: string;
  userId: string;
  userName: string | null;
  subject: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  state: string;
  resolutionNote: string | null;
  createdAt: Date;
}): SupportRequestDto {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName ?? "Unknown",
    subject: row.subject,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    state: row.state,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createSupportRequest(
  tx: Tx,
  identity: Identity,
  input: z.infer<typeof createSupportSchema>,
): Promise<{ requestId: string }> {
  const [row] = await tx
    .insert(supportRequests)
    .values({
      userId: identity.userId,
      subject: input.subject,
      body: input.body,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      state: "open",
    })
    .returning({ id: supportRequests.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "support.request_created",
    entityType: "user",
    entityId: identity.userId,
    metadata: { supportRequestId: row.id, subject: input.subject } as JsonObject,
  });
  return { requestId: row.id };
}

export async function listMySupportRequests(db: DbExecutor, userId: string): Promise<SupportRequestDto[]> {
  const rows = await db
    .select({
      id: supportRequests.id,
      userId: supportRequests.userId,
      userName: users.displayName,
      subject: supportRequests.subject,
      body: supportRequests.body,
      entityType: supportRequests.entityType,
      entityId: supportRequests.entityId,
      state: supportRequests.state,
      resolutionNote: supportRequests.resolutionNote,
      createdAt: supportRequests.createdAt,
    })
    .from(supportRequests)
    .innerJoin(users, eq(users.id, supportRequests.userId))
    .where(eq(supportRequests.userId, userId))
    .orderBy(desc(supportRequests.createdAt))
    .limit(50);
  return rows.map(toDto);
}

export async function listOpenSupportRequests(db: DbExecutor, limit = 50): Promise<SupportRequestDto[]> {
  const rows = await db
    .select({
      id: supportRequests.id,
      userId: supportRequests.userId,
      userName: users.displayName,
      subject: supportRequests.subject,
      body: supportRequests.body,
      entityType: supportRequests.entityType,
      entityId: supportRequests.entityId,
      state: supportRequests.state,
      resolutionNote: supportRequests.resolutionNote,
      createdAt: supportRequests.createdAt,
    })
    .from(supportRequests)
    .innerJoin(users, eq(users.id, supportRequests.userId))
    .orderBy(desc(supportRequests.createdAt))
    .limit(limit);
  return rows.map(toDto);
}

export async function updateSupportRequest(
  tx: Tx,
  identity: Identity,
  requestId: string,
  input: z.infer<typeof updateSupportSchema>,
): Promise<{ updated: boolean }> {
  const [existing] = await tx.select().from(supportRequests).where(eq(supportRequests.id, requestId)).limit(1);
  if (!existing) throw new ResourceNotFoundError("Support request", requestId);
  const [updated] = await tx
    .update(supportRequests)
    .set({
      state: input.state,
      resolutionNote: input.resolutionNote ?? existing.resolutionNote,
      handledBy: identity.userId,
      updatedAt: new Date(),
    })
    .where(eq(supportRequests.id, requestId))
    .returning({ id: supportRequests.id });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "support.request_updated",
    entityType: "user",
    entityId: existing.userId,
    before: { state: existing.state },
    after: { state: input.state },
    metadata: { supportRequestId: requestId, note: input.resolutionNote } as JsonObject,
  });
  return { updated: updated !== undefined };
}
