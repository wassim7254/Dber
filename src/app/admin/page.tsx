import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { Card, Eyebrow } from "@/components/dber/ui";
import { OutboxTableMini } from "@/components/dber/tables";

export const metadata = { title: "Operations" };

async function countOf(query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute(query);
  const rows = (result as unknown as { rows?: Record<string, unknown>[] }).rows ?? (result as unknown as Record<string, unknown>[]);
  const first = rows[0] as { count?: number | string } | undefined;
  return Number(first?.count ?? 0);
}

export default async function AdminPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");
  if (!isPrivileged(identity.role)) redirect("/");

  const [openCircles, activeBookings, captured, refundPending, openDisputes, pendingCancellations, failedOutbox] =
    await Promise.all([
      countOf(sql`SELECT count(*)::int AS count FROM group_buy_circles WHERE state = 'open'`),
      countOf(sql`SELECT count(*)::int AS count FROM khidma_bookings WHERE state IN ('confirmed','in_progress')`),
      countOf(sql`SELECT count(*)::int AS count FROM payments WHERE state = 'captured'`),
      countOf(sql`SELECT count(*)::int AS count FROM payments WHERE state IN ('refund_pending') OR EXISTS (SELECT 1 FROM refunds WHERE refunds.payment_id = payments.id AND refunds.state IN ('requested','provider_pending'))`),
      countOf(sql`SELECT count(*)::int AS count FROM disputes WHERE state != 'resolved'`),
      countOf(sql`SELECT count(*)::int AS count FROM cancellation_requests WHERE state = 'pending'`),
      countOf(sql`SELECT count(*)::int AS count FROM outbox_events WHERE status = 'failed'`),
    ]);

  const metrics = [
    { label: "Open groups", value: openCircles },
    { label: "Active service bookings", value: activeBookings },
    { label: "Captured payments", value: captured },
    { label: "Refunds in flight", value: refundPending },
    { label: "Open disputes", value: openDisputes },
    { label: "Pending cancellations", value: pendingCancellations },
    { label: "Failed outbox events", value: failedOutbox },
  ];

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1080px] space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Eyebrow>Operations console</Eyebrow>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em] md:text-[30px]">System health & queues</h1>
          </div>
          <nav className="flex flex-wrap gap-1.5 text-[12.5px] font-medium">
            {[
              { href: "/admin/payments", label: "Payments" },
              { href: "/admin/disputes", label: "Disputes" },
              { href: "/admin/cancellations", label: "Cancellations" },
              { href: "/admin/audit", label: "Audit" },
              { href: "/admin/outbox", label: "Outbox" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="rounded-full border border-line px-3.5 py-1.5 transition-colors hover:border-green hover:text-green-dark">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label} className="p-4">
              <p className="tnum font-mono text-[26px] font-semibold leading-none">{metric.value}</p>
              <p className="mt-1.5 text-[12px] text-muted">{metric.label}</p>
            </Card>
          ))}
        </div>

        <OutboxTableMini limit={8} />
      </div>
    </div>
  );
}
