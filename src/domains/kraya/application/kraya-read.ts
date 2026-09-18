import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import type { DbExecutor } from "@/db/tx";
import { ResourceNotFoundError } from "@/lib/errors";
import { buildRentalCheckoutLines } from "@/domains/kraya/domain/policy";
import {
  getAssetById,
  getBookingById,
  getContract,
  listActiveAssets,
  listAssetsByOwner,
  listBookedRanges,
  listBookingsForOwner,
  listBookingsForRenter,
} from "@/domains/kraya/infrastructure/kraya-repository";

export interface RentalCardDto {
  id: string;
  title: string;
  description: string;
  category: string;
  dailyRateMinor: number;
  depositMinor: number;
  currency: string;
  location: string;
  images: string[];
  ownerName: string;
}

export async function listRentalCards(db: DbExecutor, search: string | null, limit = 24): Promise<RentalCardDto[]> {
  return listActiveAssets(db, search, limit);
}

export interface RentalDetailDto extends RentalCardDto {
  capacity: number | null;
  ownerId: string;
  bookedRanges: { start: string; end: string }[];
}

export async function getRentalDetail(db: DbExecutor, assetId: string): Promise<RentalDetailDto> {
  const asset = await getAssetById(db, assetId);
  if (!asset) throw new ResourceNotFoundError("Rental", assetId);
  const ranges = await listBookedRanges(db, assetId);
  const [owner] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, asset.ownerId)).limit(1);
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    category: asset.category,
    dailyRateMinor: asset.dailyRateMinor,
    depositMinor: asset.depositMinor,
    currency: asset.currency,
    location: asset.location,
    images: asset.images,
    ownerName: owner?.name ?? "",
    capacity: asset.capacity,
    ownerId: asset.ownerId,
    bookedRanges: ranges.map((range) => ({
      start: range.startTime.toISOString(),
      end: range.endTime.toISOString(),
    })),
  };
}

export interface RentalBookingDto {
  id: string;
  assetId: string;
  state: string;
  startTime: string;
  endTime: string;
  totalChargeMinor: number;
  depositMinor: number;
  dailyRateMinor: number;
  currency: string;
  renterId: string;
  createdAt: string;
}

export function toRentalBookingDto(booking: {
  id: string;
  assetId: string;
  state: string;
  startTime: Date;
  endTime: Date;
  totalChargeMinor: number;
  depositSnapshotMinor: number;
  dailyRateSnapshotMinor: number;
  currency: string;
  renterId: string;
  createdAt: Date;
}): RentalBookingDto {
  return {
    id: booking.id,
    assetId: booking.assetId,
    state: booking.state,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    totalChargeMinor: booking.totalChargeMinor,
    depositMinor: booking.depositSnapshotMinor,
    dailyRateMinor: booking.dailyRateSnapshotMinor,
    currency: booking.currency,
    renterId: booking.renterId,
    createdAt: booking.createdAt.toISOString(),
  };
}

export async function listRenterBookings(db: DbExecutor, renterId: string): Promise<RentalBookingDto[]> {
  const rows = await listBookingsForRenter(db, renterId);
  return rows.map(toRentalBookingDto);
}

export async function listOwnerBookings(db: DbExecutor, ownerId: string): Promise<RentalBookingDto[]> {
  const rows = await listBookingsForOwner(db, ownerId);
  return rows.map(toRentalBookingDto);
}

export async function getRentalBookingView(db: DbExecutor, bookingId: string): Promise<RentalBookingDto> {
  const booking = await getBookingById(db, bookingId);
  if (!booking) throw new ResourceNotFoundError("Rental booking", bookingId);
  return toRentalBookingDto(booking);
}

export interface RentalQuoteView {
  days: number;
  dailyRateMinor: number;
  chargeMinor: number;
  depositMinor: number;
  totalAuthorizationMinor: number;
  lines: { label: string; amountMinor: number }[];
  currency: string;
}

/** Server-computed quote used by the detail page price breakdown (§49). */
export function quoteRentalView(input: {
  dailyRateMinor: number;
  depositMinor: number;
  start: Date;
  end: Date;
  currency: string;
}): RentalQuoteView {
  const quote = computeQuoteSafe(input.dailyRateMinor, input.depositMinor, input.start, input.end);
  return {
    days: quote.days,
    dailyRateMinor: input.dailyRateMinor,
    chargeMinor: quote.chargeMinor,
    depositMinor: quote.depositMinor,
    totalAuthorizationMinor: quote.totalAuthorizationMinor,
    lines: buildRentalCheckoutLines({
      dailyRateMinor: input.dailyRateMinor,
      days: quote.days,
      depositMinor: input.depositMinor,
    }),
    currency: input.currency,
  };
}

import { computeRentalQuote } from "@/lib/money";

function computeQuoteSafe(
  dailyRateMinor: number,
  depositMinor: number,
  start: Date,
  end: Date,
): { days: number; chargeMinor: number; depositMinor: number; totalAuthorizationMinor: number } {
  if (end.getTime() <= start.getTime()) {
    return { days: 1, chargeMinor: dailyRateMinor, depositMinor, totalAuthorizationMinor: dailyRateMinor + depositMinor };
  }
  return computeRentalQuote({ dailyRateMinor, depositMinor, start, end });
}

export interface RentalContractView {
  version: number;
  terms: Record<string, string>;
  assetSnapshot: Record<string, string>;
  priceSnapshotMinor: number;
  depositSnapshotMinor: number;
  cancellationPolicy: string;
  acceptedAt: string;
}

export async function getContractView(db: DbExecutor, bookingId: string): Promise<RentalContractView | null> {
  const contract = await getContract(db, bookingId);
  if (!contract) return null;
  return {
    version: contract.version,
    terms: contract.terms,
    assetSnapshot: contract.assetSnapshot,
    priceSnapshotMinor: contract.priceSnapshotMinor,
    depositSnapshotMinor: contract.depositSnapshotMinor,
    cancellationPolicy: contract.cancellationPolicy,
    acceptedAt: contract.acceptedAt.toISOString(),
  };
}

export async function listOwnerAssets(db: DbExecutor, ownerId: string): Promise<RentalCardDto[]> {
  const rows = await listAssetsByOwner(db, ownerId);
  return rows.map((asset) => ({
    id: asset.id,
    title: asset.title,
    description: asset.description,
    category: asset.category,
    dailyRateMinor: asset.dailyRateMinor,
    depositMinor: asset.depositMinor,
    currency: asset.currency,
    location: asset.location,
    images: asset.images,
    ownerName: "",
  }));
}
