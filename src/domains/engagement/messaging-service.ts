import { and, eq, asc } from "drizzle-orm";

import { groupBuyParticipants, khidmaBookings, messages, rentalBookings, krayaAssets, users } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import type { Identity } from "@/lib/auth/types";
import { ForbiddenError, ResourceNotFoundError } from "@/lib/errors";

export type MessageEntityType = "souq_circle" | "khidma_booking" | "kraya_booking";

export interface MessageDto {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/**
 * Contextual communication (§28): messages are attached to a business object
 * and only its parties (plus admins) may read or write. No free chat.
 */
export async function assertMessageParticipant(
  db: DbExecutor,
  identity: Identity,
  entityType: MessageEntityType,
  entityId: string,
): Promise<void> {
  if (identity.role === "admin" || identity.role === "ops_admin") return;
  if (entityType === "souq_circle") {
    const participation = await db
      .select({ id: groupBuyParticipants.id })
      .from(groupBuyParticipants)
      .where(and(eq(groupBuyParticipants.circleId, entityId), eq(groupBuyParticipants.userId, identity.userId)))
      .limit(1);
    if (participation.length > 0) return;
    throw new ForbiddenError("Only the seller and participants of this group can use its thread");
  }
  if (entityType === "khidma_booking") {
    const [booking] = await db
      .select({ buyerId: khidmaBookings.buyerId, professionalId: khidmaBookings.professionalId })
      .from(khidmaBookings)
      .where(eq(khidmaBookings.id, entityId))
      .limit(1);
    if (!booking) throw new ResourceNotFoundError("Booking", entityId);
    if (booking.buyerId !== identity.userId && booking.professionalId !== identity.userId) {
      throw new ForbiddenError("Only the customer and professional of this booking can use its thread");
    }
    return;
  }
  const [rental] = await db
    .select({ renterId: rentalBookings.renterId, ownerId: krayaAssets.ownerId })
    .from(rentalBookings)
    .innerJoin(krayaAssets, eq(krayaAssets.id, rentalBookings.assetId))
    .where(eq(rentalBookings.id, entityId))
    .limit(1);
  if (!rental) throw new ResourceNotFoundError("Rental", entityId);
  if (rental.renterId !== identity.userId && rental.ownerId !== identity.userId) {
    throw new ForbiddenError("Only the renter and owner of this rental can use its thread");
  }
}

export async function listMessages(
  db: DbExecutor,
  identity: Identity,
  entityType: MessageEntityType,
  entityId: string,
): Promise<MessageDto[]> {
  await assertMessageParticipant(db, identity, entityType, entityId);
  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderName: users.displayName,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.entityType, entityType), eq(messages.entityId, entityId)))
    .orderBy(asc(messages.createdAt))
    .limit(200);
  return rows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    senderName: row.senderName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function postMessage(
  tx: Tx,
  identity: Identity,
  input: { entityType: MessageEntityType; entityId: string; body: string },
): Promise<{ messageId: string }> {
  await assertMessageParticipant(tx, identity, input.entityType, input.entityId);
  const [row] = await tx
    .insert(messages)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      senderId: identity.userId,
      body: input.body.trim(),
    })
    .returning({ id: messages.id });
  return { messageId: row.id };
}
