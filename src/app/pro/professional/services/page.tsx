import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { khidmaServices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ListingStatusActions } from "@/components/pro/listing-status-actions";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function ProfessionalServicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/services");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to manage services." /></div>;
  }
  const services = await db.select().from(khidmaServices).where(eq(khidmaServices.professionalId, user.userId));
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Your services"
        description="Each service says exactly what you do, for how long, and from what price. Publish when it's ready."
        nav="professional"
        current="/pro/professional/services"
      />
      <div className="flex justify-end">
        <Link href="/pro/professional/services/new" className="rounded-lg bg-clay px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-clay-dark">
          + New service
        </Link>
      </div>
      {services.length === 0 ? (
        <EmptyState
          icon="khidma"
          title="No services yet"
          body="Start with one service you can deliver brilliantly — you can add more anytime."
          action={
            <Link href="/pro/professional/services/new" className="rounded-lg bg-clay px-4 py-2 text-[13px] font-semibold text-white hover:bg-clay-dark">
              Create your first service
            </Link>
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {services.map((service) => (
            <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <Link href={`/pro/professional/services/${service.id}`} className="block truncate text-[14px] font-semibold hover:underline">
                  {service.title}
                </Link>
                <p className="text-[12px] text-muted">
                  {service.specialty} · {service.durationMinutes} min
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DberMoney amountMinor={service.basePriceMinor} currency={service.currency} size="sm" />
                <StatusBadge state={service.status} withIcon={false} />
                <ListingStatusActions
                  transitionPath={`/api/v1/khidma/services/${service.id}`}
                  status={service.status}
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
