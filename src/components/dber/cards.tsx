import Link from "next/link";

import { DberMoney, Media, StatusBadge, formatDate } from "@/components/dber/ui";
import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/dber/icon";
import type { CircleCardDto } from "@/domains/souq/application/souq-read";
import type { KhidmaServiceCardDto } from "@/domains/khidma/application/khidma-read";
import type { RentalCardDto } from "@/domains/kraya/application/kraya-read";

/** Dark circular action chip that anchors every card's price row. */
function CardAction({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
    >
      <Icon name="arrow" size={16} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function SouqCircleCard({ circle }: { circle: CircleCardDto }) {
  return (
    <Link
      href={`/souq/${circle.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative">
        <Media kind={circle.images[0] ?? circle.category} title={circle.title} className="h-44 w-full" />
        {circle.discountPercent > 0 ? (
          <span className="tnum absolute left-3 top-3 rounded-full bg-ink/90 px-2.5 py-1 font-mono text-[11px] font-semibold text-bg backdrop-blur">
            −{circle.discountPercent}%
          </span>
        ) : null}
      </div>
      <div className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug">{circle.title}</h3>
          <span className="tnum shrink-0 rounded-full bg-green-soft px-2 py-1 font-mono text-[10.5px] font-semibold text-green-dark">
            {circle.currentQuantity}/{circle.targetQuantity}
          </span>
        </div>
        <p className="text-[12.5px] capitalize text-muted">
          {circle.category} · ends {formatDate(circle.deadlineAt)}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-green-soft">
          <div
            className="h-full rounded-full bg-green transition-[width] duration-500"
            style={{ width: `${circle.targetQuantity > 0 ? Math.min(100, Math.round((circle.currentQuantity / circle.targetQuantity) * 100)) : 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-baseline gap-2">
            <DberMoney amountMinor={circle.groupPriceMinor} currency={circle.currency} size="md" />
            <span className="tnum font-mono text-[12px] text-muted line-through">
              {formatMoney(circle.listPriceMinor, circle.currency)}
            </span>
          </div>
          <CardAction label={`Join ${circle.title}`} />
        </div>
      </div>
    </Link>
  );
}

export function ServiceCard({ service }: { service: KhidmaServiceCardDto }) {
  const initials = service.professionalName.split(" ").map((part) => part[0]).slice(0, 2).join("");
  return (
    <Link
      href={`/khidma/pro/${service.professionalId}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative">
        <Media kind="khidma" title={service.title} className="h-28 w-full" />
        <span className="absolute -bottom-5 left-4 flex size-11 items-center justify-center rounded-2xl border-2 border-surface bg-clay-soft font-mono text-[13px] font-semibold text-clay-dark">
          {initials}
        </span>
        <span className="absolute bottom-2.5 right-3 rounded-full bg-bg/85 px-2.5 py-1 text-[10.5px] font-semibold text-clay-dark backdrop-blur">
          {service.category.toLowerCase()}
        </span>
      </div>
      <div className="space-y-1.5 px-4 pb-4 pt-7">
        <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug">{service.title}</h3>
        <p className="truncate text-[12.5px] text-muted">
          {service.professionalName} · {service.specialty}
        </p>
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.08em] text-muted">From</p>
            <DberMoney amountMinor={service.basePriceMinor} currency={service.currency} size="md" />
          </div>
          <CardAction label={`View ${service.title}`} />
        </div>
      </div>
    </Link>
  );
}

export function RentalCard({ rental }: { rental: RentalCardDto }) {
  return (
    <Link
      href={`/kraya/${rental.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative">
        <Media kind={rental.images[0] ?? rental.category} title={rental.title} className="h-44 w-full" />
        <span className="absolute bottom-3 left-3 flex items-baseline gap-1 rounded-full bg-surface/95 px-3 py-1.5 shadow-sm backdrop-blur">
          <DberMoney amountMinor={rental.dailyRateMinor} currency={rental.currency} size="sm" />
          <span className="text-[10.5px] font-medium text-muted">/ day</span>
        </span>
      </div>
      <div className="space-y-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[15px] font-semibold leading-snug">{rental.title}</h3>
          <CardAction label={`Rent ${rental.title}`} />
        </div>
        <p className="line-clamp-1 text-[12.5px] text-muted">
          {rental.location ? `${rental.location} · ` : ""}deposit {formatMoney(rental.depositMinor, rental.currency)}
        </p>
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
      className="group flex items-center gap-4 rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-mono text-[11px] font-bold ${
          vertical === "SOUQ"
            ? "bg-green-soft text-green-dark"
            : vertical === "KHIDMA"
              ? "bg-clay-soft text-clay-dark"
              : "bg-azure-soft text-azure-dark"
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
