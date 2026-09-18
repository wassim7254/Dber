"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { ActionFeedback, useAction } from "@/lib/client/use-action";
import { formatMoney } from "@/lib/money";

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * KRAYA date selection (§13): start/end pickers with an instantly-updating
 * price estimate (display only — the server recomputes authoritatively on
 * booking), blocked ranges surfaced as unavailable.
 */
export function ReservePanel({
  assetId,
  dailyRateMinor,
  depositMinor,
  currency,
  bookedRanges,
}: {
  assetId: string;
  dailyRateMinor: number;
  depositMinor: number;
  currency: string;
  bookedRanges: { start: string; end: string }[];
}) {
  const router = useRouter();
  const { state, run } = useAction();
  const [start, setStart] = useState(() => toLocalInput(new Date(Date.now() + 48 * 3_600_000)));
  const [end, setEnd] = useState(() => toLocalInput(new Date(Date.now() + 96 * 3_600_000)));

  const quote = useMemo(() => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      return null;
    }
    const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000));
    return { days, charge: dailyRateMinor * days, total: dailyRateMinor * days + depositMinor };
  }, [start, end, dailyRateMinor, depositMinor]);

  const conflicts = useMemo(() => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return false;
    return bookedRanges.some(
      (range) => new Date(range.start) < endDate && startDate < new Date(range.end),
    );
  }, [bookedRanges, start, end]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[12px] font-medium text-muted">Start</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="tnum w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[13px]"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12px] font-medium text-muted">End</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="tnum w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[13px]"
          />
        </label>
      </div>

      {quote ? (
        <div className="space-y-1.5 rounded-xl bg-bg px-4 py-3 text-[13px]">
          <div className="flex justify-between">
            <span className="text-muted">
              {quote.days} day{quote.days === 1 ? "" : "s"} × {formatMoney(dailyRateMinor, currency)}
            </span>
            <span className="tnum font-mono">{formatMoney(quote.charge, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Refundable deposit hold</span>
            <span className="tnum font-mono">{formatMoney(depositMinor, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
            <span>Total authorization</span>
            <span className="tnum font-mono">{formatMoney(quote.total, currency)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[12.5px] text-danger">Pick a valid range — the end must be after the start.</p>
      )}

      {conflicts ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          Those dates overlap an existing booking. The server will reject the reservation — pick
          another window from the calendar above.
        </p>
      ) : null}

      <button
        type="button"
        disabled={!quote || conflicts || state.phase === "loading"}
        onClick={() =>
          void run({
            path: "/api/v1/kraya/bookings",
            body: { assetId, startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() },
            loading: "Reserving…",
            onDone: (data) => {
              const result = data as { rentalPaymentId?: string };
              if (result.rentalPaymentId) {
                router.push(`/checkout/${result.rentalPaymentId}`);
              } else {
                router.refresh();
              }
            },
          })
        }
        className="h-12 w-full rounded-xl bg-green text-[15px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-60"
      >
        {state.phase === "loading" ? "Reserving…" : "Reserve dates"}
      </button>
      <ActionFeedback state={state} />
      <p className="text-[12px] leading-relaxed text-muted">
        Reserving holds the dates for 15 minutes while you complete payment, then releases them
        automatically if unpaid.
      </p>
    </div>
  );
}
