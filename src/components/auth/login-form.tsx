"use client";

import { useState } from "react";

import { Field, FormError, SubmitButton, useAuthSubmit } from "@/components/auth/auth-kit";

export function LoginForm() {
  const { router, pending, error, submit, redirectTo } = useAuthSubmit();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit("/api/v1/auth/login", { email, password }, () => {
          router.push(redirectTo);
          router.refresh();
        });
      }}
    >
      <FormError message={error} />
      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
      />
      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
      />
      <div className="flex justify-end">
        <a href="/forgot-password" className="text-[12px] font-medium text-green-dark hover:underline">
          Forgot your password?
        </a>
      </div>
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
