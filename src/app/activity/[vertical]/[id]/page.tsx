import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { getBookingView, type KhidmaBookingDto } from "@/domains/khidma/application/khidma-read";
import { getContractView, getRentalBookingView, type RentalBookingDto } from "@/domains/kraya/application/kraya-read";
import { Card, StatusBadge, Timeline, formatDate, formatTimestamp } from "@/components/dber/ui";
import { getEntityTimeline } from "@/lib/timeline-read";
import { khidmaBookingMachine } from "@/domains/khidma/domain/machine";
import { krayaBookingMachine } from "@/domains/kraya/domain/machine";
import { TransitionActions } from "@/components/actions/transition-actions";
import { OpenDisputeButton, RequestCancellationButton } from "@/components/actions/governance-actions";
import { khidmaCancellationPolicy } from "@/domains/khidma/domain/policy";
import { krayaCancellationPolicy } from "@/domains/kraya/domain/policy";

export const metadata = { title: "Transaction" };

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ vertical: string; id: string }>;
}) {
  const { vertical, id } = await params;
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");

  if (vertical === "khidma") {
    const booking: KhidmaBookingDto | null = await getBookingView(db, id).catch(() => null);
    if (!booking) notFound();
    const isParty = identity.userId === booking.buyerId || identity.userId === booking.professionalId || identity.role === "admin";
    if (!isParty) notFound();
    const timeline = await getEntityTimeline(db, "khidma_booking", id);
    const machineActions = khidmaBookingMachine.allowedActions(
      booking.state as Parameters<typeof khidmaBookingMachine.allowedActions>[0],
    );
    const actions = machineActions
      .filter((action) => action === "start" || action === "complete" || action === "cancel")
      .map((action) => ({
        action,
        label: action === "start" ? "Start work" : action === "complete" ? "Complete" : "Cancel",
        ...(action === "cancel" ? { danger: true, requireReason: true } : {}),
      }));
    const policy =
      booking.state === "confirmed"
        ? khidmaCancellationPolicy(new Date(), new Date(booking.startTime), booking.priceMinor)
        : null;

    return (
      <div className="px-4 py-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-[760px] space-y-5">
          <Link href="/activity" className="text-[12.5px] font-medium text-muted hover:text-ink">
            ← Activity
          </Link>
          <header className="space-y-2.5">
            <div className="flex items-center gap-3">
              <StatusBadge state={booking.state} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">KHIDMA</span>
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">{booking.serviceTitle}</h1>
            <p className="tnum font-mono text-[12.5px] text-muted">
              {formatDate(booking.startTime)} · {formatTimestamp(booking.startTime)} → {formatTimestamp(booking.endTime)}
            </p>
          </header>

          {policy && policy.cancellable ? (
            <p className="rounded-xl bg-bg px-4 py-3 text-[12.5px] text-muted">{policy.explanation}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="text-[13px] font-semibold">Actions</p>
              <div className="mt-3 space-y-3">
                {actions.length > 0 ? (
                  <TransitionActions path={`/api/v1/khidma/bookings/${id}/transition`} actions={actions} />
                ) : (
                  <p className="text-[12.5px] text-muted">No actions available in this state.</p>
                )}
                {["confirmed", "in_progress", "completed"].includes(booking.state) ? (
                  <OpenDisputeButton entityType="khidma_booking" entityId={id} />
                ) : null}
                {["confirmed"].includes(booking.state) ? (
                  <RequestCancellationButton entityType="khidma_booking" entityId={id} />
                ) : null}
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-semibold">Terms snapshot</p>
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Price</dt>
                  <dd className="tnum font-mono">{(booking.priceMinor / 100).toFixed(2)} {booking.currency}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Cancellation</dt>
                  <dd className="text-right text-[12px]">Full ≥24h · 50% within 24h</dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card className="p-5">
            <p className="mb-4 text-[13px] font-semibold">Timeline</p>
            <Timeline items={timeline} />
          </Card>
        </div>
      </div>
    );
  }

  if (vertical === "kraya") {
    const booking: RentalBookingDto | null = await getRentalBookingView(db, id).catch(() => null);
    if (!booking) notFound();
    const contract = await getContractView(db, id);
    const timeline = await getEntityTimeline(db, "kraya_booking", id);
    const machineActions = krayaBookingMachine.allowedActions(
      booking.state as Parameters<typeof krayaBookingMachine.allowedActions>[0],
    );
    const actions = machineActions
      .filter((action) => action === "activate" || action === "complete" || action === "cancel")
      .map((action) => ({
        action,
        label: action === "activate" ? "Hand over (start)" : action === "complete" ? "Return & complete" : "Cancel",
        ...(action === "cancel" ? { danger: true, requireReason: true } : {}),
      }));
    const policy =
      booking.state === "confirmed"
        ? krayaCancellationPolicy(new Date(), new Date(booking.startTime), booking.totalChargeMinor)
        : null;

    return (
      <div className="px-4 py-6 md:px-10 md:py-10">
        <div className="mx-auto max-w-[760px] space-y-5">
          <Link href="/activity" className="text-[12.5px] font-medium text-muted hover:text-ink">
            ← Activity
          </Link>
          <header className="space-y-2.5">
            <div className="flex items-center gap-3">
              <StatusBadge state={booking.state} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">KRAYA</span>
            </div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Rental booking</h1>
            <p className="tnum font-mono text-[12.5px] text-muted">
              {formatDate(booking.startTime)} → {formatDate(booking.endTime)}
            </p>
          </header>

          {policy && policy.cancellable ? (
            <p className="rounded-xl bg-bg px-4 py-3 text-[12.5px] text-muted">{policy.explanation}</p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="text-[13px] font-semibold">Actions</p>
              <div className="mt-3 space-y-3">
                {actions.length > 0 ? (
                  <TransitionActions path={`/api/v1/kraya/bookings/${id}/transition`} actions={actions} />
                ) : (
                  <p className="text-[12.5px] text-muted">No actions available in this state.</p>
                )}
                {["confirmed", "active", "completed"].includes(booking.state) ? (
                  <OpenDisputeButton entityType="kraya_booking" entityId={id} />
                ) : null}
                {["confirmed"].includes(booking.state) ? (
                  <RequestCancellationButton entityType="kraya_booking" entityId={id} />
                ) : null}
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-semibold">Contract snapshot</p>
              {contract ? (
                <dl className="mt-3 space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-muted">Rental charge</dt>
                    <dd className="tnum font-mono">{(contract.priceSnapshotMinor / 100).toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Deposit</dt>
                    <dd className="tnum font-mono">{(contract.depositSnapshotMinor / 100).toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted">Accepted</dt>
                    <dd className="tnum font-mono text-[12px]">{formatTimestamp(contract.acceptedAt)}</dd>
                  </div>
                  <p className="pt-1 text-[12px] leading-relaxed text-muted">{contract.cancellationPolicy}</p>
                </dl>
              ) : (
                <p className="mt-2 text-[12.5px] text-muted">
                  The immutable contract snapshot is written the moment this rental is confirmed.
                </p>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <p className="mb-4 text-[13px] font-semibold">Timeline</p>
            <Timeline items={timeline} />
          </Card>
        </div>
      </div>
    );
  }

  notFound();
}
