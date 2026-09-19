import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { payments, refunds, users } from "@/db/schema";
import { authenticate } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { redirect } from "next/navigation";
import { AdminTableShell } from "@/components/dber/tables";
import { DberMoney, StatusBadge, formatTimestamp } from "@/components/dber/ui";

export const metadata = { title: "Payments — Admin" };

export default async function AdminPaymentsPage() {
  const identity = await authenticate();
  if (!identity) redirect("/welcome");
  if (!isPrivileged(identity.role)) redirect("/");

  const rows = await db
    .select({
      payment: payments,
      payerName: users.displayName,
    })
    .from(payments)
    .innerJoin(users, eq(payments.payerId, users.id))
    .orderBy(desc(payments.createdAt))
    .limit(30);
  const refundRows = await db.select().from(refunds).orderBy(desc(refunds.createdAt)).limit(15);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1080px] space-y-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Payments & refunds</h1>

        <AdminTableShell title="Payments" subtitle="Server-side state, provider-verified.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="px-3 py-2 font-medium">ID</th>
                  <th className="px-3 py-2 font-medium">Payer</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">State</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ payment, payerName }) => (
                  <tr key={payment.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-[11px]">{payment.id.slice(0, 8)}…</td>
                    <td className="px-3 py-2.5">{payerName}</td>
                    <td className="px-3 py-2.5 font-mono text-[11.5px]">{payment.category}</td>
                    <td className="px-3 py-2.5"><DberMoney amountMinor={payment.amountMinor} currency={payment.currency} size="sm" /></td>
                    <td className="px-3 py-2.5"><StatusBadge state={payment.state === "refunded" ? "refunded_payment" : payment.state} withIcon={false} /></td>
                    <td className="tnum px-3 py-2.5 font-mono text-[11px] text-muted">{formatTimestamp(payment.createdAt.toISOString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminTableShell>

        <AdminTableShell title="Refunds" subtitle="Linked to original payments; headroom-enforced.">
          {refundRows.length === 0 ? (
            <p className="text-[13px] text-muted">No refunds yet.</p>
          ) : (
            <ul className="space-y-2">
              {refundRows.map((refund) => (
                <li key={refund.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="font-mono text-[11px]">{refund.id.slice(0, 8)}… · {refund.reason}</span>
                  <span className="flex items-center gap-3">
                    <DberMoney amountMinor={refund.amountMinor} currency="MAD" size="sm" />
                    <StatusBadge state={refund.state} withIcon={false} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminTableShell>
      </div>
    </div>
  );
}
