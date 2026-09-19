"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

const ACTION_LABELS: Record<string, string> = {
  publish: "Publish",
  pause: "Pause",
  archive: "Archive",
  restore: "Restore to draft",
};

/**
 * Publish/pause/archive controls for any listing (product, service, asset).
 * The server re-validates every gate; the UI only offers legal next steps.
 */
export function ListingStatusActions({
  transitionPath,
  status,
  compact = false,
}: {
  transitionPath: string;
  status: string;
  /** Compact renders smaller buttons for dense tables. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextActions: string[] =
    status === "draft" ? ["publish", "archive"] : status === "active" ? ["pause", "archive"] : status === "paused" ? ["publish", "archive"] : status === "archived" ? ["restore"] : [];

  if (nextActions.length === 0) return null;

  async function run(action: string): Promise<void> {
    setPending(action);
    setError(null);
    try {
      await apiPost(transitionPath, { action });
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nextActions.map((action) => (
        <button
          key={action}
          type="button"
          onClick={() => void run(action)}
          disabled={pending !== null}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
            action === "publish"
              ? "bg-green text-bg hover:bg-green-dark"
              : "border border-line hover:border-green"
          } ${compact ? "px-2.5 py-1 text-[11px]" : ""}`}
        >
          {pending === action ? "Working…" : ACTION_LABELS[action]}
        </button>
      ))}
      {error ? (
        <p role="alert" className="text-[11.5px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
