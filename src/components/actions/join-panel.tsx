"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActionFeedback, useAction } from "@/lib/client/use-action";
import { formatMoney } from "@/lib/money";

/**
 * Souq join flow (§8/§11): quantity selection, processing state that prevents
 * double submission, and explicit handling of every unhappy path — capacity
 * lost, state changed, payment pending, duplicate join.
 */
export function JoinPanel({
  circleId,
  groupPriceMinor,
  currency,
  spotsRemaining,
  state,
}: {
  circleId: string;
  groupPriceMinor: number;
  currency: string;
  spotsRemaining: number;
  state: string;
}) {
  const router = useRouter();
  const { state: action, run } = useAction();
  const [quantity, setQuantity] = useState(1);

  if (state !== "open") {
    return (
      <div className="rounded-xl bg-green-soft px-4 py-3 text-[13px] text-green-dark">
        {state === "locked"
          ? "This group is locked — it reached its target and is being confirmed with the supplier."
          : "This group is no longer accepting joins."}
      </div>
    );
  }

  const joinable = spotsRemaining > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <label className="text-[13px] font-medium" htmlFor="join-quantity">
          Quantity
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            className="flex size-9 items-center justify-center rounded-lg border border-line text-[16px] transition-colors hover:border-green disabled:opacity-40"
            disabled={quantity <= 1 || action.phase === "loading"}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          >
            −
          </button>
          <span id="join-quantity" className="tnum w-8 text-center font-mono text-[15px]">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            className="flex size-9 items-center justify-center rounded-lg border border-line text-[16px] transition-colors hover:border-green disabled:opacity-40"
            disabled={quantity >= spotsRemaining || action.phase === "loading"}
            onClick={() => setQuantity((value) => Math.min(spotsRemaining, value + 1))}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
        <span className="text-[13px] text-muted">You pay now (authorization hold)</span>
        <span className="tnum font-mono text-[17px] font-semibold">
          {formatMoney(groupPriceMinor * quantity, currency)}
        </span>
      </div>

      <button
        type="button"
        disabled={!joinable || action.phase === "loading"}
        onClick={() =>
          void run({
            path: `/api/v1/souq/circles/${circleId}/join`,
            body: { quantity },
            loading: joinable ? "Joining…" : "Group full",
            successMessage: "You joined the group. Your payment is authorized and captured when the group locks.",
            onDone: () => router.refresh(),
          })
        }
        className="flex h-12 w-full items-center justify-center rounded-xl bg-green text-[15px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {action.phase === "loading" ? action.label : !joinable ? "GROUP FULL" : "JOIN GROUP"}
      </button>

      {!joinable ? (
        <p className="text-[12.5px] text-muted">
          The circle is at capacity. Follow it in Activity — a similar group may open.
        </p>
      ) : null}

      <ActionFeedback state={action} />
      <p className="text-[12px] leading-relaxed text-muted">
        Your payment is only authorized now. It is captured when the group locks, and fully
        released if the group expires or is cancelled.
      </p>
    </div>
  );
}
