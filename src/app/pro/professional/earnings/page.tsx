import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { listPayoutsForOwner } from "@/domains/kraya/infrastructure/kraya-repository";
import { EmptyState } from "@/components/dber/ui";
import { EarningsLedger } from "@/components/pro/earnings-ledger";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export default async function ProfessionalEarningsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/earnings");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to view earnings." /></div>;
  }
  const rows = await listPayoutsForOwner(db, user.userId);
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Earnings"
        description="Every completed booking creates a payout record. Settlement status comes from the payment provider."
        nav="professional"
        current="/pro/professional/earnings"
      />
      <EarningsLedger rows={rows} />
    </div>
  );
}
