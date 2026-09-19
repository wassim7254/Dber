"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ImageUploader } from "@/components/pro/image-uploader";
import { inputClass, MoneyInput, ProField, ProFormError } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export interface AssetFormValues {
  title: string;
  description: string;
  category: "equipment" | "vehicle" | "space" | "tool" | "other";
  dailyRateMinor: number;
  depositMinor: number;
  location: string;
  capacity: number | null;
  rules: string;
  minDurationHours: number;
  images: string[];
}

/** KRAYA asset create/edit form (§15). Draft first; publish gates server-side. */
export function AssetForm({ assetId, initial }: { assetId?: string; initial?: Partial<AssetFormValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<AssetFormValues>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "equipment",
    dailyRateMinor: initial?.dailyRateMinor ?? 0,
    depositMinor: initial?.depositMinor ?? 0,
    location: initial?.location ?? "",
    capacity: initial?.capacity ?? null,
    rules: initial?.rules ?? "",
    minDurationHours: initial?.minDurationHours ?? 1,
    images: initial?.images ?? [],
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (assetId) {
        await apiPost(`/api/v1/kraya/assets/${assetId}`, values);
        router.push("/pro/rental/assets");
      } else {
        await apiPost("/api/v1/kraya/assets", values);
        router.push("/pro/rental/assets");
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
      <ProField id="title" label="Asset title" required>
        <input id="title" className={inputClass} value={values.title} onChange={(event) => set("title", event.target.value)} required minLength={3} maxLength={200} />
      </ProField>
      <ProField id="description" label="Description" required hint="Condition, included items, what makes it great to rent.">
        <textarea id="description" className={`${inputClass} min-h-32`} value={values.description} onChange={(event) => set("description", event.target.value)} required minLength={10} maxLength={5000} />
      </ProField>
      <div className="grid gap-4 md:grid-cols-3">
        <ProField id="category" label="Category" required>
          <select id="category" className={inputClass} value={values.category} onChange={(event) => set("category", event.target.value as AssetFormValues["category"])}>
            <option value="equipment">Equipment</option>
            <option value="vehicle">Vehicle</option>
            <option value="space">Space / venue</option>
            <option value="tool">Tool</option>
            <option value="other">Other</option>
          </select>
        </ProField>
        <ProField id="dailyRate" label="Rate per day" required>
          <MoneyInput id="dailyRate" valueMinor={values.dailyRateMinor} onChangeMinor={(minor) => set("dailyRateMinor", minor)} placeholder="e.g. 450.00" />
        </ProField>
        <ProField id="deposit" label="Refundable deposit" hint="Held — never charged unless agreed otherwise.">
          <MoneyInput id="deposit" valueMinor={values.depositMinor} onChangeMinor={(minor) => set("depositMinor", minor)} />
        </ProField>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ProField id="location" label="Location" required>
          <input id="location" className={inputClass} value={values.location} onChange={(event) => set("location", event.target.value)} maxLength={200} />
        </ProField>
        <ProField id="capacity" label="Capacity (people)">
          <input
            id="capacity"
            type="number"
            min="1"
            className={inputClass}
            value={values.capacity ?? ""}
            onChange={(event) => set("capacity", event.target.value === "" ? null : Math.max(1, Number(event.target.value) || 1))}
          />
        </ProField>
        <ProField id="minDurationHours" label="Minimum booking (hours)">
          <input
            id="minDurationHours"
            type="number"
            min="1"
            className={inputClass}
            value={values.minDurationHours}
            onChange={(event) => set("minDurationHours", Math.max(1, Number(event.target.value) || 1))}
          />
        </ProField>
      </div>
      <ProField id="rules" label="House rules" hint="Usage limits, insurance, return condition — frozen into the rental contract at confirmation.">
        <textarea id="rules" className={`${inputClass} min-h-24`} value={values.rules} onChange={(event) => set("rules", event.target.value)} maxLength={4000} />
      </ProField>
      <ImageUploader images={values.images} onChange={(images) => set("images", images)} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-azure px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-azure-dark disabled:opacity-70"
      >
        {pending ? "Saving…" : assetId ? "Save changes" : "Create draft asset"}
      </button>
    </form>
  );
}
