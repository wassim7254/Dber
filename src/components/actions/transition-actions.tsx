"use client";

import { useRouter } from "next/navigation";

import { ActionFeedback, useAction } from "@/lib/client/use-action";

export interface TransitionAction {
  action: string;
  label: string;
  /** Destructive/high-impact actions prompt for a reason (§87). */
  requireReason?: boolean;
  danger?: boolean;
}

/**
 * State-machine-driven lifecycle buttons. The server re-validates every
 * transition; these buttons simply render the actions that are legal for the
 * entity's current state.
 */
export function TransitionActions({
  path,
  actions,
  successMessage,
}: {
  path: string;
  actions: TransitionAction[];
  successMessage?: string;
}) {
  const router = useRouter();
  const { state, run } = useAction();

  if (actions.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-2">
        {actions.map((item) => (
          <button
            key={item.action}
            type="button"
            disabled={state.phase === "loading"}
            onClick={() => {
              const reason =
                item.requireReason && item.danger
                  ? (window.prompt(`Reason for "${item.label}" (required):`) ?? "")
                  : undefined;
              if (item.requireReason && item.danger && (!reason || reason.trim().length < 3)) {
                if (reason !== null) {
                  window.alert("A reason of at least 3 characters is required for this action.");
                }
                return;
              }
              void run({
                path,
                body: { action: item.action, ...(reason ? { reason } : {}) },
                loading: "Processing…",
                successMessage,
                onDone: () => router.refresh(),
              });
            }}
            className={`h-10 rounded-lg px-4 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
              item.danger
                ? "border border-danger/40 text-danger hover:bg-danger-soft"
                : "bg-green text-bg hover:bg-green-dark"
            }`}
          >
            {state.phase === "loading" ? state.label : item.label}
          </button>
        ))}
      </div>
      <ActionFeedback state={state} />
    </div>
  );
}
