import { Skeleton } from "@/components/dber/ui";

/** Shared page-level skeleton (§48): every major screen loads progressively. */
export function PageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-7 px-5 py-8 md:px-10" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-12 w-full max-w-[520px]" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="space-y-2.5">
            <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading content…</span>
    </div>
  );
}
