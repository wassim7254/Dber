import { desc, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { disputeEvidence, disputes, users } from "@/db/schema";
import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { redirect } from "next/navigation";
import { Card, StatusBadge, formatTimestamp } from "@/components/dber/ui";
import { ResolveDispute } from "@/components/actions/governance-actions";

export const metadata = { title: "Disputes — Admin" };

export default async function AdminDisputesPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");
  if (identity.role !== "admin") redirect("/admin");

  const rows = await db
    .select({ dispute: disputes, openerName: users.displayName })
    .from(disputes)
    .innerJoin(users, eq(disputes.openerId, users.id))
    .where(ne(disputes.state, "resolved"))
    .orderBy(desc(disputes.createdAt))
    .limit(30);
  const evidenceRows = rows.length
    ? await db.select().from(disputeEvidence).limit(100)
    : [];

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px] space-y-5">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Dispute center</h1>
        {rows.length === 0 ? (
          <Card className="p-5 text-[13px] text-muted">No open disputes. 🎉</Card>
        ) : (
          rows.map(({ dispute, openerName }) => {
            const evidence = evidenceRows.filter((row) => row.disputeId === dispute.id);
            return (
              <Card key={dispute.id} className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold">
                      Dispute on {dispute.entityType.replace(/_/g, " ")}
                    </p>
                    <p className="tnum mt-0.5 font-mono text-[11.5px] text-muted">
                      opened by {openerName} · {formatTimestamp(dispute.createdAt.toISOString())} · target {dispute.entityId.slice(0, 8)}…
                    </p>
                  </div>
                  <StatusBadge state={dispute.state} withIcon={false} />
                </div>
                <p className="rounded-xl bg-bg px-4 py-3 text-[13px] leading-relaxed">{dispute.reason}</p>
                {evidence.length > 0 ? (
                  <ul className="space-y-1.5 text-[12.5px] text-muted">
                    {evidence.map((item) => (
                      <li key={item.id} className="font-mono text-[11.5px]">
                        evidence: {item.evidenceType} → {item.storageReference}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {dispute.state === "resolved" ? (
                  <StatusBadge state="resolved" />
                ) : (
                  <ResolveDispute disputeId={dispute.id} />
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
