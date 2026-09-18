import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { Card, Eyebrow } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";
import { UserSwitcher } from "@/components/layout/user-switcher";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const identity = await resolveIdentityFromCookies();
  if (!identity) redirect("/welcome");
  const [user] = await db.select().from(users).where(eq(users.id, identity.userId)).limit(1);

  const sections = [
    { title: "Personal information", body: "Name and contact details", icon: "account" as const },
    { title: "Payment methods", body: "Managed by the payment provider at checkout", icon: "shield" as const },
    { title: "Notification preferences", body: "Choose what DBER tells you about", icon: "bell" as const },
    { title: "Support", body: "Disputes, refunds, and help", icon: "khidma" as const, href: "/support" },
  ];

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[680px] space-y-5">
        <Card className="flex items-center gap-4 p-6">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-green-soft font-mono text-[18px] font-semibold text-green-dark">
            {(user?.displayName ?? "DB")
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="min-w-0">
            <Eyebrow>{identity.role}</Eyebrow>
            <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-[-0.02em]">
              {user?.displayName ?? "Account"}
            </h1>
            <p className="text-[12.5px] text-muted">{user?.email ?? "—"}</p>
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
                <Icon name="arrow" size={15} className="text-muted" />
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

        <Card className="p-5">
          <p className="text-[13px] font-semibold">Development session</p>
          <p className="mb-3 mt-1 text-[12.5px] text-muted">
            DBER MVP uses development identity switching — swap accounts here while exploring.
          </p>
          <UserSwitcher currentUserId={identity.userId} currentRole={identity.role} compact={false} />
        </Card>
      </div>
    </div>
  );
}
