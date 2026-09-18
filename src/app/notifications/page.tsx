import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { Card, EmptyState, formatTimestamp } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";
import { MarkRead } from "@/components/actions/mark-read";
import { redirect } from "next/navigation";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, identity.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const unread = rows.filter((row) => row.readAt === null).length;

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[680px] space-y-5">
        <header>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Notifications</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {unread > 0 ? `${unread} unread — grouped by what needs your attention.` : "You're all caught up."}
          </p>
        </header>

        {rows.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nothing here yet"
            body="Payment updates, group progress, booking confirmations, and dispute decisions arrive here."
          />
        ) : (
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className={`flex items-start gap-3 p-4 ${row.readAt ? "opacity-70" : ""}`}>
                  <span
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${
                      row.kind === "payment_attention" || row.kind === "dispute_update"
                        ? "bg-sand-soft text-warn"
                        : "bg-green-soft text-green-dark"
                    }`}
                  >
                    <Icon name={row.kind === "payment_attention" ? "alert" : row.kind === "refund_completed" ? "check" : "bell"} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold">{row.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{row.body}</p>
                    <p className="tnum mt-1 font-mono text-[11px] text-muted">{formatTimestamp(row.createdAt.toISOString())}</p>
                  </div>
                  {!row.readAt ? <MarkRead notificationId={row.id} /> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
