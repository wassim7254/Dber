import { Skeleton } from "@/components/dber/ui";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6 px-5 py-8 md:px-10" aria-busy="true">
      <Skeleton className="aspect-[16/9] w-full rounded-[var(--radius-card)] md:aspect-[21/9]" />
      <Skeleton className="h-7 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-xs" />
      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        </div>
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
      </div>
      <span className="sr-only">Loading content…</span>
    </div>
  );
}
