import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { authenticate } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { krayaAssets, khidmaServices, souqProducts, users } from "@/db/schema";
import { db } from "@/db/client";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ModerationActions } from "@/components/admin/moderation-actions";

export const dynamic = "force-dynamic";

/** Listing moderation (§31): all three verticals in one queue. */
export default async function AdminListingsPage() {
  const identity = await authenticate();
  if (!identity) redirect("/login?redirect=/admin/listings");
  if (!isPrivileged(identity.role)) {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState title="Restricted" body="Listing moderation is for operations staff." /></div>;
  }

  const [products, services, assets] = await Promise.all([
    db
      .select({ id: souqProducts.id, title: souqProducts.title, status: souqProducts.status, priceMinor: souqProducts.basePriceMinor, currency: souqProducts.currency, owner: users.displayName })
      .from(souqProducts)
      .innerJoin(users, eq(users.id, souqProducts.sellerId))
      .orderBy(desc(souqProducts.createdAt))
      .limit(30),
    db
      .select({ id: khidmaServices.id, title: khidmaServices.title, status: khidmaServices.status, priceMinor: khidmaServices.basePriceMinor, currency: khidmaServices.currency, owner: users.displayName })
      .from(khidmaServices)
      .innerJoin(users, eq(users.id, khidmaServices.professionalId))
      .orderBy(desc(khidmaServices.createdAt))
      .limit(30),
    db
      .select({ id: krayaAssets.id, title: krayaAssets.title, status: krayaAssets.status, priceMinor: krayaAssets.dailyRateMinor, currency: krayaAssets.currency, owner: users.displayName })
      .from(krayaAssets)
      .innerJoin(users, eq(users.id, krayaAssets.ownerId))
      .orderBy(desc(krayaAssets.createdAt))
      .limit(30),
  ]);

  const sections = [
    { label: "SOUQ products", entityType: "souq_product", rows: products },
    { label: "KHIDMA services", entityType: "khidma_service", rows: services },
    { label: "KRAYA assets", entityType: "kraya_asset", rows: assets },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-8 px-5 py-8 md:px-10">
      <header>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em]">Listing moderation</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Review listings across all marketplaces. Every decision requires a reason and is recorded
          in the moderation log, admin actions, and the audit trail.
        </p>
      </header>

      {sections.map((section) => (
        <section key={section.entityType}>
          <h2 className="mb-3 text-[17px] font-semibold">{section.label}</h2>
          {section.rows.length === 0 ? (
            <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">Nothing to review.</p>
          ) : (
            <Card className="divide-y divide-line">
              {section.rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{row.title}</p>
                    <p className="text-[12px] text-muted">by {row.owner}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <DberMoney amountMinor={row.priceMinor} currency={row.currency} size="sm" />
                    <StatusBadge state={row.status} withIcon={false} />
                    <ModerationActions entityType={section.entityType} entityId={row.id} status={row.status} />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      ))}
    </div>
  );
}
