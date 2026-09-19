import { notFound, redirect } from "next/navigation";

import { authenticate } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { getRequestQuotes, getRequestView } from "@/domains/khidma/application/khidma-read";
import { Card, StatusBadge } from "@/components/dber/ui";
import { AcceptQuote } from "@/components/actions/khidma-actions";
import { formatDate, formatTimestamp } from "@/components/dber/ui";

export default async function KhidmaRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await authenticate();
  if (!identity) redirect("/welcome");

  const request = await getRequestView(db, id).catch(() => null);
  if (!request) notFound();
  const quotes = await getRequestQuotes(db, id);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px] space-y-6">
        <header className="space-y-2">
          <StatusBadge state={request.state} />
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Your service request</h1>
          <p className="text-[14px] leading-relaxed text-muted">{request.description}</p>
          {request.requestedStart ? (
            <p className="tnum font-mono text-[12px] text-muted">
              Requested window: {formatDate(request.requestedStart)} → {formatDate(request.requestedEnd ?? request.requestedStart)}
            </p>
          ) : null}
        </header>

        <section className="space-y-3">
          <h2 className="text-[17px] font-semibold">Quotes ({quotes.length})</h2>
          {quotes.length === 0 ? (
            <Card className="p-5 text-[13px] text-muted">
              No quotes yet. Professionals are notified — quotes typically arrive within a day.
            </Card>
          ) : (
            quotes.map((quote) => (
              <Card key={quote.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold">{quote.professionalName}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {quote.message || "No message"} · valid until {formatTimestamp(quote.expiresAt)}
                    </p>
                  </div>
                  <p className="tnum shrink-0 font-mono text-[16px] font-semibold">
                    {(quote.amountMinor / 100).toFixed(2)} {quote.currency}
                  </p>
                </div>
                {identity.role === "buyer" && quote.state === "submitted" ? (
                  <AcceptQuote quoteId={quote.id} />
                ) : (
                  <p className="mt-3">
                    <StatusBadge state={quote.state} withIcon={false} />
                  </p>
                )}
              </Card>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
