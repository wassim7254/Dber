"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Error details are logged server-side with the request id; the digest
    // below is the only reference surfaced to the user (§21).
    console.error(error.digest ?? error.message);
  }, [error]);

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-[480px] rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted">
          Something went wrong
        </p>
        <h1 className="mt-2 text-[22px] font-semibold">This page couldn&apos;t load</h1>
        <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px] leading-relaxed text-muted">
          Your data is safe — transactions continue server-side. Try again; if it persists, note
          this reference: <span className="tnum font-mono">{error.digest ?? "n/a"}</span>
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-green px-5 py-2.5 text-[13.5px] font-semibold text-bg hover:bg-green-dark"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-line px-5 py-2.5 text-[13.5px] font-semibold hover:border-green"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
