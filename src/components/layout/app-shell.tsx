import Link from "next/link";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { Icon, type IconName } from "@/components/dber/icon";
import { UserSwitcher } from "@/components/layout/user-switcher";

const VERTICALS: { href: string; label: string; icon: IconName; blurb: string }[] = [
  { href: "/souq", label: "SOUQ", icon: "souq", blurb: "Group buying" },
  { href: "/khidma", label: "KHIDMA", icon: "khidma", blurb: "Services" },
  { href: "/kraya", label: "KRAYA", icon: "kraya", blurb: "Rentals" },
];

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/activity", label: "Activity", icon: "activity" },
  { href: "/saved", label: "Saved", icon: "saved" },
  { href: "/account", label: "Account", icon: "account" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const identity = await resolveIdentityFromCookies();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1440px]">
      {/* Desktop navigation rail */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-surface px-5 py-6 md:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-green-dark font-mono text-[13px] font-semibold text-bg">
            D
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.01em]">DBER</span>
        </Link>
        <p className="mt-1 pl-10 text-[11px] leading-tight text-muted">
          One platform.
          <br />
          Three marketplaces.
        </p>

        <nav aria-label="Marketplaces" className="mt-7 space-y-1">
          {VERTICALS.map((vertical) => (
            <Link
              key={vertical.href}
              href={vertical.href}
              className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-green-soft text-green-dark transition-colors group-hover:bg-green group-hover:text-bg">
                <Icon name={vertical.icon} size={16} />
              </span>
              <span>
                <span className="block text-[13px] font-semibold tracking-[0.06em]">{vertical.label}</span>
                <span className="block text-[11px] text-muted">{vertical.blurb}</span>
              </span>
            </Link>
          ))}
        </nav>

        <nav aria-label="Main" className="mt-6 space-y-0.5 border-t border-line pt-5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bg"
            >
              <Icon name={item.icon} size={17} className="text-muted" />
              {item.label}
            </Link>
          ))}
          <Link
            href="/notifications"
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bg"
          >
            <Icon name="bell" size={17} className="text-muted" />
            Notifications
          </Link>
        </nav>

        <div className="mt-auto">
          {identity ? (
            <UserSwitcher currentUserId={identity.userId} currentRole={identity.role} compact />
          ) : (
            <Link
              href="/welcome"
              className="flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark"
            >
              Sign in
              <Icon name="arrow" size={15} />
            </Link>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-green-dark font-mono text-[12px] font-semibold text-bg">
              D
            </span>
            <span className="text-[15px] font-semibold">DBER</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-bg"
            >
              <Icon name="bell" size={19} />
            </Link>
            {identity ? (
              <UserSwitcher currentUserId={identity.userId} currentRole={identity.role} />
            ) : (
              <Link
                href="/welcome"
                className="rounded-full bg-green px-4 py-2 text-[12px] font-semibold text-bg"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">{children}</main>

        {/* Mobile bottom navigation */}
        <nav
          aria-label="Bottom navigation"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          {[...NAV].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted transition-colors hover:text-ink"
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
