import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listProfessionalBookings } from "@/domains/khidma/application/khidma-read";
import { db } from "@/db/client";
import { Card, DberMoney, EmptyState, StatusBadge, formatDate } from "@/components/dber/ui";
import { TransitionActions } from "@/components/actions/transition-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

/** Professional-side legal actions per booking state (machine §5.4). */
const PRO_ACTIONS: Record<string, { action: string; label: string; requireReason?: boolean; danger?: boolean }[]> = {
  confirmed: [{ action: "start", label: "Start service" }],
  in_progress: [{ action: "complete", label: "Mark completed" }],
  payment_pending: [{ action: "cancel", label: "Cancel", requireReason: true, danger: true }],
};

export default async function ProfessionalBookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/bookings");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to manage bookings." /></div>;
  }
  const bookings = await listProfessionalBookings(db, user.userId);
  const active = bookings.filter((booking) => ["payment_pending", "confirmed", "in_progress"].includes(booking.state));
  const past = bookings.filter((booking) => ["completed", "cancelled", "refunded", "disputed"].includes(booking.state));

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Bookings"
        description="Confirmed bookings carry the accepted quote as an immutable snapshot. Start and complete from here."
        nav="professional"
        current="/pro/professional/bookings"
      />

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Active</h2>
        {active.length === 0 ? (
          <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">No active bookings.</p>
        ) : (
          <Card className="divide-y divide-line">
            {active.map((booking) => (
              <div key={booking.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/activity/khidma/${booking.id}`} className="truncate text-[14px] font-semibold hover:underline">
                    {booking.serviceTitle}
                  </Link>
                  <p className="tnum text-[12px] text-muted">
                    {formatDate(booking.startTime)} · {new Date(booking.startTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <DberMoney amountMinor={booking.priceMinor} currency={booking.currency} size="sm" />
                  <StatusBadge state={booking.state} withIcon={false} />
                  <TransitionActions
                    path={`/api/v1/khidma/bookings/${booking.id}/transition`}
                    actions={PRO_ACTIONS[booking.state] ?? []}
                    successMessage="Booking updated."
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
          <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">Completed and cancelled bookings appear here.</p>
        ) : (
          <Card className="divide-y divide-line">
            {past.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <Link href={`/activity/khidma/${booking.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">
                  {booking.serviceTitle}
                  <span className="tnum ml-2 text-[12px] text-muted">{formatDate(booking.startTime)}</span>
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
