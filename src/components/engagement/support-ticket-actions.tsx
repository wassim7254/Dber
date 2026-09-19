"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

const STATES = ["open", "in_progress", "resolved", "closed"] as const;

/** Ops/admin support queue controls — every change is audited server-side. */
export function SupportTicketActions({ ticketId, currentState }: { ticketId: string; currentState: string }) {
  const router = useRouter();
  const [, setState] = useState<string>(currentState);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {STATES.filter((option) => option !== currentState).map((option) => (
          <button
            key={option}
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              setError(null);
              apiPost(`/api/v1/support/${ticketId}/update`, {
                state: option,
                resolutionNote: note || undefined,
              })
                .then(() => {
                  setState(option);
                  setPending(false);
                  router.refresh();
                })
                .catch((caught) => {
                  setError(describeApiError(caught));
                  setPending(false);
                });
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-green disabled:opacity-60"
          >
            Mark {option.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Resolution note (optional)"
        maxLength={2000}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] outline-none focus:border-green"
      />
      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
