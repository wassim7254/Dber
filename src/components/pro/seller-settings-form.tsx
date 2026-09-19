"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { inputClass, ProField, ProFormError, ProFormSuccess, ProSubmit } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export interface SellerSettingsValues {
  storeName: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  city: string;
  country: string;
  deliveryInfo: string;
  pickupInfo: string;
  payoutHandle: string;
}

/** Seller store settings (§5 seller onboarding persistence). */
export function SellerSettingsForm({ initial }: { initial: Partial<SellerSettingsValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<SellerSettingsValues>({
    storeName: initial.storeName ?? "",
    description: initial.description ?? "",
    contactEmail: initial.contactEmail ?? "",
    contactPhone: initial.contactPhone ?? "",
    city: initial.city ?? "",
    country: initial.country ?? "MA",
    deliveryInfo: initial.deliveryInfo ?? "",
    pickupInfo: initial.pickupInfo ?? "",
    payoutHandle: initial.payoutHandle ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function set<K extends keyof SellerSettingsValues>(key: K, value: string): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setSuccess(null);
        apiPost("/api/v1/seller/profile", values)
          .then(() => {
            setSuccess("Store settings saved.");
            setPending(false);
            router.refresh();
          })
          .catch((caught) => {
            setError(describeApiError(caught));
            setPending(false);
          });
      }}
    >
      <ProFormError message={error} />
      <ProFormSuccess message={success} />
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="storeName" label="Store name" required>
          <input id="storeName" className={inputClass} value={values.storeName} onChange={(event) => set("storeName", event.target.value)} required minLength={2} maxLength={120} />
        </ProField>
        <ProField id="city" label="City">
          <input id="city" className={inputClass} value={values.city} onChange={(event) => set("city", event.target.value)} maxLength={120} />
        </ProField>
      </div>
      <ProField id="description" label="About your store">
        <textarea id="description" className={`${inputClass} min-h-24`} value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={5000} />
      </ProField>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="contactEmail" label="Contact email">
          <input id="contactEmail" type="email" className={inputClass} value={values.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} />
        </ProField>
        <ProField id="contactPhone" label="Contact phone">
          <input id="contactPhone" className={inputClass} value={values.contactPhone} onChange={(event) => set("contactPhone", event.target.value)} maxLength={30} />
        </ProField>
      </div>
      <ProField id="deliveryInfo" label="Delivery information" hint="Zones, timing, carrier — shown to buyers.">
        <textarea id="deliveryInfo" className={`${inputClass} min-h-20`} value={values.deliveryInfo} onChange={(event) => set("deliveryInfo", event.target.value)} maxLength={2000} />
      </ProField>
      <ProField id="pickupInfo" label="Pickup information">
        <textarea id="pickupInfo" className={`${inputClass} min-h-20`} value={values.pickupInfo} onChange={(event) => set("pickupInfo", event.target.value)} maxLength={2000} />
      </ProField>
      <ProField id="payoutHandle" label="Payout reference" hint="The provider-side payout destination reference. Never enter bank card numbers here.">
        <input id="payoutHandle" className={inputClass} value={values.payoutHandle} onChange={(event) => set("payoutHandle", event.target.value)} maxLength={120} />
      </ProField>
      <ProSubmit pending={pending}>Save store settings</ProSubmit>
    </form>
  );
}
