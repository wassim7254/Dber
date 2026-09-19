import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listSellerCircles } from "@/domains/souq/application/souq-read";
import { db } from "@/db/client";
import { Card, DberMoney, EmptyState, ProgressBar, StatusBadge } from "@/components/dber/ui";
import { TransitionActions } from "@/components/actions/transition-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

/** Legal seller actions per circle state (mirrors the backend machine §5.1). */
const SELLER_ACTIONS: Record<string, { action: string; label: string; requireReason?: boolean; danger?: boolean }[]> = {
  draft: [{ action: "publish", label: "Open the group" }],
  locked: [{ action: "confirm_supplier", label: "Confirm supplier" }],
  supplier_confirmed: [{ action: "begin_fulfillment", label: "Start fulfilling" }],
  fulfilling: [{ action: "mark_delivered", label: "Mark delivered" }],
  delivered: [{ action: "complete", label: "Complete order" }],
  open: [{ action: "cancel", label: "Cancel group", requireReason: true, danger: true }],
};

export default async function SellerGroupsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller/groups");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="souq" title="Seller access required" body="Sign in with a seller account to manage groups." /></div>;
  }
  const circles = await listSellerCircles(db, user.userId);
  const open = circles.filter((circle) => ["draft", "open"].includes(circle.state));
  const inFlight = circles.filter((circle) => ["locked", "supplier_confirmed", "fulfilling", "delivered"].includes(circle.state));
  const closed = circles.filter((circle) => ["completed", "expired", "cancelled", "failed_closed"].includes(circle.state));

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="Group buys"
        description="Open groups collect participants. Once locked, confirm the supplier and fulfil — the state machine guides every step."
        nav="seller"
        current="/pro/seller/groups"
      />

      <GroupSection title="Needs attention" circles={open} emptyText="No open or draft groups. Launch one from a product page." />
      <GroupSection title="Fulfillment in progress" circles={inFlight} emptyText="No locked groups right now." />
      <GroupSection title="Closed" circles={closed} emptyText="Completed, expired and cancelled groups appear here." />
    </div>
  );
}

function GroupSection({
  title,
  circles,
  emptyText,
}: {
  title: string;
  circles: Awaited<ReturnType<typeof listSellerCircles>>;
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>
      {circles.length === 0 ? (
        <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">{emptyText}</p>
      ) : (
        <Card className="divide-y divide-line">
          {circles.map((circle) => (
            <div key={circle.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <Link href={`/souq/${circle.id}`} className="truncate text-[14px] font-semibold hover:underline">
                    {circle.title}
                  </Link>
                  <StatusBadge state={circle.state} withIcon={false} />
                </div>
                <div className="mt-2 max-w-[280px]">
                  <ProgressBar value={circle.currentQuantity} max={circle.targetQuantity} label={`${circle.currentQuantity} of ${circle.targetQuantity} units`} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DberMoney amountMinor={circle.groupPriceMinor} currency={circle.currency} size="sm" />
                <TransitionActions
                  path={`/api/v1/souq/circles/${circle.id}/transition`}
                  actions={SELLER_ACTIONS[circle.state] ?? []}
                  successMessage="Done — the group state has been updated."
                />
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
