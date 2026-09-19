"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

const ACTIONS = [
  { action: "approve", label: "Approve" },
  { action: "disable", label: "Disable" },
  { action: "reject", label: "Reject" },
  { action: "restore", label: "Restore" },
] as const;

/** Admin moderation controls — reason required, server-side state-checked. */
export function ModerationActions({
  entityType,
  entityId,
  status,
}: {
  entityType: string;
  entityId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: string): Promise<void> {
    const reason = window.prompt(`Reason for "${action}" (required):`) ?? "";
    if (reason.trim().length < 3) {
      if (reason !== null) window.alert("A reason of at least 3 characters is required.");
      return;
    }
    setPending(action);
    setError(null);
    try {
      await apiPost("/api/v1/admin/listings/moderate", { entityType, entityId, action, reason });
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setPending(null);
    }
  }

  const legal: Record<string, string[]> = {
    draft: ["approve", "reject"],
    active: ["disable", "reject"],
    paused: ["approve", "reject"],
    archived: ["restore"],
  };

  const options = legal[status] ?? [];
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {ACTIONS.filter((item) => options.includes(item.action)).map((item) => (
        <button
          key={item.action}
          type="button"
          onClick={() => void run(item.action)}
          disabled={pending !== null}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
            item.action === "approve" || item.action === "restore"
              ? "bg-green text-bg hover:bg-green-dark"
              : "border border-line text-danger hover:border-danger"
          }`}
        >
          {pending === item.action ? "Working…" : item.label}
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
