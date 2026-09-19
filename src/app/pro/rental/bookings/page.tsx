import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { krayaAssets, rentalBookings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { Card, DberMoney, EmptyState, StatusBadge, formatDate } from "@/components/dber/ui";
import { TransitionActions } from "@/components/actions/transition-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

/** Owner-side legal actions per rental state (machine §5.5). */
const OWNER_ACTIONS: Record<string, { action: string; label: string; requireReason?: boolean; danger?: boolean }[]> = {
  active: [{ action: "complete", label: "Return received" }],
  confirmed: [{ action: "cancel", label: "Cancel", requireReason: true, danger: true }],
  payment_pending: [{ action: "cancel", label: "Cancel", requireReason: true, danger: true }],
};

export default async function RentalBookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/rental/bookings");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="kraya" title="Provider access required" body="Sign in with a provider account to manage bookings." /></div>;
  }

  const bookingRows = await db
    .select({
      id: rentalBookings.id,
      state: rentalBookings.state,
      startTime: rentalBookings.startTime,
      endTime: rentalBookings.endTime,
      totalChargeMinor: rentalBookings.totalChargeMinor,
      depositMinor: rentalBookings.depositSnapshotMinor,
      currency: rentalBookings.currency,
      assetTitle: krayaAssets.title,
    })
    .from(rentalBookings)
    .innerJoin(krayaAssets, eq(krayaAssets.id, rentalBookings.assetId))
    .where(eq(krayaAssets.ownerId, user.userId))
    .orderBy(desc(rentalBookings.startTime));

  const active = bookingRows.filter((booking) => ["payment_pending", "confirmed", "active"].includes(booking.state));
  const past = bookingRows.filter((booking) => ["completed", "cancelled", "refunded", "disputed"].includes(booking.state));

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KRAYA"
        title="Rental bookings"
        description="Confirmations hold a contract snapshot. When the asset comes back, mark the return — the deposit hold releases automatically."
        nav="rental"
        current="/pro/rental/bookings"
      />

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Active</h2>
        {active.length === 0 ? (
          <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">No active rentals.</p>
        ) : (
          <Card className="divide-y divide-line">
            {active.map((booking) => (
              <div key={booking.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/activity/kraya/${booking.id}`} className="truncate text-[14px] font-semibold hover:underline">
                    {booking.assetTitle}
                  </Link>
                  <p className="tnum text-[12px] text-muted">
                    {formatDate(booking.startTime.toISOString())} → {formatDate(booking.endTime.toISOString())} · deposit {(booking.depositMinor / 100).toFixed(0)} MAD (held)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <DberMoney amountMinor={booking.totalChargeMinor} currency={booking.currency} size="sm" />
                  <StatusBadge state={booking.state} withIcon={false} />
                  <TransitionActions
                    path={`/api/v1/kraya/bookings/${booking.id}/transition`}
                    actions={OWNER_ACTIONS[booking.state] ?? []}
                    successMessage="Rental updated."
                  />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">History</h2>
        {past.length === 0 ? (
          <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">Completed and cancelled rentals appear here.</p>
        ) : (
          <Card className="divide-y divide-line">
            {past.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <Link href={`/activity/kraya/${booking.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">
                  {booking.assetTitle}
                  <span className="tnum ml-2 text-[12px] text-muted">{formatDate(booking.startTime.toISOString())}</span>
                </Link>
                <StatusBadge state={booking.state} withIcon={false} />
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
