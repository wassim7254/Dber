import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { getCurrentUser } from "@/lib/auth/identity";
import { krayaAssets, rentalBookings } from "@/db/schema";
import { listPayoutsForOwner } from "@/domains/kraya/infrastructure/kraya-repository";
import { db } from "@/db/client";
import { Card, DberMoney, EmptyState, SectionTitle, StatusBadge, formatDate } from "@/components/dber/ui";
import { LinkCard } from "@/components/pro/link-card";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function RentalOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/rental");
  if (user.role !== "seller" && user.role !== "admin") {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <EmptyState icon="kraya" title="This workspace is for rental providers" body="Sign in with a provider account to manage assets, bookings and deposits." />
      </div>
    );
  }

  const [assets, bookingRows, payouts] = await Promise.all([
    db.select().from(krayaAssets).where(eq(krayaAssets.ownerId, user.userId)),
    db
      .select({
        id: rentalBookings.id,
        state: rentalBookings.state,
        startTime: rentalBookings.startTime,
        endTime: rentalBookings.endTime,
        totalChargeMinor: rentalBookings.totalChargeMinor,
        currency: rentalBookings.currency,
        assetTitle: krayaAssets.title,
      })
      .from(rentalBookings)
      .innerJoin(krayaAssets, eq(krayaAssets.id, rentalBookings.assetId))
      .where(eq(krayaAssets.ownerId, user.userId))
      .orderBy(desc(rentalBookings.startTime))
      .limit(20),
    listPayoutsForOwner(db, user.userId),
  ]);

  const liveAssets = assets.filter((asset) => asset.status === "active").length;
  const upcoming = bookingRows.filter((booking) => ["payment_pending", "confirmed"].includes(booking.state)).length;
  const activeRentals = bookingRows.filter((booking) => booking.state === "active").length;
  const paidEarnings = payouts.filter((payout) => payout.state === "paid").reduce((sum, payout) => sum + payout.amountMinor, 0);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KRAYA"
        title="Rental overview"
        description="Assets, upcoming rentals and deposits — availability is protected at the database level."
        nav="rental"
        current="/pro/rental"
      />

      <section>
        <SectionTitle>At a glance</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <LinkCard label="Live assets" value={liveAssets} href="/pro/rental/assets" />
          <LinkCard label="Upcoming rentals" value={upcoming} href="/pro/rental/bookings" />
          <LinkCard label="Currently out" value={activeRentals} href="/pro/rental/bookings" />
          <LinkCard label="Paid earnings" value={`${(paidEarnings / 100).toFixed(0)} MAD`} href="/pro/rental/earnings" />
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            <Link href="/pro/rental/assets/new" className="text-[13px] font-semibold text-azure-dark hover:underline">
              + New asset
            </Link>
          }
        >
          Next pickups & returns
        </SectionTitle>
        {bookingRows.length === 0 ? (
          <EmptyState
            icon="kraya"
            title="No rentals yet"
            body="Publish an asset and renters can pick dates on a real availability calendar."
          />
        ) : (
          <Card className="divide-y divide-line">
            {bookingRows
              .filter((booking) => ["confirmed", "active", "payment_pending"].includes(booking.state))
              .slice(0, 6)
              .map((booking) => (
                <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <Link href={`/activity/kraya/${booking.id}`} className="truncate text-[14px] font-semibold hover:underline">
                      {booking.assetTitle}
                    </Link>
                    <p className="tnum text-[12px] text-muted">
                      {formatDate(booking.startTime.toISOString())} → {formatDate(booking.endTime.toISOString())}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <DberMoney amountMinor={booking.totalChargeMinor} currency={booking.currency} size="sm" />
                    <StatusBadge state={booking.state} withIcon={false} />
                  </div>
                </div>
              ))}
          </Card>
        )}
      </section>
    </div>
  );
}
