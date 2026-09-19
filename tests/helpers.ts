import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import type { Tx } from "@/db/tx";
import { processOutboxBatch } from "@/infrastructure/outbox/dispatcher";
import { resolveEventHandler } from "@/jobs/handlers";

export { db };

/** Runs a mutation service inside a fresh transaction (services require a tx handle). */
export function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

const ALL_TABLES = [
  "audit_log",
  "admin_actions",
  "provider_actions",
  "payment_events",
  "refunds",
  "payments",
  "dispute_evidence",
  "dispute_resolutions",
  "disputes",
  "cancellation_requests",
  "rental_contracts",
  "rental_bookings",
  "khidma_bookings",
  "service_quotes",
  "service_requests",
  "khidma_availability",
  "khidma_services",
  "group_buy_participants",
  "group_buy_circles",
  "souq_products",
  "kraya_assets",
  "notifications",
  "saved_items",
  "messages",
  "reviews",
  "support_requests",
  "uploads",
  "listing_moderations",
  "payouts",
  "seller_profiles",
  "professional_profiles",
  "rental_provider_profiles",
  "notification_preferences",
  "sessions",
  "auth_tokens",
  "outbox_events",
  "idempotency_keys",
  "users",
];

export async function truncateAll(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${ALL_TABLES.join(", ")} CASCADE`));
}

/** Drains the outbox until quiet (bounded) — drives full payment lifecycles in tests. */
export async function drainOutbox(maxRounds = 12): Promise<void> {
  for (let round = 0; round < maxRounds; round += 1) {
    const result = await processOutboxBatch(db, resolveEventHandler, 50);
    if (result.claimed === 0) break;
  }
}

/** Seeds a user directly, bypassing the API. */
export async function seedUser(input: {
  id: string;
  role: "buyer" | "seller" | "professional" | "ops_admin" | "admin";
  displayName?: string;
}): Promise<string> {
  await db.execute(
    sql`INSERT INTO users (id, role, display_name) VALUES (${input.id}, ${input.role}, ${input.displayName ?? `Test ${input.role}`}) ON CONFLICT (id) DO NOTHING`,
  );
  return input.id;
}

/** Deterministic UUID for fixtures (uuid-v7-shaped, stable per name). */
export function UUID(name: string): string {
  const hash = createHash("sha256").update(name).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}
