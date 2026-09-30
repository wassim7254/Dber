"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/dber/icon";
import { RoleSwitcher } from "@/components/layout/role-switcher";

interface AccountMenuProps {
  displayName: string;
  role: string;
  isPrivileged: boolean;
  isProvider: boolean;
  children?: React.ReactNode;
}

/** Account dropdown with the real session sign-out (§3). */
export function AccountMenu({ displayName, role, isPrivileged, isProvider, children }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } finally {
      setSigningOut(false);
      setOpen(false);
      router.push("/login");
      router.refresh();
    }
  }

  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex size-10 items-center justify-center rounded-full bg-green-soft font-mono text-[12px] font-semibold text-green-dark transition-colors hover:bg-green hover:text-bg"
        aria-label={`Account menu — signed in as ${displayName}`}
      >
        {initials || "D"}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-float)]"
        >
          <div className="border-b border-line pb-2">
            <RoleSwitcher currentRole={role} displayName={displayName} compact onClose={() => setOpen(false)} />
          </div>
          <div className="py-1" role="group">
            <MenuLink href="/account" icon="account" label="Account Settings" onNavigate={() => setOpen(false)} />
            <MenuLink href="/account/security" icon="shield" label="Security & Sessions" onNavigate={() => setOpen(false)} />
            {isPrivileged ? (
              <MenuLink href="/admin" icon="shield" label="Operations Console" onNavigate={() => setOpen(false)} />
            ) : null}
            <MenuLink href="/support" icon="alert" label="Help & Support" onNavigate={() => setOpen(false)} />
          </div>
          {children}
          <div className="border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="w-full rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: "spark" | "shield" | "account" | "alert";
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-bg"
    >
      <Icon name={icon} size={15} className="text-muted" />
      {label}
    </Link>
  );
}
