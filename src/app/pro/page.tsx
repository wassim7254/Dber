import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { listSellerCircles, listSellerProducts } from "@/domains/souq/application/souq-read";
import {
  listProfessionalBookings,
  listProfessionalQuotes,
  listProfessionalRequestFeed,
} from "@/domains/khidma/application/khidma-read";
import { listOwnerBookings } from "@/domains/kraya/application/kraya-read";
import { listOwnerAssets } from "@/domains/kraya/application/kraya-read";
import { Card, DberMoney, EmptyState, SectionTitle, StatusBadge, formatDate, formatTimestamp } from "@/components/dber/ui";
import { TransitionActions } from "@/components/actions/transition-actions";
import { QuoteForm } from "@/components/actions/khidma-actions";
import { circleMachine } from "@/domains/souq/domain/machine";
import { khidmaBookingMachine } from "@/domains/khidma/domain/machine";
import { krayaBookingMachine } from "@/domains/kraya/domain/machine";
import { StatusBadge as Badge } from "@/components/dber/ui";

export const metadata = { title: "Provider workspace" };

export default async function ProPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");

  const isSeller = identity.role === "seller" || identity.role === "admin";
  const isPro = identity.role === "professional" || identity.role === "admin";

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[920px] space-y-10">
        <header className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Provider workspace</p>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] md:text-[30px]">
            {isSeller && isPro ? "Seller & professional hub" : isSeller ? "Seller dashboard" : "Professional dashboard"}
          </h1>
          <p className="text-[13.5px] text-muted">
            Every action below maps to a state-machine transition the server re-validates.
          </p>
        </header>

        {isSeller ? <SellerSection userId={identity.userId} /> : null}
        {isPro ? <ProfessionalSection userId={identity.userId} /> : null}
        {!isSeller && !isPro ? (
          <EmptyState
            icon="account"
            title="This workspace is for providers"
            body="Switch to a seller or professional account to manage listings, quotes, and bookings."
          />
        ) : null}
      </div>
    </div>
  );
}

async function SellerSection({ userId }: { userId: string }) {
  const [products, circles, assets, rentals] = await Promise.all([
    listSellerProducts(db, userId),
    listSellerCircles(db, userId),
    listOwnerAssets(db, userId),
    listOwnerBookings(db, userId),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>Your groups</SectionTitle>
        {circles.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No circles yet — create a product and open a group.</Card>
        ) : (
          <ul className="space-y-3">
            {circles.map((circle) => {
              const actions = circleMachine
                .allowedActions(circle.state as Parameters<typeof circleMachine.allowedActions>[0])
                .filter((action) => action !== "reach_target" && action !== "expire")
                .map((action) => ({
                  action,
                  label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                  ...(action === "cancel" ? { danger: true, requireReason: true } : {}),
                }));
              return (
                <li key={circle.id}>
                  <Card className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/souq/${circle.id}`} className="text-[14px] font-semibold hover:underline">
                          {circle.title}
                        </Link>
                        <p className="tnum text-[12px] text-muted">
                          {circle.currentQuantity}/{circle.targetQuantity} joined · ends {formatDate(circle.deadlineAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <DberMoney amountMinor={circle.groupPriceMinor} currency={circle.currency} size="sm" />
                        <Badge state={circle.state} withIcon={false} />
                      </div>
                    </div>
                    <TransitionActions path={`/api/v1/souq/circles/${circle.id}/transition`} actions={actions} />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Your products</SectionTitle>
        {products.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No products yet.</Card>
        ) : (
          <ul className="space-y-2.5">
            {products.map((product) => (
              <li key={product.id}>
                <Card className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-[14px] font-semibold">{product.title}</p>
                    <p className="text-[12px] text-muted">{product.category}</p>
                  </div>
                  <DberMoney amountMinor={product.basePriceMinor} currency={product.currency} size="sm" />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Your rentals & bookings</SectionTitle>
        {assets.length > 0 ? (
          <ul className="mb-3 space-y-2.5">
            {assets.map((asset) => (
              <li key={asset.id}>
                <Card className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-[14px] font-semibold">{asset.title}</p>
                    <p className="text-[12px] text-muted">KRAYA listing · {asset.location}</p>
                  </div>
                  <DberMoney amountMinor={asset.dailyRateMinor} currency={asset.currency} size="sm" />
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
        {rentals.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No rental bookings yet.</Card>
        ) : (
          <ul className="space-y-3">
            {rentals.map((booking) => {
              const actions = krayaBookingMachine
                .allowedActions(booking.state as Parameters<typeof krayaBookingMachine.allowedActions>[0])
                .filter((action) => action === "activate" || action === "complete")
                .map((action) => ({ action, label: action === "activate" ? "Hand over" : "Return & complete" }));
              return (
                <li key={booking.id}>
                  <Card className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Link href={`/activity/kraya/${booking.id}`} className="text-[14px] font-semibold hover:underline">
                          Rental booking
                        </Link>
                        <p className="tnum text-[12px] text-muted">
                          {formatDate(booking.startTime)} → {formatDate(booking.endTime)}
                        </p>
                      </div>
                      <StatusBadge state={booking.state} withIcon={false} />
                    </div>
                    <TransitionActions path={`/api/v1/kraya/bookings/${booking.id}/transition`} actions={actions} />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

async function ProfessionalSection({ userId }: { userId: string }) {
  const [requests, quotes, bookings] = await Promise.all([
    listProfessionalRequestFeed(db, userId),
    listProfessionalQuotes(db, userId),
    listProfessionalBookings(db, userId),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle>Incoming requests</SectionTitle>
        {requests.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No open requests right now.</Card>
        ) : (
          <ul className="space-y-3">
            {requests.slice(0, 6).map((request) => (
              <li key={request.requestId}>
                <Card className="space-y-3 p-4">
                  <div>
                    <p className="text-[14px] leading-snug">{request.description}</p>
                    <p className="tnum mt-1 text-[12px] text-muted">
                      Requested {formatDate(request.createdAt)}
                      {request.quotedByMe ? " · you quoted this" : ""}
                    </p>
                  </div>
                  {!request.quotedByMe ? <QuoteForm requestId={request.requestId} /> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Your quotes</SectionTitle>
        {quotes.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No quotes submitted yet.</Card>
        ) : (
          <ul className="space-y-2.5">
            {quotes.map((quote) => (
              <li key={quote.quoteId}>
                <Card className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px]">{quote.requestDescription}</p>
                    <p className="text-[12px] text-muted">
                      expires {formatDate(quote.expiresAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <DberMoney amountMinor={quote.amountMinor} currency={quote.currency} size="sm" />
                    <Badge state={quote.state} withIcon={false} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Bookings</SectionTitle>
        {bookings.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No bookings yet.</Card>
        ) : (
          <ul className="space-y-3">
            {bookings.map((booking) => {
              const actions = khidmaBookingMachine
                .allowedActions(booking.state as Parameters<typeof khidmaBookingMachine.allowedActions>[0])
                .filter((action) => action === "start" || action === "complete")
                .map((action) => ({ action, label: action === "start" ? "Start work" : "Complete" }));
              return (
                <li key={booking.id}>
                  <Card className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Link href={`/activity/khidma/${booking.id}`} className="text-[14px] font-semibold hover:underline">
                          {booking.serviceTitle}
                        </Link>
                        <p className="tnum text-[12px] text-muted">
                          {formatDate(booking.startTime)} · {formatTimestamp(booking.startTime)}
                        </p>
                      </div>
                      <StatusBadge state={booking.state} withIcon={false} />
                    </div>
                    <TransitionActions path={`/api/v1/khidma/bookings/${booking.id}/transition`} actions={actions} />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
