"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { inputClass, ProField, ProFormError, ProFormSuccess, ProSubmit } from "@/components/pro/form-kit";
import { apiPost, describeApiError } from "@/lib/client/api";

export interface ProfessionalProfileValues {
  headline: string;
  bio: string;
  specialties: string[];
  serviceArea: string;
  yearsExperience: number | null;
  languages: string[];
  serviceMode: string;
  payoutHandle: string;
}

/** Professional profile editor — "what I do / who I help" (§9). */
export function ProfessionalProfileForm({ initial }: { initial: Partial<ProfessionalProfileValues> }) {
  const router = useRouter();
  const [values, setValues] = useState<ProfessionalProfileValues>({
    headline: initial.headline ?? "",
    bio: initial.bio ?? "",
    specialties: initial.specialties ?? [],
    serviceArea: initial.serviceArea ?? "",
    yearsExperience: initial.yearsExperience ?? null,
    languages: initial.languages ?? [],
    serviceMode: initial.serviceMode ?? "both",
    payoutHandle: initial.payoutHandle ?? "",
  });
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [languageDraft, setLanguageDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setSuccess(null);
        apiPost("/api/v1/professional/profile", values)
          .then(() => {
            setSuccess("Profile saved.");
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
      <ProField id="headline" label="Professional title" hint='Shown under your name — e.g. "Licensed electrician · 12 years in Casablanca".'>
        <input id="headline" className={inputClass} value={values.headline} onChange={(event) => setValues((v) => ({ ...v, headline: event.target.value }))} maxLength={160} />
      </ProField>
      <ProField id="bio" label="About your work" hint="Who you help, how you work, what makes you different.">
        <textarea id="bio" className={`${inputClass} min-h-36`} value={values.bio} onChange={(event) => setValues((v) => ({ ...v, bio: event.target.value }))} maxLength={5000} />
      </ProField>
      <ProField id="specialties" label="Specialties" hint="Press Enter to add — e.g. “Home electrical repair”.">
        <div className="flex flex-wrap gap-1.5">
          {values.specialties.map((specialty, index) => (
            <span key={`${specialty}-${index}`} className="inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-3 py-1 text-[12.5px] font-medium text-clay-dark">
              {specialty}
              <button
                type="button"
                aria-label={`Remove ${specialty}`}
                onClick={() => setValues((v) => ({ ...v, specialties: v.specialties.filter((_, i) => i !== index) }))}
                className="text-clay-dark/70 hover:text-clay-dark"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <input
          id="specialties"
          className={`${inputClass} mt-2`}
          value={specialtyDraft}
          placeholder="Add a specialty and press Enter"
          onChange={(event) => setSpecialtyDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const value = specialtyDraft.trim();
              if (value.length > 0 && values.specialties.length < 12) {
                setValues((v) => ({ ...v, specialties: [...v.specialties, value] }));
                setSpecialtyDraft("");
              }
            }
          }}
        />
      </ProField>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="serviceArea" label="Service area" hint="City, neighborhoods, or “online worldwide”.">
          <input id="serviceArea" className={inputClass} value={values.serviceArea} onChange={(event) => setValues((v) => ({ ...v, serviceArea: event.target.value }))} maxLength={200} />
        </ProField>
        <ProField id="yearsExperience" label="Years of experience">
          <input
            id="yearsExperience"
            type="number"
            min="0"
            max="70"
            className={inputClass}
            value={values.yearsExperience ?? ""}
            onChange={(event) => setValues((v) => ({ ...v, yearsExperience: event.target.value === "" ? null : Math.max(0, Number(event.target.value) || 0) }))}
          />
        </ProField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ProField id="serviceMode" label="How you work">
          <select id="serviceMode" className={inputClass} value={values.serviceMode} onChange={(event) => setValues((v) => ({ ...v, serviceMode: event.target.value }))}>
            <option value="both">Online and in person</option>
            <option value="in_person">In person only</option>
            <option value="online">Online only</option>
          </select>
        </ProField>
        <ProField id="payoutHandle" label="Payout reference">
          <input id="payoutHandle" className={inputClass} value={values.payoutHandle} onChange={(event) => setValues((v) => ({ ...v, payoutHandle: event.target.value }))} maxLength={120} />
        </ProField>
      </div>
      <ProField id="languages" label="Languages" hint="Press Enter to add.">
        <div className="flex flex-wrap gap-1.5">
          {values.languages.map((language, index) => (
            <span key={`${language}-${index}`} className="inline-flex items-center gap-1.5 rounded-full bg-bg px-3 py-1 text-[12.5px] font-medium">
              {language}
              <button
                type="button"
                aria-label={`Remove ${language}`}
                onClick={() => setValues((v) => ({ ...v, languages: v.languages.filter((_, i) => i !== index) }))}
                className="text-muted hover:text-ink"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <input
          id="languages"
          className={`${inputClass} mt-2`}
          value={languageDraft}
          placeholder="Add a language and press Enter"
          onChange={(event) => setLanguageDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const value = languageDraft.trim();
              if (value.length > 0 && values.languages.length < 10) {
                setValues((v) => ({ ...v, languages: [...v.languages, value] }));
                setLanguageDraft("");
              }
            }
          }}
        />
      </ProField>
      <ProSubmit pending={pending}>Save profile</ProSubmit>
    </form>
  );
}
