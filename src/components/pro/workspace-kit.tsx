import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/identity";
import { Eyebrow } from "@/components/dber/ui";

export const dynamic = "force-dynamic";

type Workspace = "seller" | "professional" | "rental" | null;

export async function resolveWorkspace(): Promise<{ userId: string; role: string; workspace: Workspace }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/pro");
  if (user.role === "seller") return { userId: user.userId, role: user.role, workspace: "seller" };
  if (user.role === "professional") return { userId: user.userId, role: user.role, workspace: "professional" };
  if (user.role === "admin" || user.role === "ops_admin") {
    return { userId: user.userId, role: user.role, workspace: "seller" };
  }
  return { userId: user.userId, role: user.role, workspace: null };
}

const NAV: Record<Exclude<Workspace, null>, { href: string; label: string }[]> = {
  seller: [
    { href: "/pro/seller", label: "Overview" },
    { href: "/pro/seller/products", label: "Products" },
    { href: "/pro/seller/groups", label: "Groups" },
    { href: "/pro/seller/inventory", label: "Inventory" },
    { href: "/pro/seller/earnings", label: "Earnings" },
    { href: "/pro/seller/settings", label: "Store settings" },
  ],
  professional: [
    { href: "/pro/professional", label: "Overview" },
    { href: "/pro/professional/services", label: "Services" },
    { href: "/pro/professional/requests", label: "Requests & quotes" },
    { href: "/pro/professional/bookings", label: "Bookings" },
    { href: "/pro/professional/availability", label: "Availability" },
    { href: "/pro/professional/profile", label: "Profile" },
    { href: "/pro/professional/earnings", label: "Earnings" },
  ],
  rental: [
    { href: "/pro/rental", label: "Overview" },
    { href: "/pro/rental/assets", label: "Assets" },
    { href: "/pro/rental/bookings", label: "Bookings" },
    { href: "/pro/rental/earnings", label: "Earnings" },
  ],
};

export function WorkspaceNav({ workspace, current }: { workspace: Exclude<Workspace, null>; current: string }) {
  return (
    <nav aria-label="Workspace sections" className="flex flex-wrap gap-1.5">
      {NAV[workspace].map((item) => {
        const active = current === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              active ? "bg-green-dark text-bg" : "border border-line text-ink hover:border-green"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  nav,
  current,
}: {
  eyebrow: string;
  title: string;
  description: string;
  nav: Exclude<Workspace, null>;
  current: string;
}) {
  return (
    <header className="space-y-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
      <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-muted">{description}</p>
      <WorkspaceNav workspace={nav} current={current} />
    </header>
  );
}
