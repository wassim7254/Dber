import { notFound, redirect } from "next/navigation";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { getCheckoutView } from "@/domains/payments/application/payments-read";
import { Card, PriceBreakdown, StatusBadge, Timeline, formatTimestamp } from "@/components/dber/ui";
import { PayButton } from "@/components/actions/pay-button";
import { getEntityTimeline } from "@/lib/timeline-read";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");

  const view = await getCheckoutView(db, id).catch(() => null);
  if (!view) notFound();
  const timeline = await getEntityTimeline(db, "payment", id);
  const paymentState = view.payment.state;
  const amountLabel = formatMoney(view.payment.amountMinor, view.payment.currency);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[760px] space-y-6">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Universal checkout
          </p>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
            {paymentState === "captured"
              ? "Payment complete"
              : paymentState === "failed"
                ? "We couldn't complete the payment"
                : paymentState === "authorized"
                  ? "Review and confirm"
                  : "Payment processing"}
          </h1>
          <p className="text-[13.5px] leading-relaxed text-muted">
            {paymentState === "captured"
              ? "Your payment was verified server-side. Everything that happens next is tracked in Activity."
              : paymentState === "failed"
                ? "Your card wasn't charged. You can retry — the transaction id keeps everything traceable."
                : paymentState === "authorized"
                  ? "Funds only move after you confirm. The amounts below are computed server-side and cannot change at this step."
                  : "The payment provider is responding. This page updates as the state advances — you can safely leave and come back."}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {view.item.vertical}
                  </p>
                  <p className="mt-1 text-[16px] font-semibold">{view.item.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{view.item.subtitle}</p>
                </div>
                <StatusBadge state={paymentState} />
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <PriceBreakdown
                  lines={view.lines}
                  totalMinor={view.payment.amountMinor}
                  currency={view.payment.currency}
                  footnote={view.policy}
                />
              </div>
            </Card>

            <Card className="p-5">
              <p className="mb-4 text-[13px] font-semibold">Transaction timeline</p>
              {timeline.length > 0 ? (
                <Timeline items={timeline} />
              ) : (
                <p className="text-[13px] text-muted">Being created…</p>
              )}
            </Card>
          </div>

          <div className="space-y-4 md:sticky md:top-8 md:self-start">
            <Card className="space-y-4 p-5">
              {paymentState === "authorized" ? (
                <PayButton paymentId={view.payment.id} amountLabel={amountLabel} />
              ) : paymentState === "captured" ? (
                <div className="space-y-2.5">
                  <p className="rounded-xl bg-success-soft px-4 py-3 text-[13px] font-medium text-success">
                    Paid — the transaction is confirmed.
                  </p>
                  <a
                    href={view.item.detailHref ?? "/activity"}
                    className="flex h-11 items-center justify-center rounded-xl bg-green text-[14px] font-semibold text-bg hover:bg-green-dark"
                  >
                    Track transaction
                  </a>
                </div>
              ) : paymentState === "failed" ? (
                <div className="space-y-2.5">
                  <p className="rounded-xl bg-danger-soft px-4 py-3 text-[13px] leading-relaxed text-danger">
                    The authorization failed. No money moved.
                  </p>
                  <a
                    href={view.item.detailHref ?? "/activity"}
                    className="flex h-11 items-center justify-center rounded-xl border border-line text-[14px] font-semibold hover:border-green"
                  >
                    Back to transaction
                  </a>
                </div>
              ) : (
                <p className="rounded-xl bg-sand-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
                  Processing with the payment provider. This usually resolves within seconds; the
                  reconciler resolves any discrepancy automatically.
                </p>
              )}
              <p className="tnum font-mono text-[11px] text-muted">
                Payment id: {view.payment.id.slice(0, 8)}… · created {formatTimestamp(view.payment.createdAt)}
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
