"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/dber/icon";

const ITEMS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  { href: "/souq", label: "SOUQ", icon: "souq", match: (p) => p.startsWith("/souq") },
  { href: "/khidma", label: "KHIDMA", icon: "khidma", match: (p) => p.startsWith("/khidma") },
  { href: "/kraya", label: "KRAYA", icon: "kraya", match: (p) => p.startsWith("/kraya") },
  { href: "/activity", label: "Activity", icon: "activity", match: (p) => p.startsWith("/activity") },
];

/** Floating pill bottom navigation (mobile) — the app's primary consumer nav. */
export function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden"
    >
      <ul className="flex items-center gap-1 rounded-full border border-white/60 bg-surface/95 p-1.5 shadow-[var(--shadow-float)] backdrop-blur">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] min-w-[58px] flex-col items-center justify-center gap-0.5 rounded-full px-3 text-[10px] font-semibold transition-colors ${
                  active ? "bg-green-dark text-bg" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name={item.icon} size={19} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
