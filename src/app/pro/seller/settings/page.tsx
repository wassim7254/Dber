import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { getSellerProfile } from "@/domains/identity/application/provider-profiles";
import { db } from "@/db/client";
import { EmptyState } from "@/components/dber/ui";
import { SellerSettingsForm } from "@/components/pro/seller-settings-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function SellerSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller/settings");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="souq" title="Seller access required" body="Sign in with a seller account to manage store settings." /></div>;
  }
  const profile = await getSellerProfile(db, user.userId);
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="Store settings"
        description="Your storefront identity, fulfillment details and payout configuration."
        nav="seller"
        current="/pro/seller/settings"
      />
      <SellerSettingsForm
        initial={{
          storeName: profile?.storeName ?? user.displayName,
          description: profile?.description ?? "",
          contactEmail: profile?.contactEmail ?? user.email ?? "",
          contactPhone: profile?.contactPhone ?? user.phone ?? "",
          city: profile?.city ?? "",
          country: profile?.country ?? "MA",
          deliveryInfo: profile?.deliveryInfo ?? "",
          pickupInfo: profile?.pickupInfo ?? "",
          payoutHandle: profile?.payoutHandle ?? "",
        }}
      />
    </div>
  );
}
