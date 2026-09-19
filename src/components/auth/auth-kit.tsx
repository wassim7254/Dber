"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
}

export function Field({ id, label, type = "text", value, onChange, autoComplete, required, hint, error }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {required ? <span aria-hidden="true" className="ml-0.5 text-danger">*</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`w-full rounded-lg border bg-surface px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-green ${
          error ? "border-danger" : "border-line"
        }`}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
      {message}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center rounded-lg bg-green px-4 py-3 text-[14px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

/** Shared sign-in/sign-up shell so every auth screen feels like one product. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col px-5 py-10 md:py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">DBER Account</p>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.01em]">{title}</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{subtitle}</p>
      <div className="mt-7 space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(23,24,21,0.04)]">
        {children}
      </div>
      {footer ? <div className="mt-5 text-[13px] text-muted">{footer}</div> : null}
    </div>
  );
}

export function useAuthSubmit() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(path: string, body: unknown, onDone?: (data: unknown) => void): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const data = await apiPost(path, body);
      onDone?.(data);
    } catch (caught) {
      setError(describeApiError(caught));
      setPending(false);
    }
  }

  const redirectTo = params.get("redirect") ?? "/";
  return { router, pending, error, setError, submit, redirectTo };
}

export function AuthFooterLink({ href, label, linkLabel }: { href: string; label: string; linkLabel: string }) {
  return (
    <span>
      {label}{" "}
      <Link href={href} className="font-semibold text-green-dark hover:underline">
        {linkLabel}
      </Link>
    </span>
  );
}
