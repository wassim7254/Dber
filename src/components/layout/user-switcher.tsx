"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";
import { Icon } from "@/components/dber/icon";

interface DevUser {
  id: string;
  displayName: string;
  role: string;
}

/**
 * Development identity switcher — signs the browser in as one of the seeded
 * dev users via the dev session endpoint. Never registered in production.
 */
export function UserSwitcher({
  currentUserId,
  currentRole,
  compact = false,
}: {
  currentUserId: string;
  currentRole: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<DevUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/v1/dev/users")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Unavailable"))))
      .then((payload: { data?: { users?: DevUser[] } }) => {
        if (!cancelled) setUsers(payload.data?.users ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("User list unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function switchTo(user: DevUser): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/v1/dev/session", { userId: user.id, role: user.role });
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
    }
  }

  async function signOut(): Promise<void> {
    await fetch("/api/v1/dev/session", { method: "DELETE" });
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          compact
            ? "flex size-10 items-center justify-center rounded-full bg-green-soft font-mono text-[12px] font-semibold text-green-dark transition-colors hover:bg-green hover:text-bg"
            : "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-left text-[12px] font-medium transition-colors hover:border-green"
        }
      >
        {!compact ? (
          <>
            <span className="truncate">
              Signed in · {currentRole}
            </span>
            <Icon name="account" size={15} className="text-muted" />
          </>
        ) : (
          <span aria-label={`Signed in as ${currentRole}`}>{currentRole.slice(0, 2).toUpperCase()}</span>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute z-40 mt-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg ${
            compact ? "right-0" : "left-0"
          }`}
        >
          <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            Switch dev account
          </p>
          {error ? <p className="px-2 pb-2 text-[12px] text-danger">{error}</p> : null}
          <ul className="max-h-72 overflow-auto">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void switchTo(user)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors hover:bg-bg ${
                    user.id === currentUserId ? "font-semibold text-green-dark" : ""
                  }`}
                >
                  <span className="truncate">{user.displayName}</span>
                  <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] text-muted">{user.role}</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-1 w-full rounded-lg px-2 py-2 text-left text-[12px] text-danger transition-colors hover:bg-danger-soft"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
