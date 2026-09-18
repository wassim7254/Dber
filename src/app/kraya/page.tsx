import { db } from "@/db/client";
import { listRentalCards } from "@/domains/kraya/application/kraya-read";
import { SectionTitle } from "@/components/dber/ui";
import { RentalCard } from "@/components/dber/cards";
import { EmptyState } from "@/components/dber/ui";
import { SearchForm } from "@/components/layout/search-form";

export const metadata = { title: "KRAYA — Rentals" };

export default async function KrayaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const rentals = await listRentalCards(db, q ?? null, 24);
  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1100px] space-y-8">
        <header className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">KRAYA</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] md:text-[34px]">
              Rent it. Verify it. Return it.
            </h1>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted">
              Pick dates, see the full price — charge plus refundable deposit — before you commit.
              Confirmed rentals are contract-snapshotted and overlap-proof at the database level.
            </p>
          </div>
          <SearchForm placeholder="Search rentals by name or location…" />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
