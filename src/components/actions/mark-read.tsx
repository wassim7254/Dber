"use client";

import { useRouter } from "next/navigation";

import { useAction } from "@/lib/client/use-action";

export function MarkRead({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const { state, run } = useAction();

  return (
    <button
      type="button"
      disabled={state.phase === "loading"}
      onClick={() =>
        void run({
          path: `/api/v1/notifications/${notificationId}/read`,
          loading: "…",
          onDone: () => router.refresh(),
        })
      }
      aria-label="Mark as read"
      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-green-soft text-green-dark transition-colors hover:bg-green hover:text-bg disabled:opacity-50"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 12.5 9.5 18 20 6.5" />
      </svg>
    </button>
  );
}
