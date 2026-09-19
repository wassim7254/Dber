"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Field, FormError, SubmitButton } from "@/components/auth/auth-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          This link is missing its token. Request a fresh reset link and open it from your email.
        </p>
        <a
          href="/forgot-password"
          className="block rounded-lg border border-line px-4 py-2.5 text-center text-[13px] font-semibold hover:border-green"
        >
          Request a new link
        </a>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== confirm) {
          setError("The two passwords don't match.");
          return;
        }
        setPending(true);
        setError(null);
        apiPost("/api/v1/auth/reset-password", { token, password })
          .then(() => {
            router.push("/login?reset=1");
          })
          .catch((caught) => {
            setError(describeApiError(caught));
            setPending(false);
          });
      }}
    >
      <FormError message={error} />
      <Field
        id="password"
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
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
      <SubmitButton pending={pending}>Update password</SubmitButton>
    </form>
  );
}
