import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { EmptyState } from "@/components/dber/ui";
import { ServiceForm } from "@/components/pro/service-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/services/new");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to create services." /></div>;
  }
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="New service"
        description="Describe the work as if to a customer who knows nothing about your trade."
        nav="professional"
        current="/pro/professional/services"
      />
      <ServiceForm />
    </div>
  );
}
