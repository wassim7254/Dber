import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { getProfessionalProfile } from "@/domains/identity/application/provider-profiles";
import { db } from "@/db/client";
import { EmptyState } from "@/components/dber/ui";
import { ProfessionalProfileForm } from "@/components/pro/professional-profile-form";
import { WorkspaceHeader } from "@/components/pro/workspace-kit";

export const dynamic = "force-dynamic";

export default async function ProfessionalProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro/professional/profile");
  if (user.role !== "professional" && user.role !== "admin") {
    return <div className="mx-auto max-w-[720px] px-5 py-10"><EmptyState icon="khidma" title="Professional access required" body="Sign in with a professional account to edit your profile." /></div>;
  }
  const profile = await getProfessionalProfile(db, user.userId);
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-6 px-5 py-8 md:px-10">
      <WorkspaceHeader
        eyebrow="Workspace · KHIDMA"
        title="Your profile"
        description="Customers choose professionals who clearly explain what they do. This profile is your portfolio."
        nav="professional"
        current="/pro/professional/profile"
      />
      <ProfessionalProfileForm
        initial={{
          headline: profile?.headline ?? "",
          bio: profile?.bio ?? "",
          specialties: profile?.specialties ?? [],
          serviceArea: profile?.serviceArea ?? "",
          yearsExperience: profile?.yearsExperience ?? null,
          languages: profile?.languages ?? [],
          serviceMode: profile?.serviceMode ?? "both",
          payoutHandle: profile?.payoutHandle ?? "",
        }}
      />
    </div>
  );
}
