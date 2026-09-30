"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/dber/icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  match: (path: string) => boolean;
}

const CUSTOMER_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  { href: "/search", label: "Explore", icon: "search", match: (p) => p.startsWith("/search") || p === "/souq" || p === "/khidma" || p === "/kraya" },
  { href: "/activity", label: "Activity", icon: "activity", match: (p) => p.startsWith("/activity") },
  { href: "/saved", label: "Saved", icon: "saved", match: (p) => p.startsWith("/saved") },
  { href: "/account", label: "Account", icon: "account", match: (p) => p.startsWith("/account") },
];

const SELLER_NAV: NavItem[] = [
  { href: "/sell", label: "Home", icon: "home", match: (p) => p === "/sell" || p === "/sell/dashboard" || p === "/pro/seller" },
  { href: "/sell/products", label: "Products", icon: "box", match: (p) => p.startsWith("/sell/products") || p.startsWith("/pro/seller/products") },
  { href: "/sell/orders", label: "Orders", icon: "orders", match: (p) => p.startsWith("/sell/orders") },
  { href: "/sell/circles", label: "Circles", icon: "souq", match: (p) => p.startsWith("/sell/circles") || p.startsWith("/pro/seller/groups") },
  { href: "/account", label: "Account", icon: "account", match: (p) => p.startsWith("/account") },
];

const PRO_NAV: NavItem[] = [
  { href: "/pro", label: "Home", icon: "home", match: (p) => p === "/pro" || p === "/pro/dashboard" || p === "/pro/professional" },
  { href: "/pro/requests", label: "Requests", icon: "activity", match: (p) => p.startsWith("/pro/requests") || p.startsWith("/pro/professional/requests") },
  { href: "/pro/services", label: "Services", icon: "khidma", match: (p) => p.startsWith("/pro/services") || p.startsWith("/pro/professional/services") },
  { href: "/pro/calendar", label: "Calendar", icon: "calendar", match: (p) => p.startsWith("/pro/calendar") || p.startsWith("/pro/professional/availability") },
  { href: "/account", label: "Account", icon: "account", match: (p) => p.startsWith("/account") },
];

const RENTAL_NAV: NavItem[] = [
  { href: "/rent-out", label: "Home", icon: "home", match: (p) => p === "/rent-out" || p === "/rent-out/dashboard" || p === "/pro/rental" },
  { href: "/rent-out/listings", label: "Listings", icon: "kraya", match: (p) => p.startsWith("/rent-out/listings") || p.startsWith("/pro/rental/assets") },
  { href: "/rent-out/bookings", label: "Bookings", icon: "orders", match: (p) => p.startsWith("/rent-out/bookings") || p.startsWith("/pro/rental/bookings") },
  { href: "/rent-out/calendar", label: "Calendar", icon: "calendar", match: (p) => p.startsWith("/rent-out/calendar") },
  { href: "/account", label: "Account", icon: "account", match: (p) => p.startsWith("/account") },
];

/** Role-aware mobile bottom navigation */
export function BottomNav() {
  const pathname = usePathname() ?? "/";

  // Hide on admin routes or auth pages
  if (pathname.startsWith("/admin") || pathname === "/login" || pathname === "/register") {
    return null;
  }

  let items = CUSTOMER_NAV;
  let activeColor = "bg-green-dark text-bg";

  if (pathname.startsWith("/sell") || pathname.startsWith("/pro/seller")) {
    items = SELLER_NAV;
    activeColor = "bg-green-dark text-bg";
  } else if (
    pathname.startsWith("/pro/professional") ||
    (pathname.startsWith("/pro") && !pathname.startsWith("/pro/rental") && !pathname.startsWith("/pro/seller"))
  ) {
    items = PRO_NAV;
    activeColor = "bg-clay-dark text-bg";
  } else if (pathname.startsWith("/rent-out") || pathname.startsWith("/pro/rental")) {
    items = RENTAL_NAV;
    activeColor = "bg-azure-dark text-bg";
  }

  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden"
    >
      <ul className="flex items-center gap-1 rounded-full border border-stone-200/80 bg-surface/95 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-lg">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-full px-2.5 text-[10px] font-semibold transition-all duration-200 ${
                  active ? activeColor : "text-muted hover:text-ink active:scale-95"
                }`}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
