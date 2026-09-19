import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { EmptyState } from "@/components/dber/ui";
import { AssetForm } from "@/components/pro/asset-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function NewAssetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/rental/assets/new");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="kraya" title="Provider access required" body="Sign in with a provider account to create assets." /></div>;
  }
  return (
    <div className="mx-auto w-full max-w-[780px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KRAYA"
        title="New rental asset"
        description="Describe the asset honestly and completely — renters decide from photos, rates and rules."
        nav="rental"
        current="/pro/rental/assets"
      />
      <AssetForm />
    </div>
  );
}
