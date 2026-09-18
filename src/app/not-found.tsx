import Link from "next/link";

import { Card } from "@/components/dber/ui";

export default function NotFound() {
  return (
    <div className="px-4 py-16 md:py-24">
      <Card className="mx-auto max-w-[480px] p-8 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted">404</p>
        <h1 className="mt-2 text-[22px] font-semibold">We couldn&apos;t find that page</h1>
        <p className="mx-auto mt-2 max-w-[40ch] text-[13.5px] leading-relaxed text-muted">
          The page may have moved, or the transaction may belong to another account.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-green px-5 py-2.5 text-[13.5px] font-semibold text-bg hover:bg-green-dark"
        >
          Back home
        </Link>
      </Card>
    </div>
  );
}
