import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { khidmaServices } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { Card, DberMoney, EmptyState, StatusBadge } from "@/components/dber/ui";
import { ListingStatusActions } from "@/components/pro/listing-status-actions";
import { ServiceForm } from "@/components/pro/service-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/pro/professional/services/${id}`);

  const [service] = await db.select().from(khidmaServices).where(eq(khidmaServices.id, id)).limit(1);
  if (!service) notFound();
  if (user.role !== "admin" && service.professionalId !== user.userId) {
    return (
      <div className="mx-auto max-w-[720px] px-5 py-10">
        <EmptyState icon="khidma" title="Not your service" body="You can only edit services you own." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title={service.title}
        description="Edit the service details and manage its status."
        nav="professional"
        current="/pro/professional/services"
      />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <StatusBadge state={service.status} withIcon={false} />
          <DberMoney amountMinor={service.basePriceMinor} currency={service.currency} size="md" />
        </div>
        <ListingStatusActions
          transitionPath={`/api/v1/khidma/services/${service.id}`}
          status={service.status}
        />
      </Card>

      <Card className="p-6">
        <ServiceForm
          serviceId={service.id}
          initial={{
            title: service.title,
            specialty: service.specialty,
            description: service.description,
            category: service.category,
            basePriceMinor: service.basePriceMinor,
            durationMinutes: service.durationMinutes,
          }}
        />
      </Card>

      <p className="text-[12.5px] text-muted">
        <Link href={`/khidma/pro/${service.professionalId}`} className="font-semibold text-clay-dark hover:underline">
          View your public profile →
        </Link>
      </p>
    </div>
  );
}
