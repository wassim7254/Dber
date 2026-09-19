"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

const RATING_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

/** Post-transaction review form (§35) — only rendered for completed transactions. */
export function ReviewForm({
  entityType,
  entityId,
  existing,
}: {
  entityType: "souq_circle" | "khidma_booking" | "kraya_booking";
  entityId: string;
  existing?: { rating: number; title: string; body: string } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done || existing) {
    return (
      <p className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
        {existing ? "You already reviewed this transaction — thank you." : "Thank you — your review has been published."}
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === 0) {
          setError("Pick a rating first.");
          return;
        }
        setPending(true);
        setError(null);
        apiPost("/api/v1/reviews", { entityType, entityId, rating, title, body })
          .then(() => {
            setDone(true);
            router.refresh();
          })
          .catch((caught) => {
            setError(describeApiError(caught));
            setPending(false);
          });
      }}
    >
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">How did it go?</legend>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              onClick={() => setRating(value)}
              className={`flex size-11 items-center justify-center rounded-lg border text-[13px] font-semibold transition-colors ${
                rating >= value ? "border-green bg-green text-bg" : "border-line hover:border-green"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        {rating > 0 ? <p className="mt-1.5 text-[12px] text-muted">{RATING_LABELS[rating]}</p> : null}
      </fieldset>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Headline (optional)"
        maxLength={200}
        className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-green"
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What should other customers know?"
        maxLength={4000}
        className="min-h-24 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-green"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green px-5 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-70"
      >
        {pending ? "Publishing…" : "Publish review"}
      </button>
    </form>
  );
}
