"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Field, FormError, SubmitButton } from "@/components/auth/auth-kit";
import { apiPost, describeApiError } from "@/lib/client/api";
import { Card } from "@/components/dber/ui";
import { formatTimestamp } from "@/components/dber/ui";

interface SessionRow {
  id: string;
  userAgent: string;
  lastUsedAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export function AccountSecurityClient({
  hasPassword,
  email,
  emailVerified,
  sessions,
}: {
  hasPassword: boolean;
  email: string | null;
  emailVerified: boolean;
  sessions: SessionRow[];
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "pending" | "sent" | "failed">("idle");
  const [revoking, setRevoking] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (newPassword !== confirm) {
      setFormError("The two passwords don't match.");
      return;
    }
    setPending(true);
    setFormError(null);
    try {
      const result = (await apiPost<{ message: string }>("/api/v1/account/password", {
        currentPassword,
        newPassword,
      })) as { message: string };
      setNotice(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      router.refresh();
    } catch (caught) {
      setFormError(describeApiError(caught));
    } finally {
      setPending(false);
    }
  }

  async function revoke(sessionId: string): Promise<void> {
    setRevoking(sessionId);
    try {
      await apiPost("/api/v1/account/sessions/revoke", { sessionId });
      router.refresh();
    } finally {
      setRevoking(null);
    }
  }

  async function resendVerification(): Promise<void> {
    setResendState("pending");
    try {
      await apiPost("/api/v1/account/resend-verification", {});
      setResendState("sent");
    } catch {
      setResendState("failed");
    }
  }

  return (
    <div className="mt-7 space-y-5">
      {notice ? (
        <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
          {notice}
        </p>
      ) : null}

      <Card className="p-6">
        <h2 className="text-[16px] font-semibold">Email verification</h2>
        <p className="mt-1 text-[13px] text-muted">
          {email ? (
            <>
              <span className="font-medium text-ink">{email}</span> —{" "}
              {emailVerified ? "verified" : "not verified yet"}
            </>
          ) : (
            "This account has no email on file."
          )}
        </p>
        {email && !emailVerified ? (
          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={resendState === "pending"}
            className="mt-3 rounded-lg border border-line px-4 py-2 text-[13px] font-semibold transition-colors hover:border-green disabled:opacity-60"
          >
            {resendState === "pending"
              ? "Sending…"
              : resendState === "sent"
                ? "Verification email sent — check your inbox"
                : resendState === "failed"
                  ? "Email delivery unavailable — try again later"
                  : "Resend verification email"}
          </button>
        ) : null}
      </Card>

      <Card className="p-6">
        <h2 className="text-[16px] font-semibold">Password</h2>
        {hasPassword ? (
          <form className="mt-4 space-y-4" onSubmit={(event) => void changePassword(event)}>
            <FormError message={formError} />
            <Field
              id="currentPassword"
              label="Current password"
              type="password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              required
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="newPassword"
                label="New password"
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                required
                hint="At least 10 characters, with a letter and a number."
              />
              <Field
                id="confirm"
                label="Confirm new password"
                type="password"
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                required
              />
            </div>
            <SubmitButton pending={pending}>Update password</SubmitButton>
            <p className="text-[12px] text-muted">
              Changing your password signs out every other device.
            </p>
          </form>
        ) : (
          <p className="mt-2 text-[13px] text-muted">
            This account was created through development tooling and has no password. Set one by using
            “Forgot password” on the sign-in page with your account email.
          </p>
        )}
      </Card>

      {hasPassword && sessions.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-[16px] font-semibold">Active sessions</h2>
          <p className="mt-1 text-[13px] text-muted">
            Devices currently signed in as you. Sign out any device you don&apos;t recognize.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {session.userAgent || "Unknown device"}
                    {session.isCurrent ? <span className="ml-2 text-[11px] text-green-dark">This device</span> : null}
                  </p>
                  <p className="tnum font-mono text-[11px] text-muted">
                    Last used {formatTimestamp(session.lastUsedAt)}
                  </p>
                </div>
                {!session.isCurrent ? (
                  <button
                    type="button"
                    onClick={() => void revoke(session.id)}
                    disabled={revoking === session.id}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
                  >
                    {revoking === session.id ? "Signing out…" : "Sign out"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
