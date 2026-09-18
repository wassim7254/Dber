import { desc } from "drizzle-orm";

import { db } from "@/db/client";
import { outboxEvents } from "@/db/schema";
import { Card, StatusBadge, formatTimestamp } from "@/components/dber/ui";

/**
 * Compact operational outbox view (§55): the bridge to eventual side effects,
 * visible to ops with live status.
 */
export async function OutboxTableMini({ limit = 15 }: { limit?: number }) {
  const rows = await db
    .select({
      id: outboxEvents.id,
      eventType: outboxEvents.eventType,
      status: outboxEvents.status,
      attemptCount: outboxEvents.attemptCount,
      createdAt: outboxEvents.createdAt,
      lastError: outboxEvents.lastError,
    })
    .from(outboxEvents)
    .orderBy(desc(outboxEvents.createdAt))
    .limit(limit);

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[13px] font-semibold">Outbox stream</p>
        <p className="text-[12px] text-muted">Transactional events drained by the worker.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-muted">No events yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Attempts</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-[11.5px]">{row.eventType}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge state={row.status === "processed" ? "completed" : row.status === "failed" ? "failed" : "pending"} withIcon={false} />
                  </td>
                  <td className="tnum px-4 py-2.5 font-mono">{row.attemptCount}</td>
                  <td className="tnum px-4 py-2.5 font-mono text-[11.5px] text-muted">
                    {formatTimestamp(row.createdAt.toISOString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export async function AdminTableShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="text-[12px] text-muted">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}
