"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ImageUploader } from "@/components/pro/image-uploader";
import { inputClass, MoneyInput, ProField, ProFormError } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export interface ProductFormValues {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  sku: string;
  basePriceMinor: number;
  unit: string;
  maxAvailableQuantity: number;
  deliveryMethod: "delivery" | "pickup" | "both";
  deliveryFeeMinor: number;
  fulfillmentHours: number;
  location: string;
  images: string[];
}

const CATEGORIES = ["food", "electronics", "beauty", "home", "fashion", "kids", "general"];

/** SOUQ product create/edit form (§6). Publish gating happens server-side. */
export function ProductForm({
  productId,
  initial,
}: {
  productId?: string;
  initial?: Partial<ProductFormValues>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "food",
    subcategory: initial?.subcategory ?? "",
    sku: initial?.sku ?? "",
    basePriceMinor: initial?.basePriceMinor ?? 0,
    unit: initial?.unit ?? "unit",
    maxAvailableQuantity: initial?.maxAvailableQuantity ?? 10,
    deliveryMethod: initial?.deliveryMethod ?? "delivery",
    deliveryFeeMinor: initial?.deliveryFeeMinor ?? 0,
    fulfillmentHours: initial?.fulfillmentHours ?? 48,
    location: initial?.location ?? "",
    images: initial?.images ?? [],
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]): void {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const payload = {
        ...values,
        sku: values.sku || undefined,
      };
      if (productId) {
        await apiPost(`/api/v1/souq/products/${productId}`, payload);
        router.push(`/pro/seller/products/${productId}`);
      } else {
        const result = (await apiPost<{ productId: string }>("/api/v1/souq/products", payload)) as {
          productId: string;
        };
        router.push(`/pro/seller/products/${result.productId}`);
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
      <ProField id="title" label="Product name" required>
        <input
          id="title"
          className={inputClass}
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          required
          minLength={3}
          maxLength={200}
        />
      </ProField>
      <ProField id="description" label="Description" required hint="What exactly does the buyer receive?">
        <textarea
          id="description"
          className={`${inputClass} min-h-28`}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          required
          minLength={10}
          maxLength={5000}
        />
      </ProField>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="category" label="Category" required>
          <select id="category" className={inputClass} value={values.category} onChange={(event) => set("category", event.target.value)}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </ProField>
        <ProField id="subcategory" label="Sub-category">
          <input id="subcategory" className={inputClass} value={values.subcategory} onChange={(event) => set("subcategory", event.target.value)} maxLength={60} />
        </ProField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="basePrice" label="List price (per unit)" required>
          <MoneyInput id="basePrice" valueMinor={values.basePriceMinor} onChangeMinor={(minor) => set("basePriceMinor", minor)} placeholder="e.g. 480.00" />
        </ProField>
        <ProField id="maxAvailableQuantity" label="Available quantity (inventory)" required>
          <input
            id="maxAvailableQuantity"
            type="number"
            min="1"
            className={inputClass}
            value={values.maxAvailableQuantity}
            onChange={(event) => set("maxAvailableQuantity", Math.max(0, Number(event.target.value) || 0))}
            required
          />
        </ProField>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ProField id="unit" label="Unit">
          <input id="unit" className={inputClass} value={values.unit} onChange={(event) => set("unit", event.target.value)} maxLength={30} />
        </ProField>
        <ProField id="sku" label="SKU (optional)">
          <input id="sku" className={inputClass} value={values.sku} onChange={(event) => set("sku", event.target.value)} maxLength={60} />
        </ProField>
        <ProField id="fulfillmentHours" label="Fulfillment time (hours)">
          <input
            id="fulfillmentHours"
            type="number"
            min="1"
            className={inputClass}
            value={values.fulfillmentHours}
            onChange={(event) => set("fulfillmentHours", Math.max(1, Number(event.target.value) || 48))}
          />
        </ProField>
      </div>
      <ProField id="deliveryMethod" label="Fulfillment method" required>
        <select
          id="deliveryMethod"
          className={inputClass}
          value={values.deliveryMethod}
          onChange={(event) => set("deliveryMethod", event.target.value as ProductFormValues["deliveryMethod"])}
        >
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
          <option value="both">Delivery and pickup</option>
        </select>
      </ProField>
      {values.deliveryMethod !== "pickup" ? (
        <ProField id="deliveryFee" label="Delivery fee">
          <MoneyInput id="deliveryFee" valueMinor={values.deliveryFeeMinor} onChangeMinor={(minor) => set("deliveryFeeMinor", minor)} />
        </ProField>
      ) : null}
      {values.deliveryMethod !== "delivery" ? (
        <ProField id="location" label="Pickup location" hint="Shown to buyers and required for pickup listings.">
          <input id="location" className={inputClass} value={values.location} onChange={(event) => set("location", event.target.value)} maxLength={200} />
        </ProField>
      ) : null}
      <ImageUploader images={values.images} onChange={(images) => set("images", images)} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green px-5 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-70"
        >
          {pending ? "Saving…" : productId ? "Save changes" : "Create draft"}
        </button>
        <span className="text-[12px] text-muted">Products are saved as drafts — you publish when everything is ready.</span>
      </div>
    </form>
  );
}
