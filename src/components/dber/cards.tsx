import Link from "next/link";

import { DberMoney, Media, StatusBadge, formatDate } from "@/components/dber/ui";
import { formatMoney } from "@/lib/money";
import { Icon } from "@/components/dber/icon";
import type { CircleCardDto, SouqProductCardDto } from "@/domains/souq/application/souq-read";
import type { KhidmaServiceCardDto } from "@/domains/khidma/application/khidma-read";
import type { RentalCardDto } from "@/domains/kraya/application/kraya-read";

/** Tactile action chip that anchors every card's primary decision */
function CardAction({ label, variant = "dark" }: { label: string; variant?: "dark" | "green" | "clay" | "azure" }) {
  const styles = {
    dark: "bg-ink text-bg group-hover:scale-105",
    green: "bg-green-dark text-bg group-hover:bg-green group-hover:scale-105",
    clay: "bg-clay-dark text-bg group-hover:bg-clay group-hover:scale-105",
    azure: "bg-azure-dark text-bg group-hover:bg-azure group-hover:scale-105",
  }[variant];

  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-active:scale-95 shadow-sm ${styles}`}
    >
      <Icon name="arrow" size={15} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** SOUQ Group Buy Card — Dribbble food commerce level */
export function SouqCircleCard({ circle }: { circle: CircleCardDto }) {
  const percent = circle.targetQuantity > 0 ? Math.min(100, Math.round((circle.currentQuantity / circle.targetQuantity) * 100)) : 0;
  const remaining = Math.max(0, circle.targetQuantity - circle.currentQuantity);

  return (
    <Link
      href={`/souq/${circle.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line/60 bg-surface shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-green/40 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        <Media kind={circle.images[0] ?? circle.category} title={circle.title} className="h-full w-full object-cover" />
        
        {/* Badges row */}
        <div className="absolute inset-x-3 top-3 flex items-center justify-between pointer-events-none">
          {circle.discountPercent > 0 ? (
            <span className="tnum rounded-full bg-orange px-2.5 py-1 font-mono text-[11px] font-bold text-white shadow-sm">
              −{circle.discountPercent}%
            </span>
          ) : <span />}
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-green-dark shadow-sm backdrop-blur-md">
            {circle.currentQuantity}/{circle.targetQuantity} joined
          </span>
        </div>

        {/* Category tag */}
        <div className="absolute bottom-2.5 left-3">
          <span className="rounded-full bg-ink/75 px-2.5 py-1 text-[10.5px] font-medium capitalize text-bg backdrop-blur">
            {circle.category}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-[15px] font-semibold tracking-tight text-ink group-hover:text-green-dark">
            {circle.title}
          </h3>
          <p className="mt-0.5 text-[12px] text-muted">
            Ends {formatDate(circle.deadlineAt)} · {remaining > 0 ? `${remaining} spots to unlock` : "Group unlocked"}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green to-green-dark transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-medium text-muted">
            <span>{percent}% reached</span>
            <span className="text-green-dark font-semibold">Group Deal</span>
          </div>
        </div>

        {/* Price & Action */}
        <div className="flex items-center justify-between border-t border-line/50 pt-2.5">
          <div>
            <div className="flex items-baseline gap-2">
              <DberMoney amountMinor={circle.groupPriceMinor} currency={circle.currency} size="md" />
              {circle.listPriceMinor > circle.groupPriceMinor ? (
                <span className="tnum font-mono text-[11.5px] text-muted line-through">
                  {formatMoney(circle.listPriceMinor, circle.currency)}
                </span>
              ) : null}
            </div>
            <p className="text-[10.5px] text-muted">Group price</p>
          </div>
          <CardAction label={`Join ${circle.title}`} variant="green" />
        </div>
      </div>
    </Link>
  );
}

/** Direct SOUQ Product Card */
export function SouqProductCard({
  product,
  href,
}: {
  product: SouqProductCardDto;
  href?: string;
}) {
  return (
    <Link
      href={href ?? `/souq/product/${product.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line/60 bg-surface shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-green/40 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
        <Media kind={product.images[0] ?? product.category} title={product.title} className="h-full w-full object-cover" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-sm backdrop-blur">
          {product.category}
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-[14.5px] font-semibold tracking-tight text-ink group-hover:text-green-dark">
          {product.title}
        </h3>
        <p className="line-clamp-1 text-[12px] text-muted">{product.unit ?? "unit"}</p>
        <div className="flex items-center justify-between pt-1">
          <DberMoney amountMinor={product.basePriceMinor} currency={product.currency} size="md" />
          <CardAction label={`View ${product.title}`} variant="green" />
        </div>
      </div>
    </Link>
  );
}

/** KHIDMA Professional / Service Card */
export function ServiceCard({ service }: { service: KhidmaServiceCardDto }) {
  const initials = service.professionalName.split(" ").map((part) => part[0]).slice(0, 2).join("");
  return (
    <Link
      href={`/khidma/pro/${service.professionalId}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line/60 bg-surface shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-clay/40 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100">
        <Media kind={service.specialty || service.category} title={service.title} className="h-full w-full object-cover" />
        
        {/* Floating Pro Avatar badge */}
        <div className="absolute -bottom-5 left-4 flex size-12 items-center justify-center rounded-2xl border-2 border-surface bg-clay-soft font-mono text-[13px] font-bold text-clay-dark shadow-md">
          {initials}
        </div>
        <span className="absolute bottom-2.5 right-3 rounded-full bg-surface/90 px-2.5 py-1 text-[10.5px] font-semibold text-clay-dark backdrop-blur">
          {service.category.toLowerCase()}
        </span>
      </div>

      <div className="space-y-2 px-4 pb-4 pt-7">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[12.5px] font-medium text-muted">{service.professionalName}</p>
            <span className="flex items-center gap-1 text-[11.5px] font-semibold text-amber-700">
              ★ 4.9
            </span>
          </div>
          <h3 className="line-clamp-1 mt-0.5 text-[15px] font-semibold tracking-tight text-ink group-hover:text-clay-dark">
            {service.title}
          </h3>
        </div>

        <p className="line-clamp-1 text-[12px] text-muted">{service.specialty}</p>

        <div className="flex items-center justify-between border-t border-line/50 pt-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted">Starting at</p>
            <DberMoney amountMinor={service.basePriceMinor} currency={service.currency} size="md" />
          </div>
          <CardAction label={`Book ${service.title}`} variant="clay" />
        </div>
      </div>
    </Link>
  );
}

/** KRAYA Rental Listing Card */
export function RentalCard({ rental }: { rental: RentalCardDto }) {
  return (
    <Link
      href={`/kraya/${rental.id}`}
      className="group block overflow-hidden rounded-[var(--radius-card)] border border-line/60 bg-surface shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-azure/40 hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100">
        <Media kind={rental.images[0] ?? rental.category} title={rental.title} className="h-full w-full object-cover" />
        
        {/* Rate badge */}
        <div className="absolute bottom-3 left-3 flex items-baseline gap-1 rounded-full bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur">
          <DberMoney amountMinor={rental.dailyRateMinor} currency={rental.currency} size="sm" />
          <span className="text-[11px] font-medium text-muted">/ day</span>
        </div>

        {/* Category tag */}
        <span className="absolute right-3 top-3 rounded-full bg-ink/75 px-2.5 py-1 text-[10.5px] font-medium capitalize text-bg backdrop-blur">
          {rental.category}
        </span>
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[15px] font-semibold tracking-tight text-ink group-hover:text-azure-dark">
            {rental.title}
          </h3>
        </div>
        
        <p className="line-clamp-1 text-[12.5px] text-muted">
          {rental.location ? `📍 ${rental.location} · ` : ""}Refundable deposit {formatMoney(rental.depositMinor, rental.currency)}
        </p>

        <div className="flex items-center justify-between border-t border-line/50 pt-2.5">
          <span className="rounded-full bg-azure-soft px-2.5 py-1 text-[11px] font-medium text-azure-dark">
            Instant booking
          </span>
          <CardAction label={`Rent ${rental.title}`} variant="azure" />
        </div>
      </div>
    </Link>
  );
}

/** Human-centered activity transaction card */
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
      className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line/60 bg-surface p-4 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
    >
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-mono text-[11px] font-bold shadow-sm ${
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
        <p className="truncate text-[14px] font-semibold text-ink group-hover:text-green-dark">{title}</p>
        <p className="tnum text-[12px] text-muted">
          {vertical} · {when}
        </p>
        {nextAction ? <p className="mt-0.5 text-[12px] font-medium text-green-dark">{nextAction}</p> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <DberMoney amountMinor={amountMinor} currency={currency} size="sm" />
        <StatusBadge state={state} withIcon={false} />
      </div>
    </Link>
  );
}
