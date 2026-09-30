import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "DBER — One platform. Three marketplaces.",
    template: "%s · DBER",
  },
  description:
    "DBER is a unified transaction platform: SOUQ group buying, KHIDMA professional services, and KRAYA rentals.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F9F8F3" },
    { media: "(prefers-color-scheme: dark)", color: "#121411" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the persisted (or system) theme before first paint so the page
 * never flashes the wrong mode. Kept inline and tiny on purpose.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem("dber-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d){document.documentElement.classList.add("dark");}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
