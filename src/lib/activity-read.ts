import { desc, eq } from "drizzle-orm";

import {
  groupBuyCircles,
  groupBuyParticipants,
  khidmaBookings,
  krayaAssets,
  rentalBookings,
  souqProducts,
} from "@/db/schema";
import type { DbExecutor } from "@/db/tx";

export interface ActivityEntry {
  key: string;
  vertical: "SOUQ" | "KHIDMA" | "KRAYA";
  href: string;
  title: string;
  state: string;
  amountMinor: number;
  currency: string;
  when: string;
  nextAction?: string;
}

/** Unified Activity feed (§16) across all three verticals for one user. */
export async function getActivityFeed(db: DbExecutor, userId: string): Promise<ActivityEntry[]> {
  const [souqRows, khidmaRows, krayaRows] = await Promise.all([
    db
      .select({
        circleId: groupBuyCircles.id,
        state: groupBuyCircles.state,
        title: souqProducts.title,
        priceMinor: groupBuyCircles.groupPriceMinor,
        currency: groupBuyCircles.currency,
        joinedAt: groupBuyParticipants.joinedAt,
        paymentStatus: groupBuyParticipants.paymentStatus,
      })
      .from(groupBuyParticipants)
      .innerJoin(groupBuyCircles, eq(groupBuyParticipants.circleId, groupBuyCircles.id))
      .innerJoin(souqProducts, eq(groupBuyCircles.productId, souqProducts.id))
      .where(eq(groupBuyParticipants.userId, userId))
      .orderBy(desc(groupBuyParticipants.joinedAt))
      .limit(30),
    db
      .select()
      .from(khidmaBookings)
      .where(eq(khidmaBookings.buyerId, userId))
      .orderBy(desc(khidmaBookings.createdAt))
      .limit(30),
    db
      .select({
        booking: rentalBookings,
        assetTitle: krayaAssets.title,
      })
      .from(rentalBookings)
      .innerJoin(krayaAssets, eq(rentalBookings.assetId, krayaAssets.id))
      .where(eq(rentalBookings.renterId, userId))
      .orderBy(desc(rentalBookings.createdAt))
      .limit(30),
  ]);

  const entries: ActivityEntry[] = [];

  for (const row of souqRows) {
    entries.push({
      key: `souq-${row.circleId}`,
      vertical: "SOUQ",
      href: `/souq/${row.circleId}`,
      title: row.title,
      state: row.state,
      amountMinor: row.priceMinor,
      currency: row.currency,
      when: row.joinedAt.toISOString(),
      nextAction:
        row.state === "open"
          ? `Your payment: ${row.paymentStatus} — captured when the group locks`
          : row.state === "locked"
            ? "Group locked — payments are being captured"
            : undefined,
    });
  }
  for (const row of khidmaRows) {
    entries.push({
      key: `khidma-${row.id}`,
      vertical: "KHIDMA",
      href: `/activity/khidma/${row.id}`,
      title: row.serviceTitleSnapshot,
      state: row.state,
      amountMinor: row.priceSnapshotMinor,
      currency: row.currency,
      when: row.createdAt.toISOString(),
      nextAction:
        row.state === "payment_pending" ? "Complete payment to confirm the booking" : undefined,
    });
  }
  for (const row of krayaRows) {
    entries.push({
      key: `kraya-${row.booking.id}`,
      vertical: "KRAYA",
      href: `/activity/kraya/${row.booking.id}`,
      title: row.assetTitle,
      state: row.booking.state,
      amountMinor: row.booking.totalChargeMinor,
      currency: row.booking.currency,
      when: row.booking.createdAt.toISOString(),
      nextAction:
        row.booking.state === "payment_pending"
          ? "Complete payment to hold these dates"
          : row.booking.state === "confirmed"
            ? "Starts " + row.booking.startTime.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            : undefined,
    });
  }

  return entries.sort((a, b) => (a.when < b.when ? 1 : -1));
}
