import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/identity";
import { isPrivileged } from "@/lib/auth/rbac";
import { isDevelopment } from "@/lib/config/env";
import { Icon, type IconName } from "@/components/dber/icon";
import { AccountMenu } from "@/components/layout/account-menu";
import { BottomNav } from "@/components/layout/bottom-nav";
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
  const identity = await getCurrentUser();
  const isProvider = identity ? ["seller", "professional", "admin"].includes(identity.role) : false;
  const showDevSwitcher = isDevelopment && identity !== null;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1440px]">
      {/* Desktop navigation rail */}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line/70 bg-surface/70 px-5 py-6 md:flex">
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
          {isProvider ? (
            <Link
              href="/pro"
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bg"
            >
              <Icon name="spark" size={17} className="text-muted" />
              Workspace
            </Link>
          ) : null}
          {identity && isPrivileged(identity.role) ? (
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bg"
            >
              <Icon name="shield" size={17} className="text-muted" />
              Operations
            </Link>
          ) : null}
        </nav>

        <div className="mt-auto">
          {identity ? (
            <div className="flex items-center gap-2">
              <AccountMenu
                displayName={identity.displayName}
                role={identity.role}
                isPrivileged={isPrivileged(identity.role)}
                isProvider={isProvider}
              >
                {showDevSwitcher ? (
                  <div className="border-t border-line pt-1">
                    <UserSwitcher currentUserId={identity.userId} currentRole={identity.role} compact />
                  </div>
                ) : null}
              </AccountMenu>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold leading-tight">{identity.displayName}</p>
                <p className="text-[11px] capitalize leading-tight text-muted">{identity.role.replace(/_/g, " ")}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark"
              >
                Sign in
                <Icon name="arrow" size={15} />
              </Link>
              <Link
                href="/register"
                className="flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold transition-colors hover:border-green"
              >
                Create account
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line/60 bg-bg/85 px-4 py-3 backdrop-blur-md md:hidden">
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
              <AccountMenu
                displayName={identity.displayName}
                role={identity.role}
                isPrivileged={isPrivileged(identity.role)}
                isProvider={isProvider}
              >
                {showDevSwitcher ? (
                  <div className="border-t border-line pt-1">
                    <UserSwitcher currentUserId={identity.userId} currentRole={identity.role} compact />
                  </div>
                ) : null}
              </AccountMenu>
            ) : (
              <Link href="/login" className="rounded-full bg-green px-4 py-2 text-[12px] font-semibold text-bg">
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">{children}</main>

        {/* Mobile bottom navigation — floating pill */}
        <BottomNav />
      </div>
    </div>
  );
}
