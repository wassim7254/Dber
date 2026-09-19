"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";
import { Card } from "@/components/dber/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Slot {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

function minutesToLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function labelToMinutes(label: string): number {
  const [hours, mins] = label.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return 0;
  return hours * 60 + mins;
}

/** Weekly availability editor — saved atomically via setAvailability. */
export function AvailabilityEditor({ initialSlots }: { initialSlots: Slot[] }) {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function addSlot(weekday: number): void {
    setSlots((previous) => [
      ...previous,
      { weekday, startMinute: 9 * 60, endMinute: 17 * 60 },
    ]);
  }

  function updateSlot(index: number, patch: Partial<Slot>): void {
    setSlots((previous) => previous.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  async function save(): Promise<void> {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const cleaned = slots
        .filter((slot) => slot.endMinute > slot.startMinute)
        .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
      await apiPost("/api/v1/khidma/availability", { slots: cleaned });
      setSuccess("Availability saved. Customers can now book inside these windows.");
      setSlots(cleaned);
      router.refresh();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-5">
        {DAYS.map((day, weekday) => {
          const daySlots = slots
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.weekday === weekday);
          return (
            <div key={day} className="flex flex-wrap items-start gap-3">
              <p className="w-24 pt-2 text-[13px] font-semibold">{day}</p>
              <div className="flex-1 space-y-2">
                {daySlots.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => addSlot(weekday)}
                    className="text-[12.5px] font-medium text-clay-dark hover:underline"
                  >
                    + Add working hours
                  </button>
                ) : (
                  daySlots.map(({ slot, index }) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={minutesToLabel(slot.startMinute)}
                        onChange={(event) => updateSlot(index, { startMinute: labelToMinutes(event.target.value) })}
                        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
                        aria-label={`${day} start time`}
                      />
                      <span className="text-[12px] text-muted">to</span>
                      <input
                        type="time"
                        value={minutesToLabel(slot.endMinute)}
                        onChange={(event) => updateSlot(index, { endMinute: labelToMinutes(event.target.value) })}
                        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
                        aria-label={`${day} end time`}
                      />
                      <button
                        type="button"
                        onClick={() => setSlots((previous) => previous.filter((_, i) => i !== index))}
                        className="px-2 text-[12px] text-danger hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="mt-4 rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
          {success}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={pending}
        className="mt-5 rounded-lg bg-clay px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-clay-dark disabled:opacity-70"
      >
        {pending ? "Saving…" : "Save availability"}
      </button>
    </Card>
  );
}
