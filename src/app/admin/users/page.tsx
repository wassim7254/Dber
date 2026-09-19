import { redirect } from "next/navigation";
import { desc, ilike, or, sql } from "drizzle-orm";

import { authenticate } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { users } from "@/db/schema";
import { db } from "@/db/client";
import { Card, EmptyState, formatTimestamp } from "@/components/dber/ui";

export const dynamic = "force-dynamic";

/** User management (§31): search + role/verification overview. */
export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const identity = await authenticate();
  if (!identity) redirect("/login?redirect=/admin/users");
  if (!isPrivileged(identity.role)) {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState title="Restricted" body="User management is for operations staff." /></div>;
  }
  const { q } = await searchParams;
  const term = q?.trim() ?? "";
  const rows = await db
    .select({
      id: users.id,
      role: users.role,
      displayName: users.displayName,
      email: users.email,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      transactionCount: sql<number>`(
        (select count(*) from group_buy_participants p where p.user_id = ${users.id}) +
        (select count(*) from khidma_bookings b where b.buyer_id = ${users.id} or b.professional_id = ${users.id}) +
        (select count(*) from rental_bookings r where r.renter_id = ${users.id})
      )::int`,
    })
    .from(users)
    .where(
      term
        ? or(ilike(users.displayName, `%${term}%`), ilike(users.email, `%${term}%`))
        : undefined,
    )
    .orderBy(desc(users.createdAt))
    .limit(60);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em]">Users</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">Search by name or email. Every listed action elsewhere is audited.</p>
      </header>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={term}
          placeholder="Search users…"
          className="min-h-11 flex-1 rounded-lg border border-line bg-surface px-3.5 text-[14px] outline-none focus:border-green"
          aria-label="Search users"
        />
        <button type="submit" className="rounded-lg bg-green px-4 text-[13px] font-semibold text-bg hover:bg-green-dark">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No users matched" body="Try a different name or email fragment." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-line text-[11.5px] uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-3 font-semibold">User</th>
                <th className="px-3 py-3 font-semibold">Role</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Email verified</th>
                <th className="px-3 py-3 font-semibold">Transactions</th>
                <th className="px-5 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{row.displayName}</p>
                    <p className="text-[11.5px] text-muted">{row.email ?? "—"}</p>
                  </td>
                  <td className="px-3 py-3.5 capitalize text-muted">{row.role.replace(/_/g, " ")}</td>
                  <td className="px-3 py-3.5">
                    <span className={row.status === "active" ? "text-success" : "text-danger"}>{row.status}</span>
                  </td>
                  <td className="px-3 py-3.5 text-muted">{row.emailVerifiedAt ? "yes" : "no"}</td>
                  <td className="tnum px-3 py-3.5 font-mono">{row.transactionCount}</td>
                  <td className="tnum px-5 py-3.5 font-mono text-[12px] text-muted">{formatTimestamp(row.createdAt.toISOString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
