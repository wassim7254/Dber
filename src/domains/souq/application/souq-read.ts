import type { DbExecutor } from "@/db/tx";
import { asCurrency, type Currency } from "@/lib/money";
import { ResourceNotFoundError } from "@/lib/errors";
import {
  countParticipants,
  getCircleDetail,
  getParticipant,
  listCirclesBySeller,
  listOpenCircles,
  listParticipants,
  listProductsBySeller,
} from "@/domains/souq/infrastructure/souq-repository";

export interface CircleCardDto {
  id: string;
  title: string;
  category: string;
  images: string[];
  groupPriceMinor: number;
  listPriceMinor: number;
  currency: Currency;
  currentQuantity: number;
  targetQuantity: number;
  spotsRemaining: number;
  discountPercent: number;
  deadlineAt: string;
  sellerName: string;
}

export async function listOpenCircleCards(db: DbExecutor, limit = 24): Promise<CircleCardDto[]> {
  const rows = await listOpenCircles(db, limit);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    images: row.images,
    groupPriceMinor: row.groupPriceMinor,
    listPriceMinor: row.listPriceMinor,
    currency: asCurrency(row.currency),
    currentQuantity: row.currentQuantity,
    targetQuantity: row.targetQuantity,
    spotsRemaining: Math.max(0, row.targetQuantity - row.currentQuantity),
    discountPercent:
      row.listPriceMinor > 0
        ? Math.round(((row.listPriceMinor - row.groupPriceMinor) / row.listPriceMinor) * 100)
        : 0,
    deadlineAt: row.deadlineAt.toISOString(),
    sellerName: row.sellerName,
  }));
}

export interface CircleDetailDto extends CircleCardDto {
  description: string;
  state: string;
  sellerId: string;
  productId: string;
  minimumParticipants: number;
  participants: { id: string; displayName: string; quantity: number; joinedAt: string }[];
  viewerParticipation: { quantity: number; paymentStatus: string } | null;
}

export async function getCircleDetailView(
  db: DbExecutor,
  circleId: string,
  viewerId: string | null,
): Promise<CircleDetailDto> {
  const circle = await getCircleDetail(db, circleId);
  if (!circle) throw new ResourceNotFoundError("Group", circleId);
  const participants = await listParticipants(db, circle.id);
  const participation = viewerId ? await getParticipant(db, circle.id, viewerId) : null;
  return {
    id: circle.id,
    title: circle.productTitle,
    description: circle.productDescription,
    category: circle.productCategory,
    productId: circle.productId,
    images: circle.productImages,
    groupPriceMinor: circle.groupPriceMinor,
    listPriceMinor: circle.listPriceMinor,
    currency: asCurrency(circle.currency),
    currentQuantity: circle.currentQuantity,
    targetQuantity: circle.targetQuantity,
    spotsRemaining: Math.max(0, circle.targetQuantity - circle.currentQuantity),
    discountPercent:
      circle.listPriceMinor > 0
        ? Math.round(((circle.listPriceMinor - circle.groupPriceMinor) / circle.listPriceMinor) * 100)
        : 0,
    deadlineAt: circle.deadlineAt.toISOString(),
    sellerName: circle.sellerName,
    sellerId: circle.sellerId,
    state: circle.state,
    minimumParticipants: circle.minimumParticipants,
    participants: participants.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      quantity: p.quantity,
      joinedAt: p.joinedAt.toISOString(),
    })),
    viewerParticipation: participation
      ? { quantity: participation.quantity, paymentStatus: participation.paymentStatus }
      : null,
  };
}

export interface SellerCircleDto {
  id: string;
  title: string;
  state: string;
  currentQuantity: number;
  targetQuantity: number;
  groupPriceMinor: number;
  currency: Currency;
  deadlineAt: string;
}

export async function listSellerCircles(db: DbExecutor, sellerId: string): Promise<SellerCircleDto[]> {
  const rows = await listCirclesBySeller(db, sellerId);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    state: row.state,
    currentQuantity: row.currentQuantity,
    targetQuantity: row.targetQuantity,
    groupPriceMinor: row.groupPriceMinor,
    currency: asCurrency(row.currency),
    deadlineAt: row.deadlineAt.toISOString(),
  }));
}

export interface SellerProductDto {
  id: string;
  title: string;
  category: string;
  basePriceMinor: number;
  currency: Currency;
  status: string;
  createdAt: string;
}

export async function listSellerProducts(db: DbExecutor, sellerId: string): Promise<SellerProductDto[]> {
  const rows = await listProductsBySeller(db, sellerId);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    basePriceMinor: row.basePriceMinor,
    currency: asCurrency(row.currency),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getCircleParticipantCount(db: DbExecutor, circleId: string): Promise<number> {
  return countParticipants(db, circleId);
}
