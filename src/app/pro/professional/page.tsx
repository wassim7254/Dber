import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listProfessionalBookings, listProfessionalQuotes, listProfessionalRequestFeed } from "@/domains/khidma/application/khidma-read";
import { db } from "@/db/client";
import { listPayoutsForOwner } from "@/domains/kraya/infrastructure/kraya-repository";
import { Card, DberMoney, EmptyState, SectionTitle, StatusBadge } from "@/components/dber/ui";
import { LinkCard } from "@/components/pro/link-card";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function ProfessionalOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional");
  if (user.role !== "professional" && user.role !== "admin") {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <EmptyState icon="khidma" title="This workspace is for professionals" body="Sign in with a professional account to manage services, quotes and bookings." />
      </div>
    );
  }

  const [requests, quotes, bookings, payouts] = await Promise.all([
    listProfessionalRequestFeed(db, user.userId),
    listProfessionalQuotes(db, user.userId),
    listProfessionalBookings(db, user.userId),
    listPayoutsForOwner(db, user.userId),
  ]);

  const openRequests = requests.filter((request) => !request.quotedByMe && request.state === "requested").length;
  const awaitingQuotes = quotes.filter((quote) => quote.state === "submitted").length;
  const upcoming = bookings.filter((booking) => ["confirmed", "in_progress"].includes(booking.state)).length;
  const pendingEarnings = payouts
    .filter((payout) => ["pending", "processing"].includes(payout.state))
    .reduce((sum, payout) => sum + payout.amountMinor, 0);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Professional overview"
        description="What you do, who you help, and every request, quote and booking in one place."
        nav="professional"
        current="/pro/professional"
      />

      <section>
        <SectionTitle>At a glance</SectionTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <LinkCard label="Open requests" value={openRequests} href="/pro/professional/requests" />
          <LinkCard label="Quotes awaiting reply" value={awaitingQuotes} href="/pro/professional/requests" />
          <LinkCard label="Upcoming bookings" value={upcoming} href="/pro/professional/bookings" />
          <LinkCard label="Pending earnings" value={`${(pendingEarnings / 100).toFixed(0)} MAD`} href="/pro/professional/earnings" />
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            <Link href="/pro/professional/services/new" className="text-[13px] font-semibold text-clay-dark hover:underline">
              + New service
            </Link>
          }
        >
          Upcoming schedule
        </SectionTitle>
        {upcoming === 0 ? (
          <EmptyState
            icon="khidma"
            title="No confirmed bookings"
            body="When customers accept your quotes, confirmed bookings appear here with the agreed schedule."
          />
        ) : (
          <Card className="divide-y divide-line">
            {bookings
              .filter((booking) => ["confirmed", "in_progress"].includes(booking.state))
              .slice(0, 5)
              .map((booking) => (
                <div key={booking.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{booking.serviceTitle}</p>
                    <p className="tnum text-[12px] text-muted">
                      {new Date(booking.startTime).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <DberMoney amountMinor={booking.priceMinor} currency={booking.currency} size="sm" />
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
