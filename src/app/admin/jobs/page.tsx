import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { authenticate } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { db, sql as coreSql } from "@/db/client";
import { Card, EmptyState, formatTimestamp } from "@/components/dber/ui";

export const dynamic = "force-dynamic";

interface HealthStat {
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad";
  detail?: string;
}

/** Job & system health (§31/§61): observable recovery surface for operators. */
export default async function AdminJobsPage() {
  const identity = await authenticate();
  if (!identity) redirect("/login?redirect=/admin/jobs");
  if (!isPrivileged(identity.role)) {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState title="Restricted" body="Job health is for operations staff." /></div>;
  }

  const result = await db.execute(sql`
    select
      (select count(*) from outbox_events where status = 'pending')::int as outbox_pending,
      (select count(*) from outbox_events where status = 'failed')::int as outbox_failed,
      (select count(*) from outbox_events where status = 'processing' and locked_at < now() - interval '5 minutes')::int as outbox_stuck,
      (select count(*) from outbox_events where status = 'processed' and processed_at > now() - interval '5 minutes')::int as outbox_recent_processed,
      (select count(*) from khidma_bookings where state = 'payment_pending' and created_at < now() - interval '15 minutes')::int as khidma_stale,
      (select count(*) from rental_bookings where state = 'payment_pending' and created_at < now() - interval '15 minutes')::int as kraya_stale,
      (select count(*) from group_buy_circles where state = 'open' and deadline_at < now())::int as circles_due_expiry,
      (select count(*) from payments where state in ('authorization_pending','capture_pending','refund_pending') and updated_at < now() - interval '5 minutes')::int as payments_stuck,
      (select count(*) from refunds where state = 'provider_pending')::int as refunds_pending,
      (select count(*) from sessions where expires_at > now() and revoked_at is null)::int as active_sessions,
      (select count(*) from idempotency_keys where status = 'completed' and expires_at < now())::int as idempotency_to_clean
  `);
  const first = (result as unknown as Record<string, unknown>[])[0];
  const row = (first ?? {}) as Record<string, number>;

  const stats: HealthStat[] = [
    { label: "Outbox pending", value: String(row.outbox_pending ?? 0), tone: (row.outbox_pending ?? 0) < 100 ? "ok" : "warn" },
    { label: "Outbox failed (dead-letter)", value: String(row.outbox_failed ?? 0), tone: (row.outbox_failed ?? 0) === 0 ? "ok" : "bad" },
    { label: "Outbox stuck (locked > 5 min)", value: String(row.outbox_stuck ?? 0), tone: (row.outbox_stuck ?? 0) === 0 ? "ok" : "bad" },
    { label: "Processed last 5 min", value: String(row.outbox_recent_processed ?? 0), tone: (row.outbox_recent_processed ?? 0) > 0 ? "ok" : "warn", detail: "Worker heartbeat — 0 may mean the worker loop is down" },
    { label: "Khidma bookings past TTL", value: String(row.khidma_stale ?? 0), tone: (row.khidma_stale ?? 0) === 0 ? "ok" : "warn" },
    { label: "Rentals past TTL", value: String(row.kraya_stale ?? 0), tone: (row.kraya_stale ?? 0) === 0 ? "ok" : "warn" },
    { label: "Circles due expiry", value: String(row.circles_due_expiry ?? 0), tone: (row.circles_due_expiry ?? 0) === 0 ? "ok" : "warn" },
    { label: "Payments stuck in-flight", value: String(row.payments_stuck ?? 0), tone: (row.payments_stuck ?? 0) === 0 ? "ok" : "warn" },
    { label: "Refunds at provider", value: String(row.refunds_pending ?? 0), tone: "ok" },
    { label: "Active sessions", value: String(row.active_sessions ?? 0), tone: "ok" },
    { label: "Idempotency keys to clean", value: String(row.idempotency_to_clean ?? 0), tone: "ok" },
  ];

  const dbOk = await coreSql`select 1 as ok`.then(() => true).catch(() => false);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em]">Jobs & system health</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          All figures are computed live from the database — the same tables the worker uses.
        </p>
      </header>

      <Card className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-[13px] font-semibold">Database connectivity</p>
          <p className="text-[12px] text-muted">Source-of-truth reachability check</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${dbOk ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
          {dbOk ? "Healthy" : "Unreachable"}
        </span>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[13px] font-medium">{stat.label}</p>
              {stat.detail ? <p className="text-[11.5px] leading-snug text-muted">{stat.detail}</p> : null}
            </div>
            <span
              className={`tnum rounded-full px-3 py-1 font-mono text-[13px] font-semibold ${
                stat.tone === "ok"
                  ? "bg-success-soft text-success"
                  : stat.tone === "warn"
                    ? "bg-sand-soft text-warn"
                    : "bg-danger-soft text-danger"
              }`}
            >
              {stat.value}
            </span>
          </Card>
        ))}
      </div>

      <p className="text-[12px] leading-relaxed text-muted">
        Health snapshot generated at {formatTimestamp(new Date().toISOString())}. Failed outbox
        events retain their last error for inspection in the Outbox page.
      </p>
    </div>
  );
}
