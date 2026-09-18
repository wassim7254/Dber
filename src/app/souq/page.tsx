import { db } from "@/db/client";
import { listOpenCircleCards } from "@/domains/souq/application/souq-read";
import { SectionTitle } from "@/components/dber/ui";
import { SouqCircleCard } from "@/components/dber/cards";
import { EmptyState } from "@/components/dber/ui";
import { SearchForm } from "@/components/layout/search-form";

export const metadata = { title: "SOUQ — Group buying" };

export default async function SouqPage() {
  const circles = await listOpenCircleCards(db, 24);
  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1100px] space-y-8">
        <header className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">SOUQ</p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] md:text-[34px]">
              Join others to unlock a better deal
            </h1>
            <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted">
              Groups lock when they reach their target. Your payment is only authorized on join and
              captured when the deal is confirmed — released automatically if it isn&apos;t.
            </p>
          </div>
          <SearchForm placeholder="Search group buys…" />
        </header>

        {circles.length === 0 ? (
          <EmptyState
            icon="souq"
            title="No open groups right now"
            body="Open group buys appear here the moment sellers publish them. Check back soon or browse the last deal categories."
          />
        ) : (
          <section>
            <SectionTitle>Open groups</SectionTitle>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {circles.map((circle) => (
                <SouqCircleCard key={circle.id} circle={circle} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
