import { and, desc, eq, sql } from "drizzle-orm";

import {
  groupBuyCircles,
  groupBuyParticipants,
  khidmaBookings,
  krayaAssets,
  rentalBookings,
  reviews,
} from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import type { Identity } from "@/lib/auth/types";
import { ConflictError, ForbiddenError, ResourceNotFoundError, ValidationError } from "@/lib/errors";
import { asPgError } from "@/lib/persistence/pg-errors";
import type { JsonObject } from "@/types/json";

export type ReviewEntityType = "souq_circle" | "khidma_booking" | "kraya_booking";

export interface CreateReviewInput {
  entityType: ReviewEntityType;
  entityId: string;
  rating: number;
  title?: string;
  body?: string;
}

interface ReviewTarget {
  subjectId: string;
  label: string;
}

/**
 * Resolves the review target and enforces the "real transaction" rule (§35):
 * only completed transactions, only the paying customer as author, and the
 * subject is always the provider — never self-review, never arbitrary.
 */
async function resolveReviewTarget(tx: Tx, identity: Identity, input: CreateReviewInput): Promise<ReviewTarget> {
  if (input.entityType === "souq_circle") {
    const [circle] = await tx.select().from(groupBuyCircles).where(eq(groupBuyCircles.id, input.entityId)).limit(1);
    if (!circle) throw new ResourceNotFoundError("Group", input.entityId);
    if (circle.state !== "completed") {
      throw new ConflictError("Reviews open once the group order is completed");
    }
    const [participant] = await tx
      .select({ id: groupBuyParticipants.id })
      .from(groupBuyParticipants)
      .where(and(eq(groupBuyParticipants.circleId, circle.id), eq(groupBuyParticipants.userId, identity.userId)))
      .limit(1);
    if (!participant) throw new ForbiddenError("Only participants of this group can review it");
    return { subjectId: circle.sellerId, label: "group" };
  }
  if (input.entityType === "khidma_booking") {
    const [booking] = await tx.select().from(khidmaBookings).where(eq(khidmaBookings.id, input.entityId)).limit(1);
    if (!booking) throw new ResourceNotFoundError("Booking", input.entityId);
    if (booking.state !== "completed") {
      throw new ConflictError("Reviews open once the service is completed");
    }
    if (booking.buyerId !== identity.userId) {
      throw new ForbiddenError("Only the customer of this booking can review it");
    }
    return { subjectId: booking.professionalId, label: "booking" };
  }
  const [rental] = await tx.select().from(rentalBookings).where(eq(rentalBookings.id, input.entityId)).limit(1);
  if (!rental) throw new ResourceNotFoundError("Rental", input.entityId);
  if (rental.state !== "completed") {
    throw new ConflictError("Reviews open once the rental is completed");
  }
  if (rental.renterId !== identity.userId) {
    throw new ForbiddenError("Only the renter of this rental can review it");
  }
  const [asset] = await tx.select({ ownerId: krayaAssets.ownerId }).from(krayaAssets).where(eq(krayaAssets.id, rental.assetId)).limit(1);
  if (!asset) throw new ResourceNotFoundError("Rental", rental.assetId);
  return { subjectId: asset.ownerId, label: "rental" };
}

export async function createReview(tx: Tx, identity: Identity, input: CreateReviewInput): Promise<{ reviewId: string }> {
  if (input.rating < 1 || input.rating > 5) {
    throw new ValidationError("Rating must be between 1 and 5");
  }
  const target = await resolveReviewTarget(tx, identity, input);
  if (target.subjectId === identity.userId) {
    throw new ConflictError("You cannot review your own listing");
  }
  try {
    const [review] = await tx
      .insert(reviews)
      .values({
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: identity.userId,
        subjectId: target.subjectId,
        rating: input.rating,
        title: input.title?.slice(0, 200) ?? "",
        body: input.body?.slice(0, 4000) ?? "",
      })
      .returning({ id: reviews.id });
    await recordAudit(tx, {
      actorId: identity.userId,
      actorRole: identity.role,
      action: "review.created",
      entityType: "user",
      entityId: target.subjectId,
      metadata: {
        reviewId: review.id,
        entityType: input.entityType,
        entityId: input.entityId,
        rating: input.rating,
      } as JsonObject,
    });
    return { reviewId: review.id };
  } catch (error) {
    // UNIQUE(entity_type, entity_id, author_id): one review per author per transaction.
    const pgError = asPgError(error);
    if (pgError?.code === "23505") {
      throw new ConflictError("You already reviewed this transaction");
    }
    throw error;
  }
}

export interface ReviewCardDto {
  id: string;
  rating: number;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export async function listReviewsForSubject(db: DbExecutor, subjectId: string, limit = 8): Promise<ReviewCardDto[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      createdAt: reviews.createdAt,
      authorName: sql<string>`coalesce((select display_name from users where users.id = ${reviews.authorId}), 'DBER customer')`,
    })
    .from(reviews)
    .where(eq(reviews.subjectId, subjectId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getSubjectRating(db: DbExecutor, subjectId: string): Promise<{ average: number | null; count: number }> {
  const [row] = await db
    .select({
      average: sql<number | null>`avg(${reviews.rating})`,
      count: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .where(eq(reviews.subjectId, subjectId));
  return {
    average: row?.average !== null && row?.average !== undefined ? Number(row.average) : null,
    count: row?.count ?? 0,
  };
}
