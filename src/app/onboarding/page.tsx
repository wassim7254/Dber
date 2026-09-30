import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { listUserRoles } from "@/domains/identity/application/role-service";
import { Card, Eyebrow } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/onboarding");

  const roles = await listUserRoles(db, user.userId);

  // If user has a single provider role, route directly to its dedicated onboarding
  if (roles.length === 2) {
    if (roles.includes("seller")) redirect("/sell/onboarding");
    if (roles.includes("professional")) redirect("/pro/onboarding");
    if (roles.includes("rental_owner")) redirect("/rent-out/onboarding");
  }

  // If customer only, simple welcome card with start exploring button
  if (roles.length <= 1 && roles.includes("buyer")) {
    return (
      <div className="mx-auto max-w-[620px] px-4 py-12 md:py-20">
        <Card className="p-8 text-center shadow-[var(--shadow-float)] border-line/60">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-green-soft text-green-dark">
            <Icon name="check" size={32} />
          </span>
          <Eyebrow>Welcome to DBER</Eyebrow>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-ink">
            Your account is ready, {user.displayName.split(" ")[0]}!
          </h1>
          <p className="mx-auto mt-2 max-w-[42ch] text-[14px] leading-relaxed text-muted">
            Explore group buying on SOUQ, hire trusted local professionals on KHIDMA, and rent gear and spaces on KRAYA.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row justify-center">
            <Link
              href="/"
              className="flex h-12 items-center justify-center rounded-2xl bg-green px-8 text-[14px] font-semibold text-bg shadow-sm hover:bg-green-dark transition-transform active:scale-95"
            >
              Start exploring
            </Link>
            <Link
              href="/account"
              className="flex h-12 items-center justify-center rounded-2xl border border-line px-6 text-[14px] font-semibold text-ink hover:bg-stone-50 transition-colors"
            >
              Complete profile
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Multiple roles: Multi-sided landing hub
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 md:py-16">
      <div className="space-y-6">
        <div className="text-center">
          <Eyebrow>Account Setup</Eyebrow>
          <h1 className="mt-1 text-[30px] font-semibold tracking-tight text-ink">
            Welcome to DBER, {user.displayName.split(" ")[0]}!
          </h1>
          <p className="mt-1.5 text-[14.5px] text-muted">
            You unlocked multiple roles. Where would you like to begin?
          </p>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          {roles.includes("seller") ? (
            <Link
              href="/sell/onboarding"
              className="group flex flex-col justify-between rounded-3xl border border-line/70 bg-surface p-6 shadow-[var(--shadow-card)] hover:border-green/50 hover:shadow-[var(--shadow-float)] transition-all"
            >
              <div className="space-y-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-green-soft text-green-dark">
                  <Icon name="souq" size={24} />
                </span>
                <h2 className="text-[17px] font-semibold text-ink">Set up your Store</h2>
                <p className="text-[13px] text-muted leading-relaxed">
                  Configure your store name, delivery options, and add your first product on SOUQ.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-green-dark group-hover:underline">
                Start store onboarding &rarr;
              </span>
            </Link>
          ) : null}

          {roles.includes("professional") ? (
            <Link
              href="/pro/onboarding"
              className="group flex flex-col justify-between rounded-3xl border border-line/70 bg-surface p-6 shadow-[var(--shadow-card)] hover:border-clay/50 hover:shadow-[var(--shadow-float)] transition-all"
            >
              <div className="space-y-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-clay-soft text-clay-dark">
                  <Icon name="khidma" size={24} />
                </span>
                <h2 className="text-[17px] font-semibold text-ink">Pro Profile</h2>
                <p className="text-[13px] text-muted leading-relaxed">
                  Add your skills, hourly rate, and publish your first service on KHIDMA.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-clay-dark group-hover:underline">
                Set up pro profile &rarr;
              </span>
            </Link>
          ) : null}

          {roles.includes("rental_owner") ? (
            <Link
              href="/rent-out/onboarding"
              className="group flex flex-col justify-between rounded-3xl border border-line/70 bg-surface p-6 shadow-[var(--shadow-card)] hover:border-azure/50 hover:shadow-[var(--shadow-float)] transition-all"
            >
              <div className="space-y-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-azure-soft text-azure-dark">
                  <Icon name="kraya" size={24} />
                </span>
                <h2 className="text-[17px] font-semibold text-ink">List on KRAYA</h2>
                <p className="text-[13px] text-muted leading-relaxed">
                  Set rental rules, deposits, and list your vehicle, property, or equipment.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-azure-dark group-hover:underline">
                Create rental listing &rarr;
              </span>
            </Link>
          ) : null}

          <Link
            href="/"
            className="group flex flex-col justify-between rounded-3xl border border-line/70 bg-surface p-6 shadow-[var(--shadow-card)] hover:border-ink/30 hover:shadow-[var(--shadow-float)] transition-all"
          >
            <div className="space-y-2">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-stone-100 text-ink">
                <Icon name="home" size={24} />
              </span>
              <h2 className="text-[17px] font-semibold text-ink">Go to Marketplace</h2>
              <p className="text-[13px] text-muted leading-relaxed">
                Start discovering deals, searching services, and renting immediately.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink group-hover:underline">
              Enter DBER &rarr;
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
