import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AdminTableShell } from "@/components/dber/tables";
import { formatTimestamp } from "@/components/dber/ui";

export const metadata = { title: "Audit — Admin" };

export default async function AdminAuditPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");
  if (!isPrivileged(identity.role)) redirect("/");

  const rows = await db
    .select({
      entry: auditLog,
      actorName: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(60);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1080px] space-y-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Audit history</h1>
        <AdminTableShell title="Append-only audit log" subtitle="Who did what, from which state to which, and why.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Before → After</th>
                  <th className="px-3 py-2 font-medium">Request</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, actorName }) => {
                  const before = entry.before as { state?: string } | null;
                  const after = entry.after as { state?: string } | null;
                  return (
                    <tr key={entry.id} className="border-b border-line/60 last:border-0">
                      <td className="tnum px-3 py-2.5 font-mono text-[11px] text-muted">{formatTimestamp(entry.createdAt.toISOString())}</td>
                      <td className="px-3 py-2.5">{actorName ?? entry.actorRole}</td>
                      <td className="px-3 py-2.5 font-mono text-[11.5px]">{entry.action}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px]">{entry.entityType.slice(0, 8)}…</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                        {before?.state ?? "—"} → {after?.state ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted">{entry.requestId.slice(0, 8)}…</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminTableShell>
      </div>
    </div>
  );
}
