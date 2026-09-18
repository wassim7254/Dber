import { notFound } from "next/navigation";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { getCircleDetailView } from "@/domains/souq/application/souq-read";
import { circleMachine } from "@/domains/souq/domain/machine";
import { Card, DberMoney, Eyebrow, Media, ProgressBar, StatusBadge, Timeline } from "@/components/dber/ui";
import { getEntityTimeline } from "@/lib/timeline-read";
import { JoinPanel } from "@/components/actions/join-panel";
import { TransitionActions } from "@/components/actions/transition-actions";
import { formatMoney } from "@/lib/money";

export default async function SouqCirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await resolveIdentityFromCookies();
  const circle = await getCircleDetailView(db, id, identity?.userId ?? null).catch(() => null);
  if (!circle) notFound();

  const timeline = await getEntityTimeline(db, "souq_circle", circle.id);
  const isOwner = identity?.userId === circle.sellerId || identity?.role === "admin";
  const isOps = identity?.role === "ops_admin" || identity?.role === "admin";
  const ownerActions = circleMachine
    .allowedActions(circle.state as Parameters<typeof circleMachine.allowedActions>[0])
    .filter((action) => action !== "reach_target" && action !== "expire")
    .map((action) => ({
      action,
      label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      ...(action === "cancel" ? { danger: true, requireReason: true } : {}),
    }));
  const opsActions = isOps
    ? [{ action: "fail_close", label: "Fail close (ops)", danger: true, requireReason: true }]
    : [];

  const savings = circle.listPriceMinor - circle.groupPriceMinor;

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[980px] space-y-6">
        <Media kind={circle.images[0] ?? circle.category} title={circle.title} className="h-56 rounded-[var(--radius-card)] md:h-80" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <header className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge state={circle.state} />
                <Eyebrow>{circle.category} · SOUQ</Eyebrow>
              </div>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[32px]">
                {circle.title}
              </h1>
              <p className="text-[14px] leading-relaxed text-muted">{circle.description}</p>
              <p className="text-[13px] text-muted">
                Sold by <span className="font-medium text-ink">{circle.sellerName}</span>
              </p>
            </header>

            <Card className="space-y-3 p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[12px] text-muted">Group price</p>
                  <div className="mt-0.5 flex items-baseline gap-2">
                    <DberMoney amountMinor={circle.groupPriceMinor} currency={circle.currency} size="lg" />
                    <span className="tnum font-mono text-[13px] text-muted line-through">
                      {formatMoney(circle.listPriceMinor, circle.currency)}
                    </span>
                  </div>
                </div>
                {savings > 0 ? (
                  <p className="rounded-full bg-sand-soft px-3 py-1.5 text-[12px] font-semibold text-warn">
                    Save {formatMoney(savings, circle.currency)} per unit
                  </p>
                ) : null}
              </div>
              <ProgressBar
                value={circle.currentQuantity}
                max={circle.targetQuantity}
                label={`${circle.currentQuantity} of ${circle.targetQuantity} joined · ${
                  circle.spotsRemaining
                } spot${circle.spotsRemaining === 1 ? "" : "s"} remaining`}
              />
              <div className="flex justify-between text-[12.5px] text-muted">
                <span>Minimum group size: {circle.minimumParticipants}</span>
                <span>Ends {new Date(circle.deadlineAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </Card>

            {circle.participants.length > 0 ? (
              <Card className="p-5">
                <p className="text-[13px] font-semibold">Recent participants</p>
                <ul className="mt-3 space-y-2">
                  {circle.participants.slice(-5).reverse().map((participant) => (
                    <li key={participant.id} className="flex items-center justify-between text-[13px]">
                      <span>{participant.displayName}</span>
                      <span className="tnum font-mono text-[12px] text-muted">×{participant.quantity}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {timeline.length > 0 ? (
              <Card className="p-5">
                <p className="mb-4 text-[13px] font-semibold">Group timeline</p>
                <Timeline items={timeline} />
              </Card>
            ) : null}
          </div>

          <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
            <Card className="p-5">
              {identity ? (
                circle.viewerParticipation ? (
                  <div className="space-y-2 rounded-xl bg-green-soft px-4 py-3">
                    <p className="text-[13px] font-semibold text-green-dark">You&apos;re in this group</p>
                    <p className="text-[12.5px] text-green-dark/80">
                      Quantity {circle.viewerParticipation.quantity} · payment{" "}
                      {circle.viewerParticipation.paymentStatus}
                    </p>
                  </div>
                ) : (
                  <JoinPanel
                    circleId={circle.id}
                    groupPriceMinor={circle.groupPriceMinor}
                    currency={circle.currency}
                    spotsRemaining={circle.spotsRemaining}
                    state={circle.state}
                  />
                )
              ) : (
                <div className="space-y-3">
                  <p className="text-[13.5px] leading-relaxed text-muted">
                    Sign in with a demo buyer account to join this group.
                  </p>
                  <a
                    href="/welcome"
                    className="flex h-11 items-center justify-center rounded-xl bg-green text-[14px] font-semibold text-bg hover:bg-green-dark"
                  >
                    Sign in
                  </a>
                </div>
              )}
            </Card>

            {isOwner || isOps ? (
              <Card className="p-5">
                <p className="mb-3 text-[13px] font-semibold">Manage group</p>
                <TransitionActions
                  path={`/api/v1/souq/circles/${circle.id}/transition`}
                  actions={[...ownerActions, ...opsActions]}
                />
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
