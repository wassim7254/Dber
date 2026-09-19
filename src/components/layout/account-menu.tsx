"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/dber/icon";

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
          className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg"
        >
          <div className="px-2 pb-2 pt-1">
            <p className="truncate text-[13px] font-semibold">{displayName}</p>
            <p className="text-[11px] capitalize text-muted">{role.replace(/_/g, " ")}</p>
          </div>
          <div className="border-t border-line pt-1" role="group">
            {isProvider ? (
              <MenuLink href="/pro" icon="spark" label="Provider workspace" onNavigate={() => setOpen(false)} />
            ) : null}
            {isPrivileged ? (
              <MenuLink href="/admin" icon="shield" label="Operations console" onNavigate={() => setOpen(false)} />
            ) : null}
            <MenuLink href="/account" icon="account" label="Account" onNavigate={() => setOpen(false)} />
            <MenuLink href="/account/security" icon="shield" label="Security" onNavigate={() => setOpen(false)} />
            <MenuLink href="/support" icon="alert" label="Help & support" onNavigate={() => setOpen(false)} />
          </div>
          {children}
          <div className="border-t border-line pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="w-full rounded-lg px-2 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
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
