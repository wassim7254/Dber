import type { ReactNode } from "react";

import { formatMoney, type Currency } from "@/lib/money";
import { statusPresentation, type StatusTone } from "@/lib/state-ui";
import { Icon } from "@/components/dber/icon";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</p>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_1px_2px_rgba(23,24,21,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function DberMoney({
  amountMinor,
  currency,
  size = "md",
  muted = false,
}: {
  amountMinor: number;
  currency: Currency | string;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
}) {
  const sizes = { sm: "text-[13px]", md: "text-[15px]", lg: "text-[26px] font-semibold" } as const;
  return (
    <span className={`tnum font-mono ${sizes[size]} ${muted ? "text-muted" : "text-ink"}`}>
      {formatMoney(amountMinor, currency as Currency)}
    </span>
  );
}

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success-soft text-success",
  progress: "bg-green-soft text-green-dark",
  muted: "bg-bg text-muted",
  warn: "bg-sand-soft text-warn",
  danger: "bg-danger-soft text-danger",
  attention: "bg-green-dark text-bg",
};

export function StatusBadge({ state, withIcon = true }: { state: string; withIcon?: boolean }) {
  const presentation = statusPresentation(state);
  const iconName =
    presentation.tone === "success"
      ? "check"
      : presentation.tone === "danger"
        ? "alert"
        : presentation.tone === "attention"
          ? "clock"
          : presentation.tone === "warn"
            ? "alert"
            : null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${TONE_CLASSES[presentation.tone]}`}
    >
      {withIcon && iconName ? <Icon name={iconName} size={13} /> : null}
      {presentation.label}
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-green-soft"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div
          className="h-full rounded-full bg-green transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      {label ? <p className="mt-1.5 text-[12px] text-muted">{label}</p> : null}
    </div>
  );
}

export function Media({
  kind,
  title,
  className = "",
}: {
  kind: string;
  title: string;
  className?: string;
}) {
  // Real uploads are served from /api/v1/media/<id>; descriptors render the
  // layered gradient art (§47 — no fake production URLs).
  if (kind.startsWith("/api/v1/media/") || kind.startsWith("http")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={kind} alt={title} className={`object-cover ${className}`} loading="lazy" />
    );
  }
  const key = kind && kind.length > 0 ? kind : "default";
  return <div className={`dber-media ${key} ${className}`} role="img" aria-label={title} />;
}

export function EmptyState({
  icon = "spark",
  title,
  body,
  action,
}: {
  icon?: "spark" | "activity" | "saved" | "bell" | "search" | "souq" | "khidma" | "kraya" | "account";
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-8 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-green-soft text-green-dark">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        <p className="mx-auto mt-1 max-w-[38ch] text-[13px] leading-relaxed text-muted">{body}</p>
      </div>
      {action}
    </Card>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-line/70 ${className}`} />;
}

export interface TimelineItem {
  label: string;
  at: string;
  actor?: string;
  note?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative ml-1.5 border-l border-line">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={`${item.label}-${item.at}-${index}`} className="relative pb-5 pl-5 last:pb-0">
            <span
              className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full border-2 border-bg ${
                isLast ? "bg-green" : "bg-line"
              }`}
            />
            <p className="text-[13px] font-medium leading-tight">{item.label}</p>
            <p className="tnum mt-0.5 font-mono text-[11px] text-muted">
              {formatTimestamp(item.at)}
              {item.actor ? ` · ${item.actor}` : ""}
            </p>
            {item.note ? <p className="mt-1 text-[12px] text-muted">{item.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function PriceBreakdown({
  lines,
  totalLabel = "Total",
  totalMinor,
  currency,
  footnote,
}: {
  lines: { label: string; amountMinor: number; muted?: boolean }[];
  totalLabel?: string;
  totalMinor: number;
  currency: string;
  footnote?: string;
}) {
  return (
    <div className="space-y-2.5">
      {lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-4">
          <span className={`text-[13px] ${line.muted ? "text-muted" : "text-ink"}`}>{line.label}</span>
          <DberMoney amountMinor={line.amountMinor} currency={currency} size="sm" />
        </div>
      ))}
      <div className="border-t border-line pt-3">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[14px] font-semibold">{totalLabel}</span>
          <DberMoney amountMinor={totalMinor} currency={currency} size="lg" />
        </div>
        {footnote ? <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{footnote}</p> : null}
      </div>
    </div>
  );
}
