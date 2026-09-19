"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

interface AccountProfileValues {
  displayName: string;
  phone: string;
  country: string;
  locale: string;
  emailNotificationsEnabled: boolean;
}

/** Personal information + notification preferences (§37). */
export function AccountProfileForm({ initial }: { initial: AccountProfileValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const input =
    "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-green";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setSuccess(null);
        apiPost("/api/v1/account/profile", {
          displayName: values.displayName,
          phone: values.phone || undefined,
          country: values.country || undefined,
          locale: values.locale,
          emailNotificationsEnabled: values.emailNotificationsEnabled,
        })
          .then(() => {
            setSuccess("Saved.");
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
      {success ? (
        <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
          {success}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="displayName" className="mb-1.5 block text-[13px] font-medium">
            Full name
          </label>
          <input
            id="displayName"
            className={input}
            value={values.displayName}
            onChange={(event) => setValues((v) => ({ ...v, displayName: event.target.value }))}
            required
            minLength={2}
            maxLength={80}
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium">
            Phone
          </label>
          <input
            id="phone"
            className={input}
            value={values.phone}
            onChange={(event) => setValues((v) => ({ ...v, phone: event.target.value }))}
            maxLength={30}
          />
        </div>
        <div>
          <label htmlFor="country" className="mb-1.5 block text-[13px] font-medium">
            Country
          </label>
          <input
            id="country"
            className={input}
            value={values.country}
            onChange={(event) => setValues((v) => ({ ...v, country: event.target.value }))}
            maxLength={60}
          />
        </div>
        <div>
          <label htmlFor="locale" className="mb-1.5 block text-[13px] font-medium">
            Language
          </label>
          <select
            id="locale"
            className={input}
            value={values.locale}
            onChange={(event) => setValues((v) => ({ ...v, locale: event.target.value }))}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3.5 py-3">
        <input
          type="checkbox"
          checked={values.emailNotificationsEnabled}
          onChange={(event) => setValues((v) => ({ ...v, emailNotificationsEnabled: event.target.checked }))}
          className="accent-[#61775a]"
        />
        <span>
          <span className="block text-[13px] font-medium">Email notifications</span>
          <span className="block text-[12px] text-muted">Payment, booking and group updates by email</span>
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green px-5 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-70"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
