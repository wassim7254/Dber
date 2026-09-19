import Link from "next/link";

import { db } from "@/db/client";
import { listOpenCircleCards } from "@/domains/souq/application/souq-read";
import { SectionTitle, EmptyState } from "@/components/dber/ui";
import { SouqCircleCard } from "@/components/dber/cards";
import { SearchForm } from "@/components/layout/search-form";
import { Icon } from "@/components/dber/icon";

export const metadata = { title: "SOUQ — Group buying" };

const CATEGORIES = [
  { key: "food", label: "Food & Pantry" },
  { key: "home", label: "Home" },
  { key: "electronics", label: "Electronics" },
  { key: "beauty", label: "Beauty" },
  { key: "kids", label: "Kids" },
  { key: "general", label: "More" },
];

export default async function SouqPage() {
  const circles = await listOpenCircleCards(db, 24);
  const maxDiscount = circles.reduce((max, circle) => Math.max(max, circle.discountPercent), 0);
  const endingSoon = [...circles]
    .sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime())
    .slice(0, 4);

  return (
    <div className="dber-page-glow px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1100px] space-y-8">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">SOUQ · Group buying</p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em] md:text-[32px]">
                Join others, unlock the deal
              </h1>
            </div>
          </div>
          <SearchForm placeholder="Search group buys…" />
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((category) => (
              <Link
                key={category.key}
                href={`/search?q=${encodeURIComponent(category.label)}`}
                className="group flex shrink-0 items-center gap-2 rounded-full border border-line/70 bg-surface py-1.5 pl-1.5 pr-4 shadow-[var(--shadow-card)] transition-colors hover:border-green"
              >
                <span className={`dber-media ${category.key} size-8 rounded-full`} aria-hidden="true" />
                <span className="text-[12.5px] font-semibold">{category.label}</span>
              </Link>
            ))}
          </div>
        </header>

        {maxDiscount > 0 ? (
          <section aria-label="Best live saving">
            <div className="flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-r from-green-dark via-green to-[#93a78b] px-6 py-5 text-bg shadow-[var(--shadow-card)]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-bg/75">Live right now</p>
                <p className="tnum mt-1 text-[22px] font-semibold tracking-[-0.01em]">
                  Save up to {maxDiscount}% on group buys
                </p>
                <p className="mt-0.5 text-[12.5px] text-bg/80">
                  Prices lock in when the group fills — payment is released if it doesn&apos;t.
                </p>
              </div>
              <Link
                href="/souq"
                className="rounded-full bg-bg px-5 py-2.5 text-[13px] font-semibold text-green-dark transition-transform active:scale-95"
              >
                Browse all groups
              </Link>
            </div>
          </section>
        ) : null}

        {circles.length === 0 ? (
          <EmptyState
            icon="souq"
            title="No open groups right now"
            body="Open group buys appear here the moment sellers publish them. Check back soon or browse the categories above."
          />
        ) : (
          <>
            <section>
              <SectionTitle>Ending soon</SectionTitle>
              <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {endingSoon.map((circle) => (
                  <div key={circle.id} className="w-[240px] shrink-0 md:w-[260px]">
                    <SouqCircleCard circle={circle} />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle
                action={
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
                    <Icon name="clock" size={14} />
                    {circles.length} open groups
                  </span>
                }
              >
                All group buys
              </SectionTitle>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {circles.map((circle) => (
                  <SouqCircleCard key={circle.id} circle={circle} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
