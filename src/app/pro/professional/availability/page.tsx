import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { khidmaAvailability } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { EmptyState } from "@/components/dber/ui";
import { AvailabilityEditor } from "@/components/pro/availability-editor";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/availability");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to manage availability." /></div>;
  }
  const slots = await db.select().from(khidmaAvailability).where(eq(khidmaAvailability.professionalId, user.userId));
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Weekly availability"
        description="Customers can book inside these windows. Overlaps are impossible — the database rejects double bookings."
        nav="professional"
        current="/pro/professional/availability"
      />
      <AvailabilityEditor
        initialSlots={slots.map((slot) => ({ weekday: slot.weekday, startMinute: slot.startMinute, endMinute: slot.endMinute }))}
      />
    </div>
  );
}
