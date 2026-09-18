import Link from "next/link";

import { DberMoney, Media, ProgressBar, StatusBadge, formatDate } from "@/components/dber/ui";
import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/dber/icon";
import type { CircleCardDto } from "@/domains/souq/application/souq-read";
import type { KhidmaServiceCardDto } from "@/domains/khidma/application/khidma-read";
import type { RentalCardDto } from "@/domains/kraya/application/kraya-read";

export function SouqCircleCard({ circle }: { circle: CircleCardDto }) {
  return (
    <Link
      href={`/souq/${circle.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_1px_2px_rgba(23,24,21,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]"
    >
      <Media kind={circle.images[0] ?? circle.category} title={circle.title} className="h-40" />
      <div className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[14.5px] font-semibold leading-snug">{circle.title}</h3>
          {circle.discountPercent > 0 ? (
            <span className="shrink-0 rounded-full bg-sand-soft px-2 py-1 text-[11px] font-semibold text-warn">
              −{circle.discountPercent}%
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-2">
          <DberMoney amountMinor={circle.groupPriceMinor} currency={circle.currency} size="md" />
          <span className="tnum font-mono text-[12px] text-muted line-through">
            {formatMoney(circle.listPriceMinor, circle.currency)}
          </span>
        </div>
        <ProgressBar
          value={circle.currentQuantity}
          max={circle.targetQuantity}
          label={`${circle.currentQuantity} / ${circle.targetQuantity} joined · ${circle.spotsRemaining} spots left`}
        />
        <div className="flex items-center justify-between pt-0.5 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <Icon name="clock" size={13} />
            Ends {formatDate(circle.deadlineAt)}
          </span>
          <span className="font-medium text-ink group-hover:text-green-dark">Join group →</span>
        </div>
      </div>
    </Link>
  );
}

export function ServiceCard({ service }: { service: KhidmaServiceCardDto }) {
  return (
    <Link
      href={`/khidma/pro/${service.professionalId}`}
      className="group flex gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(23,24,21,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-khidma/10 font-mono text-[13px] font-semibold text-[#54617a]">
        {service.professionalName.split(" ").map((part) => part[0]).slice(0, 2).join("")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-[14.5px] font-semibold">{service.title}</h3>
          <DberMoney
            amountMinor={service.basePriceMinor}
            currency={service.currency}
            size="sm"
          />
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">
          {service.professionalName} · {service.specialty} · {Math.round(service.durationMinutes / 60 * 10) / 10}h
        </p>
        <p className="mt-1.5 line-clamp-1 text-[12.5px] leading-relaxed text-muted">
          {service.title} — from {formatMoney(service.basePriceMinor, service.currency)}
        </p>
        <p className="mt-2 text-[12px] font-medium text-green-dark group-hover:underline">View profile →</p>
      </div>
    </Link>
  );
}

export function RentalCard({ rental }: { rental: RentalCardDto }) {
  return (
    <Link
      href={`/kraya/${rental.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_1px_2px_rgba(23,24,21,0.04)] transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]"
    >
      <Media kind={rental.images[0] ?? rental.category} title={rental.title} className="h-44" />
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[14.5px] font-semibold leading-snug">{rental.title}</h3>
          <DberMoney amountMinor={rental.dailyRateMinor} currency={rental.currency} size="md" />
        </div>
        <p className="text-[12.5px] text-muted">
          {rental.location ? `${rental.location} · ` : ""}per day · deposit{" "}
          {formatMoney(rental.depositMinor, rental.currency)}
        </p>
        <p className="text-[12px] font-medium text-green-dark group-hover:underline">Check availability →</p>
      </div>
    </Link>
  );
}

export function TransactionCard({
  href,
  vertical,
  title,
  state,
  amountMinor,
  currency,
  when,
  nextAction,
}: {
  href: string;
  vertical: "SOUQ" | "KHIDMA" | "KRAYA";
  title: string;
  state: string;
  amountMinor: number;
  currency: string;
  when: string;
  nextAction?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition-shadow hover:shadow-[0_6px_24px_rgba(23,24,21,0.08)]"
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-bold ${
          vertical === "SOUQ"
            ? "bg-green-soft text-green-dark"
            : vertical === "KHIDMA"
              ? "bg-[#e4e9f2] text-[#54617a]"
              : "bg-sand-soft text-warn"
        }`}
      >
        {vertical === "SOUQ" ? "SQ" : vertical === "KHIDMA" ? "KH" : "KR"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{title}</p>
        <p className="tnum text-[12px] text-muted">
          {vertical} · {when}
        </p>
        {nextAction ? <p className="mt-0.5 text-[12px] text-muted">{nextAction}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <DberMoney amountMinor={amountMinor} currency={currency} size="sm" />
        <StatusBadge state={state} withIcon={false} />
      </div>
    </Link>
  );
}
