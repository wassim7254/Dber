import type { JSX } from "react";

export type IconName =
  | "home"
  | "search"
  | "activity"
  | "saved"
  | "account"
  | "bell"
  | "souq"
  | "khidma"
  | "kraya"
  | "check"
  | "alert"
  | "arrow"
  | "clock"
  | "shield"
  | "plus"
  | "close"
  | "spark";

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  search: "M10.5 3a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15ZM21 21l-5.2-5.2",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  saved: "M6 3h12v18l-6-4.5L6 21z",
  account: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0",
  bell: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4.5 10a2 2 0 0 0 3 0",
  souq: "M5 8h14l-1.5 12h-11L5 8Zm4 0a3 3 0 0 1 6 0",
  khidma: "M14.5 6.5a4 4 0 0 0-5.4 5.2L4 17l3 3 5.3-5.1a4 4 0 0 0 5.2-5.4L14.8 12l-2.8-2.8 2.5-2.7Z",
  kraya: "M15 3v4m4-4v4M5 11h14v3a7 7 0 0 1-14 0v-3Zm7 10v3",
  check: "M4 12.5 9.5 18 20 6.5",
  alert: "M12 3 2 20h20L12 3Zm0 6v5m0 3v.5",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  clock: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 3.5V12l3 2",
  shield: "M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Zm-2.5 8.5L11.5 14 15 9.5",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  spark: "M12 3l1.8 5.7L19.5 10l-5.7 1.8L12 17.5l-1.8-5.7L4.5 10l5.7-1.3L12 3Z",
};

export function Icon({
  name,
  size = 20,
  filled = false,
  className,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
