import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { getActivityFeed, type ActivityEntry } from "@/lib/activity-read";
import { EmptyState, SectionTitle } from "@/components/dber/ui";
import { TransactionCard } from "@/components/dber/cards";

export const metadata = { title: "Activity" };

const TABS = ["all", "active", "completed", "cancelled", "disputed"] as const;
type Tab = (typeof TABS)[number];

const ACTIVE_STATES = new Set(["open", "locked", "supplier_confirmed", "fulfilling", "delivered", "payment_pending", "confirmed", "in_progress", "active", "requested", "quoted"]);
const DONE_STATES = new Set(["completed", "delivered"]);
const CANCELLED_STATES = new Set(["cancelled", "expired", "failed_closed", "refunded", "voided"]);
const DISPUTED_STATES = new Set(["disputed", "opened", "under_review"]);

function matchesTab(entry: ActivityEntry, tab: Tab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "active":
      return ACTIVE_STATES.has(entry.state);
    case "completed":
      return DONE_STATES.has(entry.state);
    case "cancelled":
      return CANCELLED_STATES.has(entry.state);
    case "disputed":
      return DISPUTED_STATES.has(entry.state);
  }
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes((tabParam ?? "all") as Tab) ? ((tabParam ?? "all") as Tab) : "all";
  const all = await getActivityFeed(db, identity.userId);
  const entries = all.filter((entry) => matchesTab(entry, tab));

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[860px] space-y-6">
        <header>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] md:text-[30px]">Activity</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Every transaction across SOUQ, KHIDMA, and KRAYA — with its live state and next action.
          </p>
        </header>

        <nav aria-label="Activity filters" className="flex flex-wrap gap-1.5">
          {TABS.map((item) => (
            <Link
              key={item}
              href={`/activity?tab=${item}`}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors ${
                item === tab ? "bg-green-dark text-bg" : "bg-surface text-muted hover:text-ink border border-line"
              }`}
            >
              {item}
            </Link>
          ))}
        </nav>

        {entries.length === 0 ? (
          <EmptyState
            icon="activity"
            title={tab === "all" ? "No transactions yet" : `No ${tab} transactions`}
            body="Your group buys, service bookings, and rentals all appear here with their current state and what happens next."
            action={
              <Link href="/" className="rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-green-dark">
                Explore marketplaces
              </Link>
            }
          />
        ) : (
          <section className="space-y-3">
            <SectionTitle>{entries.length} transaction{entries.length === 1 ? "" : "s"}</SectionTitle>
            {entries.map((entry) => (
              <TransactionCard
                key={entry.key}
                href={entry.href}
                vertical={entry.vertical}
                title={entry.title}
                state={entry.state}
                amountMinor={entry.amountMinor}
                currency={entry.currency}
                when={new Date(entry.when).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                nextAction={entry.nextAction}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
