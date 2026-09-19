import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { Card, EmptyState, Eyebrow } from "@/components/dber/ui";

export const dynamic = "force-dynamic";

const WORKSPACES = [
  {
    href: "/pro/seller",
    eyebrow: "SOUQ + KRAYA",
    title: "Seller workspace",
    body: "Create products, launch group buys, manage rental assets and track earnings.",
  },
  {
    href: "/pro/professional",
    eyebrow: "KHIDMA",
    title: "Professional workspace",
    body: "Publish what you do, quote requests, manage bookings, availability and earnings.",
  },
] as const;

export default async function ProLandingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro");

  if (user.role === "seller") redirect("/pro/seller");
  if (user.role === "professional") redirect("/pro/professional");
  if (user.role === "admin" || user.role === "ops_admin") {
    return (
      <div className="mx-auto w-full max-w-[820px] space-y-6 px-5 py-10 md:px-10">
        <Eyebrow>Workspace</Eyebrow>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em]">Choose a workspace</h1>
        <p className="text-[13.5px] text-muted">Administrators can operate both provider workspaces.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {WORKSPACES.map((workspace) => (
            <Link key={workspace.href} href={workspace.href}>
              <Card className="h-full p-5 transition-colors hover:border-green">
                <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-muted">{workspace.eyebrow}</p>
                <p className="mt-2 text-[16px] font-semibold">{workspace.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{workspace.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] px-5 py-10">
      <EmptyState
        icon="spark"
        title="Become a provider"
        body="Seller and professional workspaces open once your account has a provider role. Contact support to switch your account."
        action={
          <Link href="/support" className="rounded-lg bg-green px-4 py-2 text-[13px] font-semibold text-bg hover:bg-green-dark">
            Contact support
          </Link>
        }
      />
    </div>
  );
}
