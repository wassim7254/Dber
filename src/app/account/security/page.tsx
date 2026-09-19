import { redirect } from "next/navigation";

import { AccountSecurityClient } from "@/components/auth/account-security-client";
import { getCurrentUser } from "@/lib/auth/identity";
import { Eyebrow } from "@/components/dber/ui";
import { listActiveSessions, readSessionCookie, resolveSessionIdentity } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/account/security");
  const current = await resolveSessionIdentity(await readSessionCookie());
  const activeSessions = user.hasPassword ? await listActiveSessions(user.userId) : [];
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:px-10">
      <Eyebrow>Account · Security</Eyebrow>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.01em]">Security</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
        Manage your password, active sessions and email verification.
      </p>
      <AccountSecurityClient
        hasPassword={user.hasPassword}
        email={user.email}
        emailVerified={user.emailVerified}
        sessions={activeSessions.map((session) => ({
          id: session.id,
          userAgent: session.userAgent,
          lastUsedAt: session.lastUsedAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
          isCurrent: current?.sessionId === session.id,
        }))}
      />
    </div>
  );
}
