import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-kit";
import { VerifyEmailClient } from "@/components/auth/verify-email-client";

export const dynamic = "force-dynamic";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <AuthCard title="Confirm your email" subtitle="One click and your account is fully active.">
        <VerifyEmailClient />
      </AuthCard>
    </Suspense>
  );
}
