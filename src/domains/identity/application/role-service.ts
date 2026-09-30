import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { userRoles, users } from "@/db/schema";
import type { DbExecutor, Tx } from "@/db/tx";
import { recordAudit } from "@/infrastructure/audit/writer";
import type { Identity, ParticipantRole } from "@/lib/auth/types";
import { ForbiddenError, ResourceNotFoundError } from "@/lib/errors";

export async function listUserRoles(executor: DbExecutor, userId: string): Promise<ParticipantRole[]> {
  const rows = await executor.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
  return rows
    .map((row) => row.role)
    .filter((r): r is ParticipantRole => (["buyer", "seller", "professional", "rental_owner"] as readonly string[]).includes(r));
}

/**
 * Switches the ACTIVE workspace context (users.role). The target must already
 * be an entitlement — nothing here grants new capabilities, it only changes
 * which one RBAC evaluates (§21/§40). Admin roles are not switchable. Runs in
 * the caller's transaction so it stays inside the idempotency reservation.
 */
export async function switchActiveRole(
  tx: Tx,
  identity: Identity,
  targetRole: ParticipantRole,
): Promise<{ role: ParticipantRole }> {
  const [entitlement] = await tx
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, identity.userId), eq(userRoles.role, targetRole)))
    .limit(1);
  if (!entitlement) {
    throw new ForbiddenError("Activate this role from your account first");
  }
  const [updated] = await tx
    .update(users)
    .set({ role: targetRole, updatedAt: new Date() })
    .where(eq(users.id, identity.userId))
    .returning({ id: users.id, role: users.role });
  if (!updated) throw new ResourceNotFoundError("User", identity.userId);
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "user.role.switched",
    entityType: "user",
    entityId: identity.userId,
    before: { role: identity.role },
    after: { role: updated.role },
  });
  return { role: targetRole };
}

/**
 * Grants a participant role to the current account (self-serve "Become a
 * seller / professional / rental owner", §14/§20). The role becomes active
 * when the account had no provider role yet, so the matching onboarding step
 * can proceed. Admin roles are never grantable here.
 */
export async function activateParticipantRole(
  tx: Tx,
  identity: Identity,
  targetRole: Exclude<ParticipantRole, "buyer">,
): Promise<{ role: ParticipantRole }> {
  const [existing] = await tx
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);
  if (!existing) throw new ResourceNotFoundError("User", identity.userId);
  await tx.insert(userRoles).values({ userId: identity.userId, role: targetRole }).onConflictDoNothing();
  if (existing.role === "buyer") {
    await tx.update(users).set({ role: targetRole, updatedAt: new Date() }).where(eq(users.id, identity.userId));
  }
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: "user.role.activated",
    entityType: "user",
    entityId: identity.userId,
    after: { role: targetRole },
  });
  return { role: targetRole };
}
