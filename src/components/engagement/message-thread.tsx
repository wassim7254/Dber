"use client";

import { useEffect, useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";
import { formatTimestamp } from "@/components/dber/ui";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/**
 * Business-context message thread (§28). Participants only — the server
 * enforces the party list on every read and write.
 */
export function MessageThread({
  entityType,
  entityId,
  viewerId,
}: {
  entityType: "souq_circle" | "khidma_booking" | "kraya_booking";
  entityId: string;
  viewerId: string;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/messages?entityType=${entityType}&entityId=${entityId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((payload: { data?: { messages?: Message[] } }) => {
        if (!cancelled) setMessages(payload.data?.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  async function send(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setPending(true);
    setError(null);
    try {
      await apiPost("/api/v1/messages", { entityType, entityId, body });
      setDraft("");
      const refreshed = await fetch(`/api/v1/messages?entityType=${entityType}&entityId=${entityId}`);
      const payload = (await refreshed.json()) as { data?: { messages?: Message[] } };
      setMessages(payload.data?.messages ?? []);
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      {messages === null ? (
        <p className="text-[12.5px] text-muted">Loading messages…</p>
      ) : messages.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          No messages yet — anything about this transaction (timing, handover, details) belongs here.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {messages.map((message) => {
            const mine = message.senderId === viewerId;
            return (
              <li key={message.id} className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${mine ? "ml-auto bg-green-soft" : "bg-bg"}`}>
                <p className="text-[13px] leading-relaxed">{message.body}</p>
                <p className="tnum mt-1 font-mono text-[11px] text-muted">
                  {mine ? "You" : message.senderName} · {formatTimestamp(message.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <form className="mt-3 flex gap-2" onSubmit={(event) => void send(event)}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          className="min-h-11 flex-1 rounded-lg border border-line bg-surface px-3.5 text-[13.5px] outline-none focus:border-green"
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="min-h-11 rounded-lg bg-green px-4 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
