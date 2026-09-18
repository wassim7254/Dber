import { Icon } from "@/components/dber/icon";

/** Shared search entry — navigates to the universal search results page. */
export function SearchForm({ placeholder }: { placeholder: string }) {
  return (
    <form action="/search" className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        <Icon name="search" size={18} />
      </span>
      <input
        type="search"
        name="q"
        placeholder={placeholder}
        aria-label="Search"
        className="h-13 w-full rounded-xl border border-line bg-surface py-3.5 pl-11 pr-4 text-[14px] shadow-[0_1px_2px_rgba(23,24,21,0.04)] transition-colors placeholder:text-muted/70 focus:border-green"
      />
    </form>
  );
}
