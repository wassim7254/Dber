"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { inputClass, MoneyInput, ProField, ProFormError } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

/** Creates a group buy (circle) for a product — server re-validates pricing. */
export function CircleForm({ productId, listPriceMinor }: { productId: string; listPriceMinor: number }) {
  const router = useRouter();
  const [targetQuantity, setTargetQuantity] = useState(10);
  const [minimumParticipants, setMinimumParticipants] = useState(3);
  const [groupPriceMinor, setGroupPriceMinor] = useState(Math.round(listPriceMinor * 0.85));
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = (await apiPost<{ circleId: string }>("/api/v1/souq/circles", {
        productId,
        targetQuantity,
        minimumParticipants,
        groupPriceMinor,
        listPriceMinor,
        deadlineAt: new Date(Date.now() + deadlineDays * 24 * 3_600_000).toISOString(),
      })) as { circleId: string };
      router.push(`/souq/${result.circleId}`);
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <ProFormError message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="targetQuantity" label="Target quantity" required hint="Units needed to lock the group.">
          <input id="targetQuantity" type="number" min="1" className={inputClass} value={targetQuantity} onChange={(event) => setTargetQuantity(Math.max(1, Number(event.target.value) || 1))} required />
        </ProField>
        <ProField id="minimumParticipants" label="Minimum participants" required>
          <input id="minimumParticipants" type="number" min="1" className={inputClass} value={minimumParticipants} onChange={(event) => setMinimumParticipants(Math.max(1, Number(event.target.value) || 1))} required />
        </ProField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="groupPrice" label="Group price (per unit)" required hint={`List price is ${(listPriceMinor / 100).toFixed(2)} MAD.`}>
          <MoneyInput id="groupPrice" valueMinor={groupPriceMinor} onChangeMinor={setGroupPriceMinor} />
        </ProField>
        <ProField id="deadlineDays" label="Runs for (days)" required>
          <input id="deadlineDays" type="number" min="1" max="60" className={inputClass} value={deadlineDays} onChange={(event) => setDeadlineDays(Math.max(1, Number(event.target.value) || 7))} required />
        </ProField>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green px-5 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark disabled:opacity-70"
      >
        {pending ? "Launching…" : "Launch group buy"}
      </button>
    </form>
  );
}
