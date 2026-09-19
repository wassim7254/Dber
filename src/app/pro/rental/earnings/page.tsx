import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listPayoutsForOwner } from "@/domains/kraya/infrastructure/kraya-repository";
import { EmptyState } from "@/components/dber/ui";
import { EarningsLedger } from "@/components/pro/earnings-ledger";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function RentalEarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/rental/earnings");
  if (user.role !== "seller" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="kraya" title="Provider access required" body="Sign in with a provider account to view earnings." /></div>;
  }
  const rows = await listPayoutsForOwner(db, user.userId);
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KRAYA"
        title="Earnings"
        description="Rental earnings settle per completed rental, net of the marketplace fee. Deposits are tracked separately on each booking."
        nav="rental"
        current="/pro/rental/earnings"
      />
      <EarningsLedger rows={rows} />
    </div>
  );
}
