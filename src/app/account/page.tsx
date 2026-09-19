import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/identity";
import { isDevelopment } from "@/lib/config/env";
import { Card, Eyebrow, StatusBadge } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";
import { AccountProfileForm } from "@/components/engagement/account-profile-form";
import { UserSwitcher } from "@/components/layout/user-switcher";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/account");
  const [prefs] = await db
    .select({ emailEnabled: notificationPreferences.emailEnabled })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, user.userId))
    .limit(1);

  const sections = [
    { title: "Security", body: "Password, sessions and email verification", icon: "shield" as const, href: "/account/security" },
    { title: "Payment methods", body: "Handled by the payment provider at checkout — DBER never stores card data", icon: "check" as const },
    { title: "Support", body: "Disputes, refunds, and help", icon: "bell" as const, href: "/support" },
  ];

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[680px] space-y-5">
        <Card className="flex items-center gap-4 p-6">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-green-soft font-mono text-[18px] font-semibold text-green-dark">
            {user.displayName
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="min-w-0">
            <Eyebrow>{user.role.replace(/_/g, " ")}</Eyebrow>
            <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.02em]">{user.displayName}</h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-[12.5px] text-muted">{user.email ?? "—"}</p>
              {user.email ? <StatusBadge state={user.emailVerified ? "email_verified" : "email_unverified"} withIcon={false} /> : null}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-[16px] font-semibold">Personal information</h2>
          <div className="mt-4">
            <AccountProfileForm
              initial={{
                displayName: user.displayName,
                phone: user.phone ?? "",
                country: user.country ?? "",
                locale: user.locale,
                emailNotificationsEnabled: prefs?.emailEnabled ?? true,
              }}
            />
          </div>
        </Card>

        <section className="space-y-2">
          {sections.map((section) => {
            const content = (
              <Card className="flex items-center gap-3.5 p-4 transition-colors hover:border-green">
                <span className="flex size-9 items-center justify-center rounded-lg bg-bg text-muted">
                  <Icon name={section.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{section.title}</span>
                  <span className="block text-[12px] text-muted">{section.body}</span>
                </span>
                {section.href ? <Icon name="arrow" size={15} className="text-muted" /> : null}
              </Card>
            );
            return section.href ? (
              <Link key={section.title} href={section.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={section.title}>{content}</div>
            );
          })}
        </section>

        {isDevelopment ? (
          <Card className="p-5">
            <p className="text-[13px] font-semibold">Development session</p>
            <p className="mb-3 mt-1 text-[12.5px] text-muted">
              Development identity switching — swap accounts here while exploring.
            </p>
            <UserSwitcher currentUserId={user.userId} currentRole={user.role} compact={false} />
          </Card>
        ) : null}
      </div>
    </div>
  );
}
