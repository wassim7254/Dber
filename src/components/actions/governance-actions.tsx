"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionFeedback, useAction } from "@/lib/client/use-action";

/** Admin review of a cancellation request (§34/§35). */
export function ReviewCancellation({ cancellationId }: { cancellationId: string }) {
  const router = useRouter();
  const { state, run } = useAction();
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-2.5">
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Decision reason (required)"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={reason.trim().length < 3 || state.phase === "loading"}
          onClick={() =>
            void run({
              path: `/api/v1/cancellations/${cancellationId}/review`,
              body: { decision: "approve", decisionReason: reason },
              loading: "Executing…",
              successMessage: "Cancellation approved and executed in one transaction.",
              onDone: () => router.refresh(),
            })
          }
          className="h-10 flex-1 rounded-lg bg-green text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-50"
        >
          Approve & execute
        </button>
        <button
          type="button"
          disabled={reason.trim().length < 3 || state.phase === "loading"}
          onClick={() =>
            void run({
              path: `/api/v1/cancellations/${cancellationId}/review`,
              body: { decision: "reject", decisionReason: reason },
              loading: "Saving…",
              successMessage: "Cancellation rejected.",
              onDone: () => router.refresh(),
            })
          }
          className="h-10 flex-1 rounded-lg border border-danger/40 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      <ActionFeedback state={state} />
    </div>
  );
}

/** Admin dispute resolution (§39): force_refund | force_complete | partial_refund | dismiss. */
export function ResolveDispute({
  disputeId,
  suggestedAmountMinor,
}: {
  disputeId: string;
  suggestedAmountMinor?: number;
}) {
  const router = useRouter();
  const { state, run } = useAction();
  const [resolution, setResolution] = useState("force_refund");
  const [rationale, setRationale] = useState("");
  const [amount, setAmount] = useState(
    suggestedAmountMinor ? String(suggestedAmountMinor / 100) : "0",
  );

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[12px] font-medium text-muted">Resolution</span>
          <select
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px]"
          >
            <option value="force_refund">Force refund (full)</option>
            <option value="partial_refund">Partial refund</option>
            <option value="force_complete">Force complete</option>
            <option value="dismiss">Dismiss</option>
          </select>
        </label>
        {resolution === "partial_refund" ? (
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-muted">Amount (MAD)</span>
            <input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="tnum w-full rounded-lg border border-line bg-surface px-2.5 py-2 font-mono text-[13px]"
            />
          </label>
        ) : null}
      </div>
      <textarea
        value={rationale}
        onChange={(event) => setRationale(event.target.value)}
        rows={2}
        placeholder="Rationale (permanent audit record)"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"
      />
      <button
        type="button"
        disabled={rationale.trim().length < 3 || state.phase === "loading"}
        onClick={() =>
          void run({
            path: `/api/v1/disputes/${disputeId}/resolve`,
            body: {
              resolution,
              rationale,
              ...(resolution === "partial_refund" ? { amountMinor: Math.round(Number(amount) * 100) } : {}),
            },
            loading: "Resolving…",
            successMessage: "Dispute resolved — audited permanently.",
            onDone: () => router.refresh(),
          })
        }
        className="h-10 w-full rounded-lg bg-green-dark text-[13px] font-semibold text-bg transition-colors hover:bg-green disabled:opacity-50"
      >
        {state.phase === "loading" ? "Resolving…" : "Resolve dispute"}
      </button>
      <ActionFeedback state={state} />
    </div>
  );
}

/** Opens a dispute on a booking (either party). */
export function OpenDisputeButton({
  entityType,
  entityId,
}: {
  entityType: "khidma_booking" | "kraya_booking";
  entityId: string;
}) {
  const router = useRouter();
  const { state, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-line px-4 text-[13px] font-semibold text-ink transition-colors hover:border-danger hover:text-danger"
      >
        Open a dispute
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        placeholder="Explain the problem — operations will review evidence from both sides."
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"
      />
      <button
        type="button"
        disabled={reason.trim().length < 10 || state.phase === "loading"}
        onClick={() =>
          void run({
            path: "/api/v1/disputes",
            body: { entityType, entityId, reason },
            loading: "Opening…",
            successMessage: "Dispute opened. Operations will review it.",
            onDone: () => router.refresh(),
          })
        }
        className="h-10 w-full rounded-lg bg-green-dark text-[13px] font-semibold text-bg disabled:opacity-50"
      >
        {state.phase === "loading" ? "Opening…" : "Submit dispute"}
      </button>
      <ActionFeedback state={state} />
    </div>
  );
}

/** Buyer/renter requests a reviewed cancellation (§34). */
export function RequestCancellationButton({
  entityType,
  entityId,
}: {
  entityType: "souq_circle" | "khidma_booking" | "kraya_booking";
  entityId: string;
}) {
  const router = useRouter();
  const { state, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-lg border border-line px-4 text-[13px] font-semibold text-ink transition-colors hover:border-warn hover:text-warn"
      >
        Request cancellation
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        placeholder="Why should this be cancelled? Operations reviews requests."
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"
      />
      <button
        type="button"
        disabled={reason.trim().length < 3 || state.phase === "loading"}
        onClick={() =>
          void run({
            path: "/api/v1/cancellations",
            body: { entityType, entityId, reason },
            loading: "Submitting…",
            successMessage: "Cancellation requested — track the review in Activity.",
            onDone: () => router.refresh(),
          })
        }
        className="h-10 w-full rounded-lg bg-green text-[13px] font-semibold text-bg disabled:opacity-50"
      >
        {state.phase === "loading" ? "Submitting…" : "Submit request"}
      </button>
      <ActionFeedback state={state} />
    </div>
  );
}
