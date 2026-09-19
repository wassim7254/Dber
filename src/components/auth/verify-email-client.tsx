"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { apiPost, describeApiError } from "@/lib/client/api";

type State =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "verified" }
  | { phase: "error"; message: string };

export function VerifyEmailClient() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ phase: token ? "working" : "idle" });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    apiPost("/api/v1/auth/verify-email", { token })
      .then(() => {
        setState({ phase: "verified" });
        router.refresh();
      })
      .catch((caught) => setState({ phase: "error", message: describeApiError(caught) }));
  }, [token, router]);

  if (!token) {
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        Open the verification link from your email, or resend it from{" "}
        <Link href="/account/security" className="font-semibold text-green-dark hover:underline">
          Security settings
        </Link>
        .
      </p>
    );
  }
  if (state.phase === "working") {
    return <p className="text-[13px] text-muted">Checking your link…</p>;
  }
  if (state.phase === "verified") {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-lg bg-success-soft px-3.5 py-2.5 text-[13px] text-success">
          Your email address is confirmed. Thank you.
        </p>
        <Link
          href="/"
          className="block rounded-lg bg-green px-4 py-2.5 text-center text-[13px] font-semibold text-bg hover:bg-green-dark"
        >
          Continue to DBER
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
        {state.phase === "error" ? state.message : "Something went wrong. Try the link again."}
      </p>
      <Link
        href="/account/security"
        className="block rounded-lg border border-line px-4 py-2.5 text-center text-[13px] font-semibold hover:border-green"
      >
        Resend verification email
      </Link>
    </div>
  );
}
