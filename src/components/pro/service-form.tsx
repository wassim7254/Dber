"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { inputClass, MoneyInput, ProField, ProFormError } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export interface ServiceFormValues {
  title: string;
  specialty: string;
  description: string;
  category: string;
  basePriceMinor: number;
  durationMinutes: number;
}

const CATEGORIES = ["home repair", "electrical", "plumbing", "design", "development", "photography", "tutoring", "beauty", "consulting", "other"];

/** KHIDMA service create/edit form (§9). Draft first; publish gates server-side. */
export function ServiceForm({ serviceId, initial }: { serviceId?: string; initial?: Partial<ServiceFormValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<ServiceFormValues>({
    title: initial?.title ?? "",
    specialty: initial?.specialty ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "home repair",
    basePriceMinor: initial?.basePriceMinor ?? 0,
    durationMinutes: initial?.durationMinutes ?? 60,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ServiceFormValues>(key: K, value: string | number): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (serviceId) {
        await apiPost(`/api/v1/khidma/services/${serviceId}`, values);
        router.push("/pro/professional/services");
      } else {
        await apiPost("/api/v1/khidma/services", values);
        router.push("/pro/professional/services");
      }
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)}>
      <ProFormError message={error} />
      <ProField id="title" label="Service name" required hint='What the customer gets — e.g. "Home electrical safety check".'>
        <input id="title" className={inputClass} value={values.title} onChange={(event) => set("title", event.target.value)} required minLength={3} maxLength={200} />
      </ProField>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="specialty" label="Specialty" required>
          <input id="specialty" className={inputClass} value={values.specialty} onChange={(event) => set("specialty", event.target.value)} required minLength={2} maxLength={120} />
        </ProField>
        <ProField id="category" label="Category" required>
          <select id="category" className={inputClass} value={values.category} onChange={(event) => set("category", event.target.value)}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </ProField>
      </div>
      <ProField id="description" label="What you deliver" required hint="Scope, deliverables, requirements, anything the customer should prepare.">
        <textarea id="description" className={`${inputClass} min-h-32`} value={values.description} onChange={(event) => set("description", event.target.value)} required minLength={10} maxLength={5000} />
      </ProField>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="basePrice" label="Starting price" required>
          <MoneyInput id="basePrice" valueMinor={values.basePriceMinor} onChangeMinor={(minor) => set("basePriceMinor", minor)} placeholder="e.g. 450.00" />
        </ProField>
        <ProField id="durationMinutes" label="Typical duration (minutes)" required>
          <input id="durationMinutes" type="number" min="15" step="15" className={inputClass} value={values.durationMinutes} onChange={(event) => set("durationMinutes", Math.max(15, Number(event.target.value) || 60))} required />
        </ProField>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-[#a05c2f] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#8a4d26] disabled:opacity-70"
      >
        {pending ? "Saving…" : serviceId ? "Save changes" : "Create draft service"}
      </button>
    </form>
  );
}
