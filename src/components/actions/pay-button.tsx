"use client";

import { useRouter } from "next/navigation";

import { ActionFeedback, useAction } from "@/lib/client/use-action";

/**
 * "Confirm and pay": requests capture, then polls the payment state — the UI
 * never optimistically claims money moved (§54). Server-confirmed state drives
 * the final view.
 */
export function PayButton({ paymentId, amountLabel }: { paymentId: string; amountLabel: string }) {
  const router = useRouter();
  const { state, run } = useAction();

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={state.phase === "loading"}
        onClick={() =>
          void run({
            path: `/api/v1/payments/${paymentId}/capture`,
            loading: "Processing payment…",
            successMessage: "Payment received.",
            onDone: () => {
              let polls = 0;
              const poll = (): void => {
                polls += 1;
                setTimeout(async () => {
                  const response = await fetch(`/api/v1/payments/${paymentId}`);
                  const payload = (await response.json()) as { data?: { payment?: { state?: string } } };
                  const paymentState = payload.data?.payment?.state;
                  if (paymentState === "captured" || paymentState === "failed") {
                    router.refresh();
                    return;
                  }
                  if (polls < 10) poll();
                  else router.refresh();
                }, 700);
              };
              poll();
            },
          })
        }
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green text-[15px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-60"
      >
        {state.phase === "loading" ? "Processing…" : `Confirm and pay ${amountLabel}`}
      </button>
      <ActionFeedback state={state} />
      <p className="text-[12px] leading-relaxed text-muted">
        Payments are verified server-side. If your browser closes during processing, the
        transaction continues safely and its status appears in Activity.
      </p>
    </div>
  );
}
