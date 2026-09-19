"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

/** Save/favorite toggle (§36) — persisted server-side per user. */
export function SaveButton({
  entityType,
  entityId,
  initiallySaved,
  signedIn,
}: {
  entityType: "souq_product" | "khidma_service" | "kraya_asset" | "professional";
  entityId: string;
  initiallySaved: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) return null;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => {
          setPending(true);
          setError(null);
          apiPost<{ saved: boolean }>("/api/v1/saved", { entityType, entityId })
            .then((result) => {
              setSaved(result.saved);
              setPending(false);
              router.refresh();
            })
            .catch((caught) => {
              setError(describeApiError(caught));
              setPending(false);
            });
        }}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
          saved ? "border-green bg-green-soft text-green-dark" : "border-line hover:border-green"
        }`}
      >
        {saved ? "★ Saved" : "☆ Save"}
      </button>
      {error ? (
        <span role="alert" className="text-[11px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
