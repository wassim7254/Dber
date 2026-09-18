"use client";

import { useCallback, useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

export type ActionState =
  | { phase: "idle" }
  | { phase: "loading"; label: string }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

/**
 * Shared mutation hook implementing the unhappy-path UX contract (§22/§53):
 * loading preserves the button (label change), domain errors get specific
 * copy, and success surfaces what happened next.
 */
export function useAction(): {
  state: ActionState;
  run: (config: { path: string; body?: unknown; loading: string; onDone?: (data: unknown) => void; successMessage?: string }) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<ActionState>({ phase: "idle" });

  const run = useCallback(
    async (config: {
      path: string;
      body?: unknown;
      loading: string;
      onDone?: (data: unknown) => void;
      successMessage?: string;
    }) => {
      setState({ phase: "loading", label: config.loading });
      try {
        const data = await apiPost(config.path, config.body);
        setState({ phase: "done", message: config.successMessage ?? "Done." });
        config.onDone?.(data);
      } catch (error) {
        setState({ phase: "error", message: describeApiError(error) });
      }
    },
    [],
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);
  return { state, run, reset };
}

export function ActionFeedback({ state }: { state: ActionState }) {
  if (state.phase === "error") {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] leading-relaxed text-danger">
        {state.message}
      </p>
    );
  }
  if (state.phase === "done") {
    return (
      <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-[12.5px] leading-relaxed text-success">
        {state.message}
      </p>
    );
  }
  return null;
}
