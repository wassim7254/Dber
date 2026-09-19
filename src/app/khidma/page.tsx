import { db } from "@/db/client";
import { listServiceCards } from "@/domains/khidma/application/khidma-read";
import { SectionTitle, EmptyState } from "@/components/dber/ui";
import { ServiceCard } from "@/components/dber/cards";
import { SearchForm } from "@/components/layout/search-form";

export const metadata = { title: "KHIDMA — Professional services" };

const CATEGORIES = [
  { key: "home repair", label: "Home repair" },
  { key: "electrical", label: "Electrical" },
  { key: "design", label: "Design" },
  { key: "development", label: "Development" },
  { key: "tutoring", label: "Tutoring" },
  { key: "beauty", label: "Beauty" },
];

export default async function KhidmaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const services = await listServiceCards(db, q ?? null, 24);
  return (
    <div className="dber-page-glow px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1000px] space-y-8">
        <header className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-clay">KHIDMA · Services</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em] md:text-[32px]">
              What do you need done?
            </h1>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted">
              Bound quotes, verified payments, overlap-proof schedules. Nothing is charged until
              you accept a quote.
            </p>
          </div>
          <SearchForm placeholder="What service are you looking for?" />
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((category) => (
              <a
                key={category.key}
                href={`/khidma?q=${encodeURIComponent(category.key)}`}
                className={`shrink-0 rounded-full border px-4 py-2 text-[12.5px] font-semibold shadow-[var(--shadow-card)] transition-colors ${
                  q === category.key
                    ? "border-clay bg-clay text-white"
                    : "border-line/70 bg-surface hover:border-clay"
                }`}
              >
                {category.label}
              </a>
            ))}
          </div>
        </header>

        {services.length === 0 ? (
          <EmptyState
            icon="search"
            title="No services matched"
            body="Try a different keyword, or send an open request — professionals will quote it."
          />
        ) : (
          <section>
            <SectionTitle>{q ? "Results" : "Available professionals"}</SectionTitle>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
