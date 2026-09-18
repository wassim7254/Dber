import { eq } from "drizzle-orm";

import { users } from "@/db/schema";
import type { DbExecutor } from "@/db/tx";
import { ResourceNotFoundError } from "@/lib/errors";
import {
  getBookingById,
  getRequestById,
  listActiveServices,
  listAvailability,
  listBookingsForBuyer,
  listBookingsForProfessional,
  listOpenRequestsForProfessional,
  listQuotesByProfessional,
  listQuotesForRequest,
  listRequestsForBuyer,
  listServicesByProfessional,
} from "@/domains/khidma/infrastructure/khidma-repository";

export interface KhidmaServiceCardDto {
  id: string;
  title: string;
  specialty: string;
  category: string;
  basePriceMinor: number;
  currency: string;
  durationMinutes: number;
  professionalId: string;
  professionalName: string;
}

export async function listServiceCards(db: DbExecutor, search: string | null, limit = 24): Promise<KhidmaServiceCardDto[]> {
  return listActiveServices(db, search, limit);
}

export interface ProfessionalProfileDto {
  professionalId: string;
  displayName: string;
  services: {
    id: string;
    title: string;
    specialty: string;
    description: string;
    category: string;
    basePriceMinor: number;
    currency: string;
    durationMinutes: number;
  }[];
  availability: { weekday: number; startMinute: number; endMinute: number }[];
}

export async function getProfessionalProfile(
  db: DbExecutor,
  professionalId: string,
): Promise<ProfessionalProfileDto> {
  const [professional] = await db.select().from(users).where(eq(users.id, professionalId)).limit(1);
  if (!professional) throw new ResourceNotFoundError("Professional", professionalId);
  const services = await listServicesByProfessional(db, professionalId);
  const availability = await listAvailability(db, professionalId);
  return {
    professionalId,
    displayName: professional.displayName,
    services: services
      .filter((service) => service.status === "active")
      .map((service) => ({
        id: service.id,
        title: service.title,
        specialty: service.specialty,
        description: service.description,
        category: service.category,
        basePriceMinor: service.basePriceMinor,
        currency: service.currency,
        durationMinutes: service.durationMinutes,
      })),
    availability: availability.map((slot) => ({
      weekday: slot.weekday,
      startMinute: slot.startMinute,
      endMinute: slot.endMinute,
    })),
  };
}

export interface KhidmaBookingDto {
  id: string;
  serviceTitle: string;
  state: string;
  startTime: string;
  endTime: string;
  priceMinor: number;
  currency: string;
  buyerId: string;
  professionalId: string;
  createdAt: string;
}

export function toBookingDto(booking: {
  id: string;
  serviceTitleSnapshot: string;
  state: string;
  startTime: Date;
  endTime: Date;
  priceSnapshotMinor: number;
  currency: string;
  buyerId: string;
  professionalId: string;
  createdAt: Date;
}): KhidmaBookingDto {
  return {
    id: booking.id,
    serviceTitle: booking.serviceTitleSnapshot,
    state: booking.state,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    priceMinor: booking.priceSnapshotMinor,
    currency: booking.currency,
    buyerId: booking.buyerId,
    professionalId: booking.professionalId,
    createdAt: booking.createdAt.toISOString(),
  };
}

export async function listBuyerBookings(db: DbExecutor, buyerId: string): Promise<KhidmaBookingDto[]> {
  const rows = await listBookingsForBuyer(db, buyerId);
  return rows.map(toBookingDto);
}

export async function listProfessionalBookings(db: DbExecutor, professionalId: string): Promise<KhidmaBookingDto[]> {
  const rows = await listBookingsForProfessional(db, professionalId);
  return rows.map(toBookingDto);
}

export async function getBookingView(db: DbExecutor, bookingId: string): Promise<KhidmaBookingDto> {
  const booking = await getBookingById(db, bookingId);
  if (!booking) throw new ResourceNotFoundError("Booking", bookingId);
  return toBookingDto(booking);
}

export interface BuyerRequestDto {
  id: string;
  description: string;
  state: string;
  serviceId: string | null;
  requestedStart: string | null;
  requestedEnd: string | null;
  createdAt: string;
}

export async function listBuyerRequests(db: DbExecutor, buyerId: string): Promise<BuyerRequestDto[]> {
  const rows = await listRequestsForBuyer(db, buyerId);
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    state: row.state,
    serviceId: row.serviceId,
    requestedStart: row.requestedStart?.toISOString() ?? null,
    requestedEnd: row.requestedEnd?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export interface QuoteDto {
  id: string;
  requestId: string;
  professionalId: string;
  professionalName: string;
  amountMinor: number;
  currency: string;
  message: string;
  state: string;
  expiresAt: string;
}

export async function getRequestQuotes(db: DbExecutor, requestId: string): Promise<QuoteDto[]> {
  const rows = await listQuotesForRequest(db, requestId);
  return rows.map((row) => ({
    id: row.id,
    requestId: row.requestId,
    professionalId: row.professionalId,
    professionalName: row.professionalName,
    amountMinor: row.amountMinor,
    currency: row.currency,
    message: row.message,
    state: row.state,
    expiresAt: row.expiresAt.toISOString(),
  }));
}

export async function getRequestView(db: DbExecutor, requestId: string): Promise<BuyerRequestDto> {
  const request = await getRequestById(db, requestId);
  if (!request) throw new ResourceNotFoundError("Request", requestId);
  return {
    id: request.id,
    description: request.description,
    state: request.state,
    serviceId: request.serviceId,
    requestedStart: request.requestedStart?.toISOString() ?? null,
    requestedEnd: request.requestedEnd?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

export interface ProfessionalRequestFeedDto {
  requestId: string;
  description: string;
  state: string;
  buyerName: string;
  requestedStart: string | null;
  requestedEnd: string | null;
  quotedByMe: boolean;
  createdAt: string;
}

export async function listProfessionalRequestFeed(
  db: DbExecutor,
  professionalId: string,
): Promise<ProfessionalRequestFeedDto[]> {
  const rows = await listOpenRequestsForProfessional(db, professionalId);
  return rows.map((row) => ({
    requestId: row.request.id,
    description: row.request.description,
    state: row.request.state,
    buyerName: "",
    requestedStart: row.request.requestedStart?.toISOString() ?? null,
    requestedEnd: row.request.requestedEnd?.toISOString() ?? null,
    quotedByMe: row.quotedByMe,
    createdAt: row.request.createdAt.toISOString(),
  }));
}

export interface ProfessionalQuoteDto {
  quoteId: string;
  requestId: string;
  requestDescription: string;
  amountMinor: number;
  currency: string;
  state: string;
  expiresAt: string;
}

export async function listProfessionalQuotes(db: DbExecutor, professionalId: string): Promise<ProfessionalQuoteDto[]> {
  const rows = await listQuotesByProfessional(db, professionalId);
  return rows.map((row) => ({
    quoteId: row.id,
    requestId: row.requestId,
    requestDescription: row.requestDescription,
    amountMinor: row.amountMinor,
    currency: row.currency,
    state: row.state,
    expiresAt: row.expiresAt.toISOString(),
  }));
}
