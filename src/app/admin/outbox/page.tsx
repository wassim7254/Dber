import { authenticate } from "@/lib/auth/identity";
import { redirect } from "next/navigation";
import { isPrivileged } from "@/lib/auth/rbac";
import { OutboxTableMini } from "@/components/dber/tables";

export const metadata = { title: "Outbox — Admin" };

export default async function AdminOutboxPage() {
  const identity = await authenticate();
  if (!identity) redirect("/welcome");
  if (!isPrivileged(identity.role)) redirect("/");

  return (
    <div className="px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto max-w-[1080px] space-y-6">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Outbox explorer</h1>
        <p className="text-[13px] text-muted">
          Events are written in the same transaction as the business fact and drained with
          SKIP LOCKED + exponential backoff. Failed events surface here for manual replay.
        </p>
        <OutboxTableMini limit={40} />
      </div>
    </div>
  );
}
