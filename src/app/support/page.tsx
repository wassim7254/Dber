import Link from "next/link";

import { authenticate } from "@/lib/auth/identity";
import { listMySupportRequests } from "@/domains/engagement/support-service";
import { db } from "@/db/client";
import { Card, Eyebrow, StatusBadge, formatTimestamp } from "@/components/dber/ui";
import { SupportForm } from "@/components/engagement/support-form";

export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "When is my payment captured?",
    a: "SOUQ payments are authorized when you join and captured only when the group reaches its target. Bookings and rentals capture at confirmation.",
  },
  {
    q: "How do refunds work?",
    a: "Refunds follow each listing's cancellation policy and are processed by the payment provider. You can follow every step in your transaction timeline.",
  },
  {
    q: "What if a provider cancels?",
    a: "Provider-initiated cancellations refund you in full. The platform state machine guarantees your money is returned to the original payment method.",
  },
];

export default async function SupportPage() {
  const identity = await authenticate();
  const tickets = identity ? await listMySupportRequests(db, identity.userId) : [];

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-8 px-5 py-8 md:px-10">
      <header>
        <Eyebrow>Help & support</Eyebrow>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.01em]">How can we help?</h1>
        <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted">
          Most answers live in your transaction timeline — every payment, state change and
          refund is recorded there. For anything else, open a ticket below.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Common questions</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {FAQ.map((item) => (
            <Card key={item.q} className="p-5">
              <p className="text-[13.5px] font-semibold">{item.q}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {identity ? (
        <>
          <section>
            <h2 className="mb-3 text-[17px] font-semibold">Open a ticket</h2>
            <Card className="p-6">
              <SupportForm />
            </Card>
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-semibold">Your tickets</h2>
            {tickets.length === 0 ? (
              <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">
                No tickets yet. If something looks wrong with a transaction, start from its
                timeline on the <Link href="/activity" className="font-semibold text-green-dark hover:underline">Activity page</Link>.
              </p>
            ) : (
              <Card className="divide-y divide-line">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-[14px] font-semibold">{ticket.subject}</p>
                      <StatusBadge state={ticket.state} withIcon={false} />
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{ticket.body}</p>
                    {ticket.resolutionNote ? (
                      <p className="mt-2 rounded-lg bg-success-soft px-3.5 py-2 text-[12.5px] text-success">
                        {ticket.resolutionNote}
                      </p>
                    ) : null}
                    <p className="tnum mt-1.5 font-mono text-[11px] text-muted">
                      {formatTimestamp(ticket.createdAt)} · reference {ticket.id.slice(0, 8)}
                    </p>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </>
      ) : (
        <Card className="p-6">
          <p className="text-[14px] font-semibold">Sign in to open a ticket</p>
          <p className="mt-1 text-[13px] text-muted">
            Signed-in users can reference specific transactions and track responses here.
          </p>
          <Link
            href="/login?redirect=/support"
            className="mt-3 inline-flex rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-green-dark"
          >
            Sign in
          </Link>
        </Card>
      )}
    </div>
  );
}
