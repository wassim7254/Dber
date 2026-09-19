"use client";

import { useRef, useState } from "react";

import { describeApiError } from "@/lib/client/api";

/**
 * Real image upload with preview, ordering (primary first) and deletion.
 * Files go to /api/v1/media and the returned URLs are stored in the listing.
 */
export function ImageUploader({
  images,
  onChange,
  max = 6,
  label = "Photos",
}: {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("altText", file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 100));
      const response = await fetch("/api/v1/media", { method: "POST", body });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { url: string }; error?: { message: string } }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error?.message ?? "The upload failed");
      }
      onChange([...images, payload.data.url].slice(0, max));
    } catch (caught) {
      setError(caught instanceof Error ? describeApiError(caught) : "The upload failed");
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, direction: -1 | 1): void {
    const next = [...images];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium">
        {label} <span className="font-normal text-muted">(first photo is the cover — up to {max})</span>
      </legend>
      {images.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {images.map((url, index) => (
            <li key={url} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Photo ${index + 1}`}
                className="size-20 rounded-lg border border-line object-cover"
              />
              {index === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-green-dark px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-bg">
                  Cover
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-surface/90 py-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button type="button" aria-label="Move earlier" onClick={() => move(index, -1)} className="px-1 text-[11px] text-muted hover:text-ink">
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                  className="px-1 text-[11px] text-danger"
                >
                  ✕
                </button>
                <button type="button" aria-label="Move later" onClick={() => move(index, 1)} className="px-1 text-[11px] text-muted hover:text-ink">
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || images.length >= max}
        className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold transition-colors hover:border-green disabled:opacity-60"
      >
        {uploading ? "Uploading…" : images.length >= max ? "Photo limit reached" : "Add photo"}
      </button>
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
