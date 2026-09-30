"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/dber/icon";

const STORAGE_KEY = "dber-theme";

/**
 * Dark/light theme toggle (§5). The pre-paint script in the root layout has
 * already applied the class before hydration, so the first render reads the
 * DOM instead of guessing — no flash, no hydration mismatch.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle(): void {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private-mode storage failures leave the theme session-only; still applied.
    }
    setIsDark(next);
  }

  const resolved = isDark ?? false;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={resolved ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={resolved}
      className={`flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-soft ${className}`}
    >
      {/* Show the mode you would switch TO — moon in light, sun in dark. */}
      <span className={isDark === null ? "opacity-0" : "opacity-100"}>
        <Icon name={resolved ? "sun" : "moon"} size={19} />
      </span>
    </button>
  );
}
