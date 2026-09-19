import Link from "next/link";

import { Icon } from "@/components/dber/icon";

/** Shared search entry — rounded pill with a dark filter chip, like the refs. */
export function SearchForm({ placeholder }: { placeholder: string }) {
  return (
    <form action="/search" className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          <Icon name="search" size={18} />
        </span>
        <input
          type="search"
          name="q"
          placeholder={placeholder}
          aria-label="Search"
          className="h-13 w-full rounded-full border border-line/70 bg-surface py-3.5 pl-11 pr-4 text-[14px] shadow-[var(--shadow-card)] transition-colors placeholder:text-muted/70 focus:border-green"
        />
      </div>
      <button
        type="submit"
        aria-label="Search"
        className="flex size-13 shrink-0 items-center justify-center rounded-full bg-ink text-bg transition-transform active:scale-95"
      >
        <Icon name="search" size={19} />
      </button>
      <Link
        href="/souq"
        aria-label="Browse group buys"
        className="flex size-13 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[var(--shadow-card)] transition-colors hover:border-green"
      >
        <Icon name="spark" size={19} />
      </Link>
    </form>
  );
}
