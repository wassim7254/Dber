import { Suspense } from "react";

import { AuthCard, AuthFooterLink } from "@/components/auth/auth-kit";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <AuthCard
        title="Reset your password"
        subtitle="Enter the email on your account and we'll send a reset link."
        footer={<AuthFooterLink href="/login" label="Remembered it?" linkLabel="Back to sign in" />}
      >
        <ForgotPasswordForm />
      </AuthCard>
    </Suspense>
  );
}
