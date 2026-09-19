import { isDevelopment } from "@/lib/config/env";
import { Card, Eyebrow } from "@/components/dber/ui";
import { Icon } from "@/components/dber/icon";
import { UserSwitcher } from "@/components/layout/user-switcher";

export const metadata = { title: "Welcome" };

const VERTICALS = [
  {
    name: "SOUQ",
    title: "Join others to unlock a better deal",
    body: "Payments are authorized on join, captured only when the group reaches its target, and released automatically if it doesn't.",
  },
  {
    name: "KHIDMA",
    title: "Book professionals with bound quotes",
    body: "The accepted quote becomes an immutable booking snapshot. The schedule is overlap-proof at the database level.",
  },
  {
    name: "KRAYA",
    title: "Rentals with protected deposits",
    body: "Deposit is held — never charged — and released after return. Confirmed rentals are contract-snapshotted and can't overlap.",
  },
];

export default function WelcomePage() {
  return (
    <div className="px-4 py-10 md:px-10 md:py-16">
      <div className="mx-auto max-w-[820px] space-y-8">
        <header className="space-y-3 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-green-dark font-mono text-[20px] font-semibold text-bg">
            D
          </span>
          <h1 className="text-[30px] font-semibold tracking-[-0.02em] md:text-[38px]">
            One platform. Three marketplaces.
          </h1>
          <p className="mx-auto max-w-[52ch] text-[14.5px] leading-relaxed text-muted">
            DBER is a transaction platform — SOUQ group buying, KHIDMA services, and KRAYA rentals
            share one trustworthy engine: every payment, state change, and refund is traceable.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {VERTICALS.map((vertical) => (
            <Card key={vertical.name} className="p-5">
              <p className="font-mono text-[12px] font-semibold tracking-[0.12em] text-green-dark">
                {vertical.name}
              </p>
              <p className="mt-2 text-[14.5px] font-semibold leading-snug">{vertical.title}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{vertical.body}</p>
            </Card>
          ))}
        </div>

        <Card className="mx-auto max-w-[520px] p-6 text-center">
          <Eyebrow>Get started</Eyebrow>
          <p className="mt-2 text-[14.5px] font-semibold">Sign in to explore</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-muted">
            {isDevelopment
              ? "Development build: sign in with the seeded accounts (password “dber-dev-1234”), or pick one below."
              : "Sign in with your email and password."}
          </p>
          <div className="mx-auto mt-4 flex max-w-[320px] flex-col gap-2">
            <a
              href="/login"
              className="flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-2.5 text-[13px] font-semibold text-bg transition-colors hover:bg-green-dark"
            >
              Sign in
              <Icon name="arrow" size={15} />
            </a>
            <a
              href="/register"
              className="flex items-center justify-center rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold transition-colors hover:border-green"
            >
              Create account
            </a>
          </div>
          {isDevelopment ? (
            <div className="mx-auto mt-4 max-w-[320px] text-left">
              <UserSwitcher currentUserId="" currentRole="dev sign in" compact={false} />
            </div>
          ) : null}
          <p className="mx-auto mt-4 flex max-w-[52ch] items-center justify-center gap-1.5 text-[11.5px] text-muted">
            <Icon name="shield" size={13} />
            Dev identity switching is disabled outside development.
          </p>
        </Card>
      </div>
    </div>
  );
}
