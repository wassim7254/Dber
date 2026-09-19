"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { inputClass, ProFormError } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

interface WindowRow {
  id: string;
  startTime: string;
  endTime: string;
  note: string;
}

/** Owner-blocked calendar windows (§16): add/remove ranges a renter can't book. */
export function BlockedWindowsEditor({ assetId, windows }: { assetId: string; windows: WindowRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<WindowRow[]>(windows);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addWindow(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!start || !end || end <= start) {
      setError("Pick a valid range — the end must be after the start.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = (await apiPost<{ windowId: string }>(`/api/v1/kraya/assets/${assetId}/availability`, {
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        note,
      })) as { windowId: string };
      setRows((previous) => [
        ...previous,
        { id: result.windowId, startTime: start, endTime: end, note },
      ]);
      setStart("");
      setEnd("");
      setNote("");
      setPending(false);
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
      setPending(false);
    }
  }

  async function removeWindow(windowId: string): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await fetch(`/api/v1/kraya/assets/${assetId}/availability/${windowId}`, { method: "DELETE" });
      setRows((previous) => previous.filter((row) => row.id !== windowId));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <ProFormError message={error} />
      {rows.length > 0 ? (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="tnum text-[13px] font-medium">
                  {new Date(row.startTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" → "}
                  {new Date(row.endTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                {row.note ? <p className="text-[12px] text-muted">{row.note}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void removeWindow(row.id)}
                disabled={pending}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-bg px-4 py-3 text-[13px] text-muted">No blocked windows — the asset is bookable whenever it&apos;s not rented.</p>
      )}
      <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(event) => void addWindow(event)}>
        <input
          type="datetime-local"
          aria-label="Blocked from"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          className={inputClass}
        />
        <input
          type="datetime-local"
          aria-label="Blocked until"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          className={inputClass}
        />
        <input
          type="text"
          aria-label="Reason (optional)"
          placeholder="Reason (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={inputClass}
          maxLength={200}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-azure px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-azure-dark disabled:opacity-70"
        >
          {pending ? "Saving…" : "Block dates"}
        </button>
      </form>
    </div>
  );
}
