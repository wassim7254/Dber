import Link from "next/link";

import { resolveIdentityFromCookies } from "@/lib/auth/identity";
import { db } from "@/db/client";
import { listOpenCircleCards } from "@/domains/souq/application/souq-read";
import { listServiceCards } from "@/domains/khidma/application/khidma-read";
import { listRentalCards } from "@/domains/kraya/application/kraya-read";
import { Card, Eyebrow, SectionTitle } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";
import { RentalCard, ServiceCard, SouqCircleCard } from "@/components/dber/cards";
import { SearchForm } from "@/components/layout/search-form";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const identity = await resolveIdentityFromCookies();
  const [circles, services, rentals] = await Promise.all([
    listOpenCircleCards(db, 4),
    listServiceCards(db, null, 3),
    listRentalCards(db, null, 3),
  ]);

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[920px] space-y-10">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>
                {greeting()}
                {identity ? `, ${identity.role === "buyer" ? "shopper" : identity.role}` : ""}
              </Eyebrow>
              <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] md:text-[36px]">
                One platform. Three marketplaces.
              </h1>
            </div>
            <Link
              href="/welcome"
              className="hidden shrink-0 rounded-full border border-line px-4 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-green hover:text-green-dark md:block"
            >
              How DBER works
            </Link>
          </div>
          <SearchForm placeholder="Search products, services, rentals…" />
          <nav aria-label="Marketplaces" className="grid grid-cols-3 gap-2">
            {[
              { href: "/souq", label: "SOUQ", blurb: "Join groups, unlock deals", icon: "souq" as const },
              { href: "/khidma", label: "KHIDMA", blurb: "Book trusted pros", icon: "khidma" as const },
              { href: "/kraya", label: "KRAYA", blurb: "Rent equipment & spaces", icon: "kraya" as const },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 transition-colors hover:border-green"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-green-soft text-green-dark transition-colors group-hover:bg-green group-hover:text-bg">
                  <Icon name={item.icon} size={17} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold tracking-[0.06em]">{item.label}</span>
                  <span className="block truncate text-[11px] text-muted">{item.blurb}</span>
                </span>
              </Link>
            ))}
          </nav>
        </header>

        <section>
          <SectionTitle
            action={
              <Link href="/souq" className="text-[12.5px] font-medium text-green-dark hover:underline">
                All groups →
              </Link>
            }
          >
            Deals ending soon
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {circles.map((circle) => (
              <SouqCircleCard key={circle.id} circle={circle} />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/khidma" className="text-[12.5px] font-medium text-green-dark hover:underline">
                All services →
              </Link>
            }
          >
            Recommended professionals
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle
            action={
              <Link href="/kraya" className="text-[12.5px] font-medium text-green-dark hover:underline">
                All rentals →
              </Link>
            }
          >
            Available this week
          </SectionTitle>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {rentals.map((rental) => (
              <RentalCard key={rental.id} rental={rental} />
            ))}
          </div>
        </section>

        <Card className="flex flex-col items-start gap-2 bg-green-dark px-6 py-6 text-bg md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[15px] font-semibold">Every transaction, fully traceable</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-bg/75">
              Authorizations, captures, state changes, and refunds are recorded end-to-end. You always
              know what happened and what happens next.
            </p>
          </div>
          <Link
            href="/activity"
            className="shrink-0 rounded-lg bg-bg px-4 py-2.5 text-[13px] font-semibold text-green-dark transition-opacity hover:opacity-90"
          >
            Open Activity
          </Link>
        </Card>
      </div>
    </div>
  );
}
