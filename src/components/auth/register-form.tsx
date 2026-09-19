"use client";

import { useState } from "react";

import { Field, FormError, SubmitButton, useAuthSubmit } from "@/components/auth/auth-kit";
import { Icon, type IconName } from "@/components/dber/icon";

export interface RoleCardOption {
  value: "seller" | "professional" | "rental_owner";
  label: string;
  blurb: string;
  icon: IconName;
}

/**
 * Registration (§1/§2): one account, many roles. Shopping is implicit —
 * the provider roles are the explicit, multi-select choice.
 */
export function RegisterForm({
  options,
}: {
  options: readonly RoleCardOption[];
}) {
  const { router, pending, error, submit } = useAuthSubmit();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [country, setCountry] = useState("");

  function toggle(value: string): void {
    setSelected((current) =>
      current.includes(value) ? current.filter((role) => role !== value) : [...current, value],
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const roles = selected.length > 0 ? selected : ["buyer"];
        void submit(
          "/api/v1/auth/register",
          { displayName, email, password, roles, country: country || undefined },
          () => {
            router.push("/onboarding");
            router.refresh();
          },
        );
      }}
    >
      <FormError message={error} />
      <Field
        id="displayName"
        label="Your name"
        value={displayName}
        onChange={setDisplayName}
        autoComplete="name"
        required
      />
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
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
      />
      <Field
        id="country"
        label="Country (optional)"
        value={country}
        onChange={setCountry}
        autoComplete="country-name"
      />

      <fieldset>
        <legend className="text-[14px] font-semibold">How will you use DBER?</legend>
        <p className="mt-0.5 text-[12.5px] text-muted">
          Pick as many as you like — shopping is included for everyone.
        </p>
        <div className="mt-2.5 space-y-2">
          <div
            aria-label="Shop and discover — included for everyone"
            className="flex items-start gap-3 rounded-xl border border-green bg-green-soft/40 px-3.5 py-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-green text-bg">
              <Icon name="souq" size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold">Shop &amp; discover</span>
              <span className="block text-[12px] text-muted">
                Join group buys on SOUQ, book pros on KHIDMA, rent on KRAYA.
              </span>
            </span>
            <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-green text-bg">
              <Icon name="check" size={12} />
            </span>
          </div>

          {options.map((option) => {
            const active = selected.includes(option.value);
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  active ? "border-green bg-green-soft/40" : "border-line bg-surface hover:border-green"
                }`}
              >
                <input
                  type="checkbox"
                  name="roles"
                  value={option.value}
                  checked={active}
                  onChange={() => toggle(option.value)}
                  className="sr-only"
                />
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    active ? "bg-green text-bg" : "bg-bg text-muted"
                  }`}
                >
                  <Icon name={option.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold">{option.label}</span>
                  <span className="block text-[12px] text-muted">{option.blurb}</span>
                </span>
                <span
                  aria-hidden
                  className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    active ? "border-green bg-green text-bg" : "border-line bg-surface"
                  }`}
                >
                  {active ? <Icon name="check" size={12} /> : null}
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Roles stay optional and switchable later from your account.
        </p>
      </fieldset>

      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
