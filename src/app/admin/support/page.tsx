import { redirect } from "next/navigation";

import { authenticate } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { listOpenSupportRequests } from "@/domains/engagement/support-service";
import { db } from "@/db/client";
import { Card, EmptyState, StatusBadge, formatTimestamp } from "@/components/dber/ui";
import { SupportTicketActions } from "@/components/engagement/support-ticket-actions";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const identity = await authenticate();
  if (!identity) redirect("/login?redirect=/admin/support");
  if (!isPrivileged(identity.role)) {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState title="Restricted" body="This queue is for operations staff." /></div>;
  }
  const tickets = await listOpenSupportRequests(db);
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em]">Support queue</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">Every status change is audited with your identity.</p>
      </header>
      {tickets.length === 0 ? (
        <EmptyState title="Queue is clear" body="No support tickets right now." />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Card key={ticket.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14.5px] font-semibold">{ticket.subject}</p>
                  <p className="tnum text-[12px] text-muted">
                    {ticket.userName} · {formatTimestamp(ticket.createdAt)} · ref {ticket.id.slice(0, 8)}
                  </p>
                </div>
                <StatusBadge state={ticket.state} withIcon={false} />
              </div>
              <p className="mt-2 text-[13px] leading-relaxed">{ticket.body}</p>
              {ticket.entityId ? (
                <p className="tnum mt-1 font-mono text-[11.5px] text-muted">
                  References {ticket.entityType} {ticket.entityId.slice(0, 8)}…
                </p>
              ) : null}
              <div className="mt-3 border-t border-line pt-3">
                <SupportTicketActions ticketId={ticket.id} currentState={ticket.state} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
