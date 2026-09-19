import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { krayaAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ListingStatusActions } from "@/components/pro/listing-status-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function RentalAssetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/rental/assets");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="kraya" title="Provider access required" body="Sign in with a provider account to manage assets." /></div>;
  }
  const assets = await db.select().from(krayaAssets).where(eq(krayaAssets.ownerId, user.userId)).orderBy(desc(krayaAssets.createdAt));
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KRAYA"
        title="Your assets"
        description="Apartments, vehicles, equipment — anything rentable by date. Publishing requires photos, location and pricing."
        nav="rental"
        current="/pro/rental/assets"
      />
      <div className="flex justify-end">
        <Link href="/pro/rental/assets/new" className="rounded-lg bg-azure px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-azure-dark">
          + New asset
        </Link>
      </div>
      {assets.length === 0 ? (
        <EmptyState
          icon="kraya"
          title="No assets yet"
          body="Create your first rental listing — draft it, add photos, then publish when ready."
          action={
            <Link href="/pro/rental/assets/new" className="rounded-lg bg-azure px-4 py-2 text-[13px] font-semibold text-white hover:bg-azure-dark">
              Create an asset
            </Link>
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {assets.map((asset) => (
            <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Link href={`/pro/rental/assets/${asset.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                  {asset.title}
                </Link>
                <p className="text-[12px] capitalize text-muted">
                  {asset.category} · {asset.location || "no location set"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DberMoney amountMinor={asset.dailyRateMinor} currency={asset.currency} size="sm" />
                <span className="text-[11.5px] text-muted">+ deposit</span>
                <StatusBadge state={asset.status} withIcon={false} />
                <ListingStatusActions
                  transitionPath={`/api/v1/kraya/assets/${asset.id}/transition`}
                  status={asset.status}
                  compact
                />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
