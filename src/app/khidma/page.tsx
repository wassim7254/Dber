import { db } from "@/db/client";
import { listServiceCards } from "@/domains/khidma/application/khidma-read";
import { SectionTitle } from "@/components/dber/ui";
import { ServiceCard } from "@/components/dber/cards";
import { EmptyState } from "@/components/dber/ui";
import { SearchForm } from "@/components/layout/search-form";

export const metadata = { title: "KHIDMA — Professional services" };

export default async function KhidmaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const services = await listServiceCards(db, q ?? null, 24);
  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[980px] space-y-8">
        <header className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">KHIDMA</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] md:text-[34px]">
              Find the right professional
            </h1>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted">
              Quotes are bound to accepted terms, payments are verified server-side, and double
              bookings are impossible — the schedule is enforced by the database itself.
            </p>
          </div>
          <SearchForm placeholder="Search services and professionals…" />
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
