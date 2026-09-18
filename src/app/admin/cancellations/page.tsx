import { desc, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { cancellationRequests, users } from "@/db/schema";
import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { Card, StatusBadge, formatTimestamp } from "@/components/dber/ui";
import { ReviewCancellation } from "@/components/actions/governance-actions";

export const metadata = { title: "Cancellations — Admin" };

export default async function AdminCancellationsPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");
  if (!isPrivileged(identity.role)) redirect("/");

  const rows = await db
    .select({ request: cancellationRequests, requesterName: users.displayName })
    .from(cancellationRequests)
    .innerJoin(users, eq(cancellationRequests.requesterId, users.id))
    .where(ne(cancellationRequests.state, "withdrawn"))
    .orderBy(desc(cancellationRequests.createdAt))
    .limit(30);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px] space-y-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Cancellation review</h1>
        <p className="text-[13px] text-muted">
          Approval executes the full financial consequence set in ONE transaction: target state
          transition, refunds, admin audit, and notifications.
        </p>
        {rows.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">Nothing in the queue.</Card>
        ) : (
          rows.map(({ request, requesterName }) => (
            <Card key={request.id} className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold">
                    {request.entityType.replace(/_/g, " ")} · {requesterName}
                  </p>
                  <p className="tnum mt-0.5 font-mono text-[11.5px] text-muted">
                    {formatTimestamp(request.createdAt.toISOString())} · target {request.entityId.slice(0, 8)}…
                  </p>
                </div>
                <StatusBadge state={request.state} withIcon={false} />
              </div>
              <p className="rounded-xl bg-bg px-4 py-3 text-[13px] leading-relaxed">{request.reason}</p>
              {request.state === "pending" ? (
                <ReviewCancellation cancellationId={request.id} />
              ) : (
                <p className="text-[12.5px] text-muted">
                  Decision reason: {request.decisionReason ?? "—"}
                </p>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
