import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listProfessionalQuotes, listProfessionalRequestFeed } from "@/domains/khidma/application/khidma-read";
import { db } from "@/db/client";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { QuoteForm } from "@/components/actions/khidma-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function ProfessionalRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/requests");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to see requests." /></div>;
  }
  const [requests, quotes] = await Promise.all([
    listProfessionalRequestFeed(db, user.userId),
    listProfessionalQuotes(db, user.userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Requests & quotes"
        description="Review what customers need, send a bound quote, and track the ones you've already sent."
        nav="professional"
        current="/pro/professional/requests"
      />

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Open requests</h2>
        {requests.length === 0 ? (
          <EmptyState
            icon="khidma"
            title="No open requests"
            body="Customer requests arrive here. A complete public profile helps them find you first."
          />
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <Card key={request.requestId} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-snug">{request.description}</p>
                    <p className="tnum mt-1 text-[12px] text-muted">
                      Submitted {new Date(request.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {request.requestedStart ? ` · preferred ${new Date(request.requestedStart).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}` : ""}
                    </p>
                  </div>
                  <StatusBadge state={request.state} withIcon={false} />
                </div>
                {request.quotedByMe ? (
                  <p className="mt-3 rounded-lg bg-success-soft px-3.5 py-2 text-[12.5px] text-success">
                    You already sent a quote for this request.
                  </p>
                ) : (
                  <div className="mt-4 border-t border-line pt-4">
                    <QuoteForm requestId={request.requestId} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Quotes you sent</h2>
        {quotes.length === 0 ? (
          <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">No quotes sent yet.</p>
        ) : (
          <Card className="divide-y divide-line">
            {quotes.map((quote) => (
              <div key={quote.quoteId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/khidma/requests/${quote.requestId}`} className="block truncate text-[13.5px] font-medium hover:underline">
                    {quote.requestDescription}
                  </Link>
                  <p className="tnum text-[12px] text-muted">
                    Expires {new Date(quote.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <DberMoney amountMinor={quote.amountMinor} currency={quote.currency} size="sm" />
                  <StatusBadge state={quote.state} withIcon={false} />
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
