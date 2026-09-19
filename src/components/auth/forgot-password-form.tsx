"use client";

import { useState } from "react";

import { Field, FormError, SubmitButton } from "@/components/auth/auth-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ message: string } | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        apiPost("/api/v1/auth/forgot-password", { email })
          .then((data) => setDone(data as { message: string }))
          .catch((caught) => setError(describeApiError(caught)))
          .finally(() => setPending(false));
      }}
    >
      {done ? (
        <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
          {done.message}
        </p>
      ) : (
        <>
          <FormError message={error} />
          <Field id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
          <SubmitButton pending={pending}>Send reset link</SubmitButton>
        </>
      )}
    </form>
  );
}
