import Link from "next/link";

import { Card, Eyebrow } from "@/components/dber/ui";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[680px] space-y-5">
        <header className="space-y-1.5">
          <Eyebrow>Support center</Eyebrow>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">We&apos;re here to help</h1>
        </header>
        <Card className="p-5">
          <p className="text-[14px] font-semibold">Transaction problems</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Open the transaction from Activity and use &ldquo;Open a dispute&rdquo; or &ldquo;Request
            cancellation&rdquo;. Every request is reviewed by operations with a full audit trail, and
            outcomes are recorded permanently.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[14px] font-semibold">Payments & refunds</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Payments are processed server-side and reconciled against the provider. If a refund is
            approved you&apos;ll see it move through pending → processing → completed in Activity.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-[14px] font-semibold">Contact</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            support@dber.example — include the transaction id from Activity for the fastest
            resolution.
          </p>
        </Card>
        <Link href="/activity" className="inline-block rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg hover:bg-green-dark">
          Go to Activity
        </Link>
      </div>
    </div>
  );
}
