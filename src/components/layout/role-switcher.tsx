"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/dber/icon";
import { apiPost, describeApiError } from "@/lib/client/api";
import type { ParticipantRole } from "@/lib/auth/types";

export interface RoleConfig {
  role: ParticipantRole;
  label: string;
  badge: string;
  destination: string;
  onboardingDestination: string;
  icon: "souq" | "khidma" | "kraya" | "home";
  description: string;
}

export const ROLE_CONFIGS: Record<ParticipantRole, RoleConfig> = {
  buyer: {
    role: "buyer",
    label: "Shopping & Discovery",
    badge: "Customer",
    destination: "/",
    onboardingDestination: "/welcome",
    icon: "home",
    description: "Browse products, hire pros, and rent assets",
  },
  seller: {
    role: "seller",
    label: "Sell on SOUQ",
    badge: "Seller",
    destination: "/sell",
    onboardingDestination: "/sell/onboarding",
    icon: "souq",
    description: "Manage products, launch group buys, and fulfill orders",
  },
  professional: {
    role: "professional",
    label: "Offer on KHIDMA",
    badge: "Pro",
    destination: "/pro",
    onboardingDestination: "/pro/onboarding",
    icon: "khidma",
    description: "Publish services, send quotes, and manage bookings",
  },
  rental_owner: {
    role: "rental_owner",
    label: "List on KRAYA",
    badge: "Host",
    destination: "/rent-out",
    onboardingDestination: "/rent-out/onboarding",
    icon: "kraya",
    description: "Manage rental listings, calendar, and equipment",
  },
};

export function RoleSwitcher({
  currentRole,
  displayName,
  compact = false,
  onClose,
}: {
  currentRole: string;
  displayName: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<ParticipantRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/account/role")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed"))))
      .then((payload: { data?: { roles?: ParticipantRole[] } }) => {
        if (!cancelled && payload.data?.roles) {
          setRoles(payload.data.roles);
        }
      })
      .catch(() => {
        // Default to current role if endpoint unavailable
        if (!cancelled) {
          const fallback: ParticipantRole[] = ["buyer"];
          if (["seller", "professional", "rental_owner"].includes(currentRole)) {
            fallback.push(currentRole as ParticipantRole);
          }
          setRoles(fallback);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentRole]);

  async function handleSwitch(targetRole: ParticipantRole): Promise<void> {
    if (targetRole === currentRole) {
      if (onClose) onClose();
      return;
    }
    setSwitching(targetRole);
    setError(null);
    try {
      await apiPost("/api/v1/account/role/switch", { role: targetRole });
      if (onClose) onClose();
      const dest = ROLE_CONFIGS[targetRole].destination;
      router.push(dest);
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
      setSwitching(null);
    }
  }

  async function handleActivate(targetRole: Exclude<ParticipantRole, "buyer">): Promise<void> {
    setSwitching(targetRole);
    setError(null);
    try {
      await apiPost("/api/v1/account/role/activate", { role: targetRole });
      if (onClose) onClose();
      const dest = ROLE_CONFIGS[targetRole].onboardingDestination;
      router.push(dest);
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
      setSwitching(null);
    }
  }

  const allParticipantRoles: ParticipantRole[] = ["buyer", "seller", "professional", "rental_owner"];

  return (
    <div className={`space-y-3 ${compact ? "p-1" : "p-4"}`}>
      <div className="flex items-center justify-between border-b border-line/60 pb-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Role &amp; Workspace</p>
          <p className="text-[14px] font-semibold text-ink">{displayName}</p>
        </div>
        <span className="rounded-full bg-green-soft px-2.5 py-0.5 text-[11px] font-semibold text-green-dark">
          {ROLE_CONFIGS[currentRole as ParticipantRole]?.badge ?? currentRole}
        </span>
      </div>

      {error ? (
        <div className="rounded-xl bg-danger-soft p-2.5 text-[12px] text-danger">
          {error}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {allParticipantRoles.map((role) => {
          const config = ROLE_CONFIGS[role];
          const isCurrent = currentRole === role;
          const isEntitled = roles.includes(role);
          const isPending = switching === role;

          return (
            <div
              key={role}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-2.5 transition-all ${
                isCurrent
                  ? "border-green bg-green-soft/30 shadow-sm"
                  : isEntitled
                    ? "border-line/70 bg-surface hover:border-green/50 hover:bg-stone-50"
                    : "border-dashed border-line bg-surface/50 opacity-80 hover:opacity-100 hover:border-line"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl font-medium ${
                    isCurrent
                      ? "bg-green text-white"
                      : isEntitled
                        ? "bg-stone-100 text-ink"
                        : "bg-stone-50 text-muted"
                  }`}
                >
                  <Icon name={config.icon} size={16} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink truncate">{config.label}</span>
                    {isCurrent ? (
                      <span className="flex size-4 items-center justify-center rounded-full bg-green text-white">
                        <Icon name="check" size={10} />
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-muted truncate">{config.description}</p>
                </div>
              </div>

              <div className="shrink-0 pl-2">
                {isCurrent ? (
                  <span className="text-[11px] font-semibold text-green-dark">Active</span>
                ) : isEntitled ? (
                  <button
                    type="button"
                    onClick={() => void handleSwitch(role)}
                    disabled={isPending || loading}
                    className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-bg transition-transform active:scale-95 hover:bg-green-dark disabled:opacity-50"
                  >
                    {isPending ? "Switching..." : "Switch"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleActivate(role as Exclude<ParticipantRole, "buyer">)}
                    disabled={isPending || loading}
                    className="rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold text-ink transition-colors hover:border-green hover:bg-green-soft/50 disabled:opacity-50"
                  >
                    {isPending ? "Activating..." : "+ Activate"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
