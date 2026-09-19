"use client";

import type { ReactNode } from "react";

export function ProField({
  id,
  label,
  hint,
  error,
  children,
  required,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
        {required ? <span aria-hidden="true" className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
      {error ? (
        <p className="mt-1 text-[12px] text-danger">{error}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-green";

export function ProFormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
      {message}
    </p>
  );
}

export function ProFormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
      {message}
    </p>
  );
}

export function ProSubmit({ pending, children, secondary }: { pending: boolean; children: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green px-5 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Saving…" : children}
      </button>
      {secondary}
    </div>
  );
}

/** MAD major-units input bound to a minor-units number. */
export function MoneyInput({
  id,
  valueMinor,
  onChangeMinor,
  placeholder,
}: {
  id: string;
  valueMinor: number | "";
  onChangeMinor: (minor: number) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={valueMinor === "" ? "" : (valueMinor / 100).toString()}
        placeholder={placeholder}
        onChange={(event) => {
          const major = Number.parseFloat(event.target.value);
          onChangeMinor(Number.isFinite(major) && major >= 0 ? Math.round(major * 100) : 0);
        }}
        className={inputClass}
      />
      <span className="text-[13px] font-medium text-muted">MAD</span>
    </div>
  );
}
