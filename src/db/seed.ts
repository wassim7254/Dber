/**
 * Deterministic development seed (§91). Fixed UUIDs + onConflictDoNothing make
 * re-runs idempotent. Never run against production.
 */
import { createHash } from "node:crypto";
import "dotenv/config";

import { db, sql } from "@/db/client";
import {
  disputes,
  groupBuyCircles,
  groupBuyParticipants,
  khidmaAvailability,
  khidmaBookings,
  khidmaServices,
  notifications,
  payments,
  rentalBookings,
  rentalContracts,
  krayaAssets,
  savedItems,
  serviceQuotes,
  serviceRequests,
  souqProducts,
  users,
} from "@/db/schema";

function uuidv5(name: string): string {
  const namespaceBuffer = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
  const hash = createHash("sha1").update(namespaceBuffer).update(name).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const id = (name: string) => uuidv5(`dber:${name}`);
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3_600_000);

async function main(): Promise<void> {
  console.log("Seeding DBER development data…");

  // ── Users ──────────────────────────────────────────────────────────────
  const userRows = [
    { id: id("user.buyer1"), role: "buyer" as const, displayName: "Amina Cherkaoui", email: "amina@dber.dev" },
    { id: id("user.buyer2"), role: "buyer" as const, displayName: "Youssef Benali", email: "youssef@dber.dev" },
    { id: id("user.buyer3"), role: "buyer" as const, displayName: "Salma Idrissi", email: "salma@dber.dev" },
    { id: id("user.seller1"), role: "seller" as const, displayName: "Atlas Goods Co.", email: "atlas@dber.dev" },
    { id: id("user.seller2"), role: "seller" as const, displayName: "Medina Supply", email: "medina@dber.dev" },
    { id: id("user.pro1"), role: "professional" as const, displayName: "Karim Tazi — Electrician", email: "karim@dber.dev" },
    { id: id("user.pro2"), role: "professional" as const, displayName: "Nadia Fassi — Designer", email: "nadia@dber.dev" },
    { id: id("user.ops"), role: "ops_admin" as const, displayName: "Ops — Hicham", email: "ops@dber.dev" },
    { id: id("user.admin"), role: "admin" as const, displayName: "Admin — Laila", email: "admin@dber.dev" },
  ];
  await db.insert(users).values(userRows).onConflictDoNothing();

  // ── SOUQ products & circles ────────────────────────────────────────────
  const productRows = [
    { id: id("product.olive-oil"), sellerId: id("user.seller1"), title: "Cold-Pressed Atlas Olive Oil — 5L", description: "First-press olive oil from Meknès groves. Group price unlocked when the circle fills.", category: "food", basePriceMinor: 48000, images: ["olive"] },
    { id: id("product.headphones"), sellerId: id("user.seller1"), title: "Sahara ANC Wireless Headphones", description: "Hybrid noise cancelling, 40h battery, USB-C. Bulk import deal.", category: "electronics", basePriceMinor: 89900, images: ["audio"] },
    { id: id("product.argan"), sellerId: id("user.seller2"), title: "Pure Argan Oil Set — 3×100ml", description: "Cooperative-pressed cosmetic argan oil. Sealed and certified.", category: "beauty", basePriceMinor: 32000, images: ["argan"] },
    { id: id("product. blender"), sellerId: id("user.seller2"), title: "ProBlend 1200W Kitchen Blender", description: "Restaurant-grade blender with 2L BPA-free jar.", category: "home", basePriceMinor: 74000, images: ["kitchen"] },
    { id: id("product.espresso"), sellerId: id("user.seller2"), title: "Casa Espresso Machine 15-bar", description: "Compact espresso machine with milk frother.", category: "home", basePriceMinor: 129900, images: ["coffee"] },
    { id: id("product.rug"), sellerId: id("user.seller1"), title: "Handwoven Beni Ourain Rug 200×300", description: "100% wool, woven in Azrou. Certificate of origin included.", category: "home", basePriceMinor: 260000, images: ["rug"] },
  ];
  await db.insert(souqProducts).values(productRows).onConflictDoNothing();

  await db.insert(groupBuyCircles).values([
    { id: id("circle.olive"), productId: id("product.olive-oil"), sellerId: id("user.seller1"), targetQuantity: 30, minimumParticipants: 10, currentQuantity: 18, groupPriceMinor: 39000, listPriceMinor: 48000, deadlineAt: hoursFromNow(56), state: "open" },
    { id: id("circle.headphones"), productId: id("product.headphones"), sellerId: id("user.seller1"), targetQuantity: 25, minimumParticipants: 8, currentQuantity: 3, groupPriceMinor: 69900, listPriceMinor: 89900, deadlineAt: hoursFromNow(120), state: "open" },
    { id: id("circle.argan"), productId: id("product.argan"), sellerId: id("user.seller2"), targetQuantity: 40, minimumParticipants: 12, currentQuantity: 11, groupPriceMinor: 26000, listPriceMinor: 32000, deadlineAt: hoursFromNow(30), state: "open" },
    { id: id("circle.espresso"), productId: id("product.espresso"), sellerId: id("user.seller2"), targetQuantity: 15, minimumParticipants: 5, currentQuantity: 15, groupPriceMinor: 109900, listPriceMinor: 129900, deadlineAt: hoursFromNow(72), state: "locked" },
  ]).onConflictDoNothing();

  await db.insert(groupBuyParticipants).values([
    { id: id("part.olive.1"), circleId: id("circle.olive"), userId: id("user.buyer1"), quantity: 1, paymentStatus: "authorized" },
    { id: id("part.olive.2"), circleId: id("circle.olive"), userId: id("user.buyer2"), quantity: 1, paymentStatus: "authorized" },
    { id: id("part.headphones.1"), circleId: id("circle.headphones"), userId: id("user.buyer3"), quantity: 1, paymentStatus: "authorized" },
    { id: id("part.espresso.1"), circleId: id("circle.espresso"), userId: id("user.buyer1"), quantity: 1, paymentStatus: "captured" },
  ]).onConflictDoNothing();

  await db.insert(payments).values([
    { id: id("pay.part.olive.1"), category: "souq_join", payerId: id("user.buyer1"), amountMinor: 39000, currency: "MAD", state: "authorized", providerRef: "mock_seed_auth_1", souqParticipantId: id("part.olive.1") },
    { id: id("pay.part.olive.2"), category: "souq_join", payerId: id("user.buyer2"), amountMinor: 39000, currency: "MAD", state: "authorized", providerRef: "mock_seed_auth_2", souqParticipantId: id("part.olive.2") },
    { id: id("pay.part.headphones.1"), category: "souq_join", payerId: id("user.buyer3"), amountMinor: 69900, currency: "MAD", state: "authorized", providerRef: "mock_seed_auth_3", souqParticipantId: id("part.headphones.1") },
    { id: id("pay.part.espresso.1"), category: "souq_join", payerId: id("user.buyer1"), amountMinor: 109900, capturedMinor: 109900, currency: "MAD", state: "captured", providerRef: "mock_seed_auth_4", souqParticipantId: id("part.espresso.1") },
  ]).onConflictDoNothing();

  // ── KHIDMA services, availability, requests, quotes, bookings ──────────
  await db.insert(khidmaServices).values([
    { id: id("service.electric"), professionalId: id("user.pro1"), title: "Home electrical inspection & repair", specialty: "Electrician", description: "Full apartment electrical inspection, panel check, and repair of up to 5 points. Includes safety certificate.", category: "home repair", basePriceMinor: 45000, durationMinutes: 120 },
    { id: id("service.lighting"), professionalId: id("user.pro1"), title: "Lighting design & installation", specialty: "Electrician", description: "Design and install ambient lighting for up to 3 rooms, including dimmers.", category: "home repair", basePriceMinor: 90000, durationMinutes: 240 },
    { id: id("service.brand"), professionalId: id("user.pro2"), title: "Brand identity starter pack", specialty: "Brand Design", description: "Logo, palette, typography, and a 10-page brand guide. Two revision rounds included.", category: "design", basePriceMinor: 150000, durationMinutes: 480 },
    { id: id("service.ux"), professionalId: id("user.pro2"), title: "Product UX audit", specialty: "UX Consulting", description: "Heuristic audit of up to 10 core screens with prioritized recommendations.", category: "consulting", basePriceMinor: 120000, durationMinutes: 300 },
  ]).onConflictDoNothing();

  await db.insert(khidmaAvailability).values([
    { id: id("avail.pro1.1"), professionalId: id("user.pro1"), weekday: 1, startMinute: 9 * 60, endMinute: 18 * 60 },
    { id: id("avail.pro1.2"), professionalId: id("user.pro1"), weekday: 3, startMinute: 9 * 60, endMinute: 18 * 60 },
    { id: id("avail.pro2.1"), professionalId: id("user.pro2"), weekday: 2, startMinute: 10 * 60, endMinute: 19 * 60 },
    { id: id("avail.pro2.2"), professionalId: id("user.pro2"), weekday: 4, startMinute: 10 * 60, endMinute: 19 * 60 },
  ]).onConflictDoNothing();

  await db.insert(serviceRequests).values([
    { id: id("request.1"), buyerId: id("user.buyer2"), serviceId: id("service.electric"), description: "Two rooms lost power after a storm; need inspection and repair this week in Agadir.", requestedStart: hoursFromNow(48), requestedEnd: hoursFromNow(52), state: "quoted" },
    { id: id("request.2"), buyerId: id("user.buyer3"), description: "Looking for a UX expert to review our checkout flow before launch.", state: "requested" },
  ]).onConflictDoNothing();

  await db.insert(serviceQuotes).values([
    { id: id("quote.1"), requestId: id("request.1"), professionalId: id("user.pro1"), serviceId: id("service.electric"), amountMinor: 48000, message: "Can come Thursday morning; includes panel check.", expiresAt: hoursFromNow(96), state: "submitted" },
    { id: id("quote.2"), requestId: id("request.1"), professionalId: id("user.pro2"), amountMinor: 52000, message: "I can coordinate an electrician partner for Friday.", expiresAt: hoursFromNow(96), state: "submitted" },
  ]).onConflictDoNothing();

  await db.insert(khidmaBookings).values([
    { id: id("booking.1"), requestId: id("request.2"), quoteId: id("quote.2"), buyerId: id("user.buyer3"), professionalId: id("user.pro1"), serviceId: id("service.electric"), serviceTitleSnapshot: "Home electrical inspection & repair", startTime: hoursFromNow(30), endTime: hoursFromNow(32), priceSnapshotMinor: 45000, state: "payment_pending" },
  ]).onConflictDoNothing();

  await db.insert(payments).values([
    { id: id("pay.booking.1"), category: "khidma_service", payerId: id("user.buyer3"), amountMinor: 45000, currency: "MAD", state: "created", khidmaBookingId: id("booking.1") },
  ]).onConflictDoNothing();

  // ── KRAYA assets & bookings ────────────────────────────────────────────
  await db.insert(krayaAssets).values([
    { id: id("asset.villa"), ownerId: id("user.seller2"), title: "Ocean-view villa, Taghazout", description: "3-bedroom villa with terrace and surf storage. Weekday minimum 2 days.", category: "space", dailyRateMinor: 180000, depositMinor: 300000, location: "Taghazout", capacity: 6, images: ["villa"] },
    { id: id("asset.camera"), ownerId: id("user.seller1"), title: "Sony A7 IV kit + 2 lenses", description: "Full-frame mirrorless kit with 24-70 and 85mm, 3 batteries, 2 cards.", category: "equipment", dailyRateMinor: 45000, depositMinor: 150000, location: "Casablanca", capacity: 1, images: ["camera"] },
    { id: id("asset.van"), ownerId: id("user.seller1"), title: "Renault Trafic camper van", description: "2-berth camper with solar, fridge and roof rack. Cleaning included.", category: "vehicle", dailyRateMinor: 70000, depositMinor: 200000, location: "Marrakech", capacity: 4, images: ["van"] },
  ]).onConflictDoNothing();

  await db.insert(rentalBookings).values([
    { id: id("rental.1"), assetId: id("asset.camera"), renterId: id("user.buyer1"), startTime: hoursFromNow(20), endTime: hoursFromNow(68), dailyRateSnapshotMinor: 45000, depositSnapshotMinor: 150000, totalChargeMinor: 90000, state: "payment_pending" },
    { id: id("rental.2"), assetId: id("asset.van"), renterId: id("user.buyer2"), startTime: hoursFromNow(96), endTime: hoursFromNow(240), dailyRateSnapshotMinor: 70000, depositSnapshotMinor: 200000, totalChargeMinor: 420000, state: "confirmed" },
  ]).onConflictDoNothing();

  await db.insert(payments).values([
    { id: id("pay.rental.1.rent"), category: "kraya_rental", payerId: id("user.buyer1"), amountMinor: 90000, currency: "MAD", state: "created", krayaBookingId: id("rental.1") },
    { id: id("pay.rental.1.deposit"), category: "kraya_deposit", payerId: id("user.buyer1"), amountMinor: 150000, currency: "MAD", state: "created", krayaBookingId: id("rental.1") },
    { id: id("pay.rental.2.rent"), category: "kraya_rental", payerId: id("user.buyer2"), amountMinor: 420000, capturedMinor: 420000, currency: "MAD", state: "captured", krayaBookingId: id("rental.2") },
    { id: id("pay.rental.2.deposit"), category: "kraya_deposit", payerId: id("user.buyer2"), amountMinor: 200000, currency: "MAD", state: "authorized", krayaBookingId: id("rental.2") },
  ]).onConflictDoNothing();

  await db.insert(rentalContracts).values([
    { id: id("contract.rental.2"), bookingId: id("rental.2"), version: 1, terms: { cancellation: "Full refund ≥24h before start; 50% within 24h; deposit released on return." }, assetSnapshot: { title: "Renault Trafic camper van", location: "Marrakech", category: "vehicle" }, priceSnapshotMinor: 420000, depositSnapshotMinor: 200000, cancellationPolicy: "Full refund ≥24h before start.", acceptedAt: daysAgo(1) },
  ]).onConflictDoNothing();

  // ── Governance demo data ───────────────────────────────────────────────
  await db.insert(disputes).values([
    { id: id("dispute.1"), openerId: id("user.buyer2"), entityType: "kraya_booking", entityId: id("rental.2"), reason: "The van was delivered with a broken fridge and the owner refuses a partial refund.", state: "opened" },
  ]).onConflictDoNothing();

  // ── Notifications & saved items ────────────────────────────────────────
  await db.insert(notifications).values([
    { id: id("notif.1"), userId: id("user.buyer1"), kind: "group_progress", title: "Your group reached 60%", body: "Olive oil circle: 18 of 30 spots filled.", createdAt: daysAgo(0.2) },
    { id: id("notif.2"), userId: id("user.buyer1"), kind: "rental_starting", title: "Camera kit booking", body: "Your Sony A7 IV rental starts tomorrow — complete payment to confirm.", createdAt: daysAgo(0.05) },
    { id: id("notif.3"), userId: id("user.buyer2"), kind: "booking_confirmed", title: "Rental confirmed", body: "Camper van rental confirmed. Contract available in Activity.", createdAt: daysAgo(1) },
  ]).onConflictDoNothing();

  await db.insert(savedItems).values([
    { id: id("saved.1"), userId: id("user.buyer1"), entityType: "kraya_asset", entityId: id("asset.van") },
    { id: id("saved.2"), userId: id("user.buyer1"), entityType: "khidma_service", entityId: id("service.brand") },
    { id: id("saved.3"), userId: id("user.buyer1"), entityType: "souq_product", entityId: id("product.headphones") },
  ]).onConflictDoNothing();

  console.log("Seed complete. Dev sign-in: /welcome — users are seeded with fixed IDs (user.buyer1, user.admin, …).");
  await sql.end();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
