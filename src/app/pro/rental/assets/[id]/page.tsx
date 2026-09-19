import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { krayaAssets, krayaAvailability } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ListingStatusActions } from "@/components/pro/listing-status-actions";
import { AssetForm } from "@/components/pro/asset-form";
import { BlockedWindowsEditor } from "@/components/pro/blocked-windows-editor";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/pro/rental/assets/${id}`);

  const [asset] = await db.select().from(krayaAssets).where(eq(krayaAssets.id, id)).limit(1);
  if (!asset) notFound();
  if (user.role !== "admin" && asset.ownerId !== user.userId) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <EmptyState icon="kraya" title="Not your asset" body="You can only edit assets you own." />
      </div>
    );
  }

  const blocked = await db
    .select()
    .from(krayaAvailability)
    .where(eq(krayaAvailability.assetId, asset.id))
    .orderBy(desc(krayaAvailability.startTime));

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KRAYA"
        title={asset.title}
        description="Edit listing details, manage the calendar, and control the asset's status."
        nav="rental"
        current="/pro/rental/assets"
      />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <StatusBadge state={asset.status} withIcon={false} />
          <DberMoney amountMinor={asset.dailyRateMinor} currency={asset.currency} size="md" />
          <span className="text-[12px] text-muted">per day</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/kraya/${asset.id}`} className="text-[13px] font-semibold text-azure-dark hover:underline">
            View public page →
          </Link>
          <ListingStatusActions
            transitionPath={`/api/v1/kraya/assets/${asset.id}/transition`}
            status={asset.status}
          />
        </div>
      </Card>

      <Card className="p-6">
        <AssetForm
          assetId={asset.id}
          initial={{
            title: asset.title,
            description: asset.description,
            category: asset.category,
            dailyRateMinor: asset.dailyRateMinor,
            depositMinor: asset.depositMinor,
            location: asset.location,
            capacity: asset.capacity,
            rules: asset.rules,
            minDurationHours: asset.minDurationHours,
            images: asset.images,
          }}
        />
      </Card>

      <section>
        <h2 className="mb-3 text-[17px] font-semibold">Blocked windows</h2>
        <p className="mb-3 text-[13px] text-muted">
          Maintenance and personal use — renters can never book these ranges.
        </p>
        <BlockedWindowsEditor
          assetId={asset.id}
          windows={blocked.map((window) => ({
            id: window.id,
            startTime: window.startTime.toISOString(),
            endTime: window.endTime.toISOString(),
            note: window.note,
          }))}
        />
      </section>
    </div>
  );
}
