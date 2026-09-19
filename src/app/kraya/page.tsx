import { db } from "@/db/client";
import { listRentalCards } from "@/domains/kraya/application/kraya-read";
import { SectionTitle, EmptyState } from "@/components/dber/ui";
import { RentalCard } from "@/components/dber/cards";
import { SearchForm } from "@/components/layout/search-form";

export const metadata = { title: "KRAYA — Rentals" };

const CATEGORIES = [
  { key: "vehicle", label: "Vehicles" },
  { key: "equipment", label: "Equipment" },
  { key: "space", label: "Spaces" },
  { key: "tool", label: "Tools" },
];

export default async function KrayaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rentals = await listRentalCards(db, q ?? null, 24);
  return (
    <div className="dber-page-glow px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1100px] space-y-8">
        <header className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-azure">KRAYA · Rentals</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em] md:text-[32px]">
              Rent it for the day, skip the ownership
            </h1>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted">
              Pick your dates and see the full price before you commit — deposit stays a hold, and
              every confirmed rental is contract-snapshotted.
            </p>
          </div>
          <SearchForm placeholder="Where to? Search rentals by name or location…" />
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORIES.map((category) => (
              <a
                key={category.key}
                href={`/kraya?q=${encodeURIComponent(category.key)}`}
                className={`shrink-0 rounded-full border px-4 py-2 text-[12.5px] font-semibold shadow-[var(--shadow-card)] transition-colors ${
                  q === category.key
                    ? "border-azure bg-azure text-white"
                    : "border-line/70 bg-surface hover:border-azure"
                }`}
              >
                {category.label}
              </a>
            ))}
          </div>
        </header>

        {rentals.length === 0 ? (
          <EmptyState
            icon="kraya"
            title="No rentals matched"
            body="Try another name or location — new assets are listed by owners every week."
          />
        ) : (
          <section>
            <SectionTitle>{q ? "Results" : "Popular nearby"}</SectionTitle>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {rentals.map((rental) => (
                <RentalCard key={rental.id} rental={rental} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
