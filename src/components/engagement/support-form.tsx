"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

/** Support ticket form (§70) — optionally references a transaction. */
export function SupportForm({ defaultEntityType, defaultEntityId }: { defaultEntityType?: string; defaultEntityId?: string } = {}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
        Ticket received — we&apos;ll follow up here and by email. You can track it below.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        apiPost("/api/v1/support", {
          subject,
          body,
          entityType: defaultEntityType,
          entityId: defaultEntityId,
        })
          .then(() => {
            setDone(true);
            setPending(false);
            router.refresh();
          })
          .catch((caught) => {
            setError(describeApiError(caught));
            setPending(false);
          });
      }}
    >
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <label htmlFor="support-subject" className="mb-1.5 block text-[13px] font-medium">
          Subject
        </label>
        <input
          id="support-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
          minLength={4}
          maxLength={200}
          className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-green"
        />
      </div>
      <div>
        <label htmlFor="support-body" className="mb-1.5 block text-[13px] font-medium">
          What happened?
        </label>
        <textarea
          id="support-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          minLength={10}
          maxLength={5000}
          className="min-h-28 w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-green"
        />
      </div>
      {defaultEntityId ? (
        <p className="text-[12px] text-muted">This ticket references transaction {defaultEntityId.slice(0, 8)}…</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green px-5 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-70"
      >
        {pending ? "Sending…" : "Send ticket"}
      </button>
    </form>
  );
}
