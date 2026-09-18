import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";

import {
  groupBuyCircles,
  groupBuyParticipants,
  payments,
  souqProducts,
  users,
} from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import type { CircleState } from "@/domains/souq/domain/machine";

export type CircleRow = typeof groupBuyCircles.$inferSelect;
export type ParticipantRow = typeof groupBuyParticipants.$inferSelect;
export type SouqProductRow = typeof souqProducts.$inferSelect;

export async function getCircleById(executor: DbExecutor, circleId: string): Promise<CircleRow | null> {
  const [row] = await executor.select().from(groupBuyCircles).where(eq(groupBuyCircles.id, circleId)).limit(1);
  return row ?? null;
}

export async function lockCircle(tx: Tx, circleId: string): Promise<CircleRow | null> {
  const [row] = await tx
    .select()
    .from(groupBuyCircles)
    .where(eq(groupBuyCircles.id, circleId))
    .for("update")
    .limit(1);
  return row ?? null;
}

export async function getProductById(executor: DbExecutor, productId: string): Promise<SouqProductRow | null> {
  const [row] = await executor.select().from(souqProducts).where(eq(souqProducts.id, productId)).limit(1);
  return row ?? null;
}

/** State-conditional circle transition; returns null when the expected state no longer holds. */
export async function transitionCircleState(
  tx: Tx,
  input: { circleId: string; from: CircleState; to: CircleState },
): Promise<CircleRow | null> {
  const [row] = await tx
    .update(groupBuyCircles)
    .set({ state: input.to, updatedAt: new Date() })
    .where(and(eq(groupBuyCircles.id, input.circleId), eq(groupBuyCircles.state, input.from)))
    .returning();
  return row ?? null;
}

/** Participant payments for a circle in the given payment states. */
export async function listCirclePaymentsInStates(
  tx: Tx,
  circleId: string,
  states: readonly PaymentState[],
): Promise<{ id: string; state: PaymentState; amountMinor: number }[]> {
  const rows = await tx
    .select({
      id: payments.id,
      state: payments.state,
      amountMinor: payments.amountMinor,
    })
    .from(payments)
    .innerJoin(groupBuyParticipants, eq(payments.souqParticipantId, groupBuyParticipants.id))
    .where(and(eq(groupBuyParticipants.circleId, circleId), inArray(payments.state, [...states])));
  return rows;
}

export type PaymentState = (typeof payments.$inferSelect)["state"];

export async function listOpenCircles(executor: DbExecutor, limit: number): Promise<
  {
    id: string;
    title: string;
    category: string;
    images: string[];
    groupPriceMinor: number;
    listPriceMinor: number;
    currency: string;
    currentQuantity: number;
    targetQuantity: number;
    deadlineAt: Date;
    sellerName: string;
  }[]
> {
  return executor
    .select({
      id: groupBuyCircles.id,
      title: souqProducts.title,
      category: souqProducts.category,
      images: souqProducts.images,
      groupPriceMinor: groupBuyCircles.groupPriceMinor,
      listPriceMinor: groupBuyCircles.listPriceMinor,
      currency: groupBuyCircles.currency,
      currentQuantity: groupBuyCircles.currentQuantity,
      targetQuantity: groupBuyCircles.targetQuantity,
      deadlineAt: groupBuyCircles.deadlineAt,
      sellerName: users.displayName,
    })
    .from(groupBuyCircles)
    .innerJoin(souqProducts, eq(groupBuyCircles.productId, souqProducts.id))
    .innerJoin(users, eq(groupBuyCircles.sellerId, users.id))
    .where(eq(groupBuyCircles.state, "open"))
    .orderBy(asc(groupBuyCircles.deadlineAt))
    .limit(limit);
}

export async function listCirclesBySeller(executor: DbExecutor, sellerId: string): Promise<
  {
    id: string;
    title: string;
    state: CircleState;
    currentQuantity: number;
    targetQuantity: number;
    groupPriceMinor: number;
    currency: string;
    deadlineAt: Date;
  }[]
> {
  return executor
    .select({
      id: groupBuyCircles.id,
      title: souqProducts.title,
      state: groupBuyCircles.state,
      currentQuantity: groupBuyCircles.currentQuantity,
      targetQuantity: groupBuyCircles.targetQuantity,
      groupPriceMinor: groupBuyCircles.groupPriceMinor,
      currency: groupBuyCircles.currency,
      deadlineAt: groupBuyCircles.deadlineAt,
    })
    .from(groupBuyCircles)
    .innerJoin(souqProducts, eq(groupBuyCircles.productId, souqProducts.id))
    .where(eq(groupBuyCircles.sellerId, sellerId))
    .orderBy(desc(groupBuyCircles.createdAt))
    .limit(50);
}

export async function listProductsBySeller(executor: DbExecutor, sellerId: string): Promise<SouqProductRow[]> {
  return executor
    .select()
    .from(souqProducts)
    .where(eq(souqProducts.sellerId, sellerId))
    .orderBy(desc(souqProducts.createdAt))
    .limit(50);
}

export async function getParticipant(
  executor: DbExecutor,
  circleId: string,
  userId: string,
): Promise<ParticipantRow | null> {
  const [row] = await executor
    .select()
    .from(groupBuyParticipants)
    .where(and(eq(groupBuyParticipants.circleId, circleId), eq(groupBuyParticipants.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listParticipants(executor: DbExecutor, circleId: string): Promise<
  { id: string; userId: string; displayName: string; quantity: number; joinedAt: Date }[]
> {
  return executor
    .select({
      id: groupBuyParticipants.id,
      userId: groupBuyParticipants.userId,
      displayName: users.displayName,
      quantity: groupBuyParticipants.quantity,
      joinedAt: groupBuyParticipants.joinedAt,
    })
    .from(groupBuyParticipants)
    .innerJoin(users, eq(groupBuyParticipants.userId, users.id))
    .where(eq(groupBuyParticipants.circleId, circleId))
    .orderBy(asc(groupBuyParticipants.joinedAt))
    .limit(200);
}

/** Expiry scan input: open circles whose deadline has passed. */
export async function listExpiredOpenCircles(executor: DbExecutor, now: Date, limit: number): Promise<
  { id: string }[]
> {
  return executor
    .select({ id: groupBuyCircles.id })
    .from(groupBuyCircles)
    .where(and(eq(groupBuyCircles.state, "open"), lt(groupBuyCircles.deadlineAt, now)))
    .orderBy(asc(groupBuyCircles.deadlineAt))
    .limit(limit);
}

export async function countParticipants(executor: DbExecutor, circleId: string): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(groupBuyParticipants)
    .where(eq(groupBuyParticipants.circleId, circleId));
  return row?.count ?? 0;
}

export async function getCircleDetail(executor: DbExecutor, circleId: string): Promise<
  | (CircleRow & {
      productTitle: string;
      productDescription: string;
      productCategory: string;
      productImages: string[];
      sellerName: string;
    })
  | null
> {
  const [row] = await executor
    .select({
      circle: groupBuyCircles,
      productTitle: souqProducts.title,
      productDescription: souqProducts.description,
      productCategory: souqProducts.category,
      productImages: souqProducts.images,
      sellerName: users.displayName,
    })
    .from(groupBuyCircles)
    .innerJoin(souqProducts, eq(groupBuyCircles.productId, souqProducts.id))
    .innerJoin(users, eq(groupBuyCircles.sellerId, users.id))
    .where(eq(groupBuyCircles.id, circleId))
    .limit(1);
  if (!row) return null;
  return {
    ...row.circle,
    productTitle: row.productTitle,
    productDescription: row.productDescription,
    productCategory: row.productCategory,
    productImages: row.productImages,
    sellerName: row.sellerName,
  };
}

export async function participantOwnsActiveMembership(
  executor: DbExecutor,
  userId: string,
): Promise<{ circleId: string; state: CircleState }[]> {
  return executor
    .select({ circleId: groupBuyCircles.id, state: groupBuyCircles.state })
    .from(groupBuyParticipants)
    .innerJoin(groupBuyCircles, eq(groupBuyParticipants.circleId, groupBuyCircles.id))
    .where(and(eq(groupBuyParticipants.userId, userId), gt(groupBuyParticipants.quantity, 0)))
    .limit(50);
}
