import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AuthCard, AuthFooterLink } from "@/components/auth/auth-kit";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/identity";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return (
    <Suspense>
      <AuthCard
        title="Welcome back"
        subtitle="Sign in to manage your groups, bookings and rentals."
        footer={<AuthFooterLink href="/register" label="New to DBER?" linkLabel="Create an account" />}
      >
        <LoginForm />
      </AuthCard>
    </Suspense>
  );
}
