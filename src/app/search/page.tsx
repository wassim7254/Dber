import { db } from "@/db/client";
import { listOpenCircleCards } from "@/domains/souq/application/souq-read";
import { listServiceCards } from "@/domains/khidma/application/khidma-read";
import { listRentalCards } from "@/domains/kraya/application/kraya-read";
import { SectionTitle } from "@/components/dber/ui";
import { RentalCard, ServiceCard, SouqCircleCard } from "@/components/dber/cards";
import { EmptyState } from "@/components/dber/ui";
import { SearchForm } from "@/components/layout/search-form";

export const metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const [circles, services, rentals] = query
    ? await Promise.all([
        listOpenCircleCards(db, 24).then((all) =>
          all.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()) || c.category.includes(query.toLowerCase())),
        ),
        listServiceCards(db, query, 12),
        listRentalCards(db, query, 12),
      ])
    : [[], [], []];

  const total = circles.length + services.length + rentals.length;

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[920px] space-y-8">
        <SearchForm placeholder="Search products, services, rentals…" />
        {query ? (
          <p className="text-[13px] text-muted">
            {total === 0
              ? `No results for “${query}”.`
              : `${total} result${total === 1 ? "" : "s"} for “${query}”`}
          </p>
        ) : (
          <p className="text-[13px] text-muted">Search across all three marketplaces at once.</p>
        )}

        {total === 0 && query ? (
          <EmptyState
            icon="search"
            title="Nothing matched that search"
            body={`We couldn't find “${query}” in products, services, or rentals. Try a broader term like “repair”, “villa”, or “headphones”.`}
          />
        ) : null}

        {circles.length > 0 ? (
          <section>
            <SectionTitle>SOUQ · group buys</SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {circles.map((circle) => (
                <SouqCircleCard key={circle.id} circle={circle} />
              ))}
            </div>
          </section>
        ) : null}

        {services.length > 0 ? (
          <section>
            <SectionTitle>KHIDMA · services</SectionTitle>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </section>
        ) : null}

        {rentals.length > 0 ? (
          <section>
            <SectionTitle>KRAYA · rentals</SectionTitle>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {rentals.map((rental) => (
                <RentalCard key={rental.id} rental={rental} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
