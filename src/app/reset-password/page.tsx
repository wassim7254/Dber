import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-kit";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <AuthCard
        title="Choose a new password"
        subtitle="Pick something strong — at least 10 characters with a letter and a number."
      >
        <ResetPasswordForm />
      </AuthCard>
    </Suspense>
  );
}
