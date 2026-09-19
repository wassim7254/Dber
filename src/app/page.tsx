import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { listOpenCircleCards } from "@/domains/souq/application/souq-read";
import { listServiceCards } from "@/domains/khidma/application/khidma-read";
import { listRentalCards } from "@/domains/kraya/application/kraya-read";
import { SectionTitle } from "@/components/dber/ui";
import { RentalCard, ServiceCard, SouqCircleCard } from "@/components/dber/cards";
import { SearchForm } from "@/components/layout/search-form";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const VERTICALS = [
  { href: "/souq", label: "SOUQ", blurb: "Group buying", media: "souq" },
  { href: "/khidma", label: "KHIDMA", blurb: "Book trusted pros", media: "khidma" },
  { href: "/kraya", label: "KRAYA", blurb: "Rent & relax", media: "kraya" },
] as const;

export default async function HomePage() {
  const identity = await getCurrentUser();
  const [circles, services, rentals] = await Promise.all([
    listOpenCircleCards(db, 8),
    listServiceCards(db, null, 6),
    listRentalCards(db, null, 6),
  ]);

  return (
    <div className="dber-page-glow px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1000px] space-y-9">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {greeting()}
                {identity ? `, ${identity.displayName.split(" ")[0]}` : " — shop smart"}
              </p>
              <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] md:text-[34px]">
                What are you looking for today?
              </h1>
            </div>
          </div>
          <SearchForm placeholder="Search products, services, rentals…" />
          <nav aria-label="Marketplaces" className="grid grid-cols-3 gap-3">
            {VERTICALS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
              >
                <span className={`dber-media ${item.media} block h-20 w-full`} aria-hidden="true" />
                <span className="block px-3.5 py-3">
                  <span className="block text-[13.5px] font-semibold tracking-[0.04em]">{item.label}</span>
                  <span className="block truncate text-[11.5px] text-muted">{item.blurb}</span>
                </span>
              </Link>
            ))}
          </nav>
        </header>

        <section>
          <SectionTitle
            action={
              <Link href="/souq" className="text-[12.5px] font-semibold text-green-dark hover:underline">
                See all
              </Link>
            }
          >
            Deals ending soon
          </SectionTitle>
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-4 md:overflow-visible">
            {circles.map((circle) => (
              <div key={circle.id} className="w-[240px] shrink-0 md:w-auto">
                <SouqCircleCard circle={circle} />
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/khidma" className="text-[12.5px] font-semibold text-clay-dark hover:underline">
                See all
              </Link>
            }
          >
            Recommended professionals
          </SectionTitle>
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible">
            {services.map((service) => (
              <div key={service.id} className="w-[240px] shrink-0 md:w-auto">
                <ServiceCard service={service} />
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/kraya" className="text-[12.5px] font-semibold text-azure-dark hover:underline">
                See all
              </Link>
            }
          >
            Available this week
          </SectionTitle>
          <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible">
            {rentals.map((rental) => (
              <div key={rental.id} className="w-[240px] shrink-0 md:w-auto">
                <RentalCard rental={rental} />
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-col items-start gap-3 overflow-hidden rounded-[var(--radius-card)] bg-gradient-to-r from-green-dark to-green px-6 py-6 text-bg shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[15px] font-semibold">Every transaction, fully traceable</p>
              <p className="mt-0.5 max-w-[56ch] text-[13px] leading-relaxed text-bg/75">
                Authorizations, captures, state changes, and refunds are recorded end-to-end. You
                always know what happened and what happens next.
              </p>
            </div>
            <Link
              href="/activity"
              className="shrink-0 rounded-full bg-bg px-5 py-2.5 text-[13px] font-semibold text-green-dark transition-transform active:scale-95"
            >
              Open Activity
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
