/** Rating display: stars + count. Communicates by icon + number, not color alone. */
export function RatingStars({
  average,
  count,
  size = "sm",
}: {
  average: number | null;
  count: number;
  size?: "sm" | "lg";
}) {
  if (count === 0 || average === null) {
    return <span className="text-[12px] text-muted">No reviews yet</span>;
  }
  const rounded = Math.round(average);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[13px] leading-none text-warn" aria-hidden="true">
        {"★".repeat(rounded)}
        <span className="text-line">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className={`tnum font-mono ${size === "lg" ? "text-[14px]" : "text-[12px]"} text-muted`}>
        {average.toFixed(1)} ({count})
      </span>
      <span className="sr-only">{`Rated ${average.toFixed(1)} out of 5 from ${count} reviews`}</span>
    </span>
  );
}

export function ReviewList({
  reviews,
}: {
  reviews: { id: string; rating: number; title: string; body: string; authorName: string; createdAt: string }[];
}) {
  if (reviews.length === 0) {
    return <p className="text-[13px] text-muted">No written reviews yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold">{review.title || "Review"}</p>
            <span className="tnum font-mono text-[12px] text-warn" aria-label={`${review.rating} out of 5`}>
              {"★".repeat(review.rating)}
              <span className="text-line">{"★".repeat(5 - review.rating)}</span>
            </span>
          </div>
          {review.body ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{review.body}</p> : null}
          <p className="tnum mt-2 text-[11.5px] text-muted">
            {review.authorName} · {new Date(review.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </li>
      ))}
    </ul>
  );
}
