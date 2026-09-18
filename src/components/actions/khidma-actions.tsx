"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionFeedback, useAction } from "@/lib/client/use-action";

/** Buyer creates a service request against a professional's service. */
export function RequestForm({ serviceId }: { serviceId?: string }) {
  const router = useRouter();
  const { state, run } = useAction();
  const [description, setDescription] = useState("");

  return (
    <div className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-[12px] font-medium text-muted">What do you need?</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Describe the job, timing, and location…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed"
        />
      </label>
      <button
        type="button"
        disabled={description.trim().length < 10 || state.phase === "loading"}
        onClick={() =>
          void run({
            path: "/api/v1/khidma/requests",
            body: { description, ...(serviceId ? { serviceId } : {}) },
            loading: "Sending…",
            successMessage: "Request sent — professionals can now quote it. Track it in Activity.",
            onDone: (data) => {
              const result = data as { requestId?: string };
              if (result.requestId) router.push(`/khidma/requests/${result.requestId}`);
            },
          })
        }
        className="h-11 w-full rounded-xl bg-green text-[14px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-50"
      >
        {state.phase === "loading" ? "Sending…" : "Request this service"}
      </button>
      <ActionFeedback state={state} />
    </div>
  );
}

/** Professional submits a quote on an open request. */
export function QuoteForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const { state, run } = useAction();
  const [amount, setAmount] = useState("450");
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[130px_1fr] gap-3">
        <label className="space-y-1.5">
          <span className="text-[12px] font-medium text-muted">Amount (MAD)</span>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="tnum w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-[13px]"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-[12px] font-medium text-muted">Message</span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Timing, scope, materials…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px]"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={state.phase === "loading" || !Number(amount)}
        onClick={() =>
          void run({
            path: `/api/v1/khidma/requests/${requestId}/quotes`,
            body: { requestId, amountMinor: Math.round(Number(amount) * 100), message },
            loading: "Submitting…",
            successMessage: "Quote submitted. The buyer is notified.",
            onDone: () => router.refresh(),
          })
        }
        className="h-11 w-full rounded-xl bg-green text-[14px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-50"
      >
        {state.phase === "loading" ? "Submitting…" : "Submit quote"}
      </button>
      <ActionFeedback state={state} />
    </div>
  );
}

/** Buyer accepts a quote: chooses the schedule, server snapshots terms and holds the slot. */
export function AcceptQuote({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const { state, run } = useAction();
  const [start, setStart] = useState(() => toLocal(new Date(Date.now() + 72 * 3_600_000)));
  const [end, setEnd] = useState(() => toLocal(new Date(Date.now() + 75 * 3_600_000)));

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-bg p-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-muted">Start</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="tnum w-full rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-[12px]"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-muted">End</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="tnum w-full rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-[12px]"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={state.phase === "loading"}
        onClick={() =>
          void run({
            path: `/api/v1/khidma/quotes/${quoteId}/accept`,
            body: { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() },
            loading: "Booking…",
            onDone: (data) => {
              const result = data as { paymentId?: string };
              if (result.paymentId) router.push(`/checkout/${result.paymentId}`);
              else router.refresh();
            },
          })
        }
        className="h-10 w-full rounded-lg bg-green text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-50"
      >
        {state.phase === "loading" ? "Booking…" : "Accept quote & continue to payment"}
      </button>
      <ActionFeedback state={state} />
    </div>
  );
}

function toLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
