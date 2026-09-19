import { Suspense } from "react";

import { AuthCard, AuthFooterLink } from "@/components/auth/auth-kit";
import { RegisterForm, type RoleCardOption } from "@/components/auth/register-form";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS: RoleCardOption[] = [
  {
    value: "seller",
    label: "Sell on SOUQ",
    blurb: "Open a store, list products and launch group buys.",
    icon: "souq",
  },
  {
    value: "professional",
    label: "Offer services",
    blurb: "Turn your skills into services on KHIDMA.",
    icon: "khidma",
  },
  {
    value: "rental_owner",
    label: "Rent out on KRAYA",
    blurb: "List a property, vehicle, gear or space.",
    icon: "kraya",
  },
];

export default function RegisterPage() {
  return (
    <Suspense>
      <AuthCard
        title="Create your account"
        subtitle="One account for all three DBER marketplaces."
        footer={<AuthFooterLink href="/login" label="Already have an account?" linkLabel="Sign in" />}
      >
        <RegisterForm options={ROLE_OPTIONS} />
      </AuthCard>
    </Suspense>
  );
}
