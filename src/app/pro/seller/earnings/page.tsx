import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listPayoutsForOwner } from "@/domains/kraya/infrastructure/kraya-repository";
import { EmptyState } from "@/components/dber/ui";
import { EarningsLedger } from "@/components/pro/earnings-ledger";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function SellerEarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/seller/earnings");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="souq" title="Seller access required" body="Sign in with a seller account to view earnings." /></div>;
  }
  const rows = await listPayoutsForOwner(db, user.userId);
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · Seller"
        title="Earnings"
        description="Your marketplace earnings across SOUQ groups and KRAYA rentals, with settlement status."
        nav="seller"
        current="/pro/seller/earnings"
      />
      <EarningsLedger rows={rows} />
    </div>
  );
}
