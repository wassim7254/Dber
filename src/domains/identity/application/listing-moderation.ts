import { eq } from "drizzle-orm";
import { z } from "zod";

import { krayaAssets, khidmaServices, souqProducts, listingModerations } from "@/db/schema";
import type { Tx } from "@/db/tx";
import { recordAdminAction, recordAudit } from "@/infrastructure/audit/writer";
import type { Identity } from "@/lib/auth/types";
import { requirePrivileged } from "@/lib/auth/rbac";
import { ConflictError, ResourceNotFoundError, ValidationError } from "@/lib/errors";

export const moderateListingSchema = z.object({
  entityType: z.enum(["souq_product", "khidma_service", "kraya_asset"]),
  entityId: z.string().uuid(),
  action: z.enum(["approve", "reject", "disable", "restore"]),
  reason: z.string().trim().min(3).max(1000),
});

type ModerationTarget = z.infer<typeof moderateListingSchema>;

type ListingStatus = "draft" | "active" | "paused" | "archived";

const ALLOWED: Record<ModerationTarget["action"], { from: ListingStatus[]; to: ListingStatus }> = {
  approve: { from: ["draft", "paused"], to: "active" },
  reject: { from: ["draft", "active", "paused"], to: "archived" },
  disable: { from: ["active"], to: "paused" },
  restore: { from: ["archived"], to: "draft" },
};

async function loadListingStatus(tx: Tx, target: ModerationTarget): Promise<ListingStatus> {
  if (target.entityType === "souq_product") {
    const [row] = await tx.select({ status: souqProducts.status }).from(souqProducts).where(eq(souqProducts.id, target.entityId)).limit(1);
    if (!row) throw new ResourceNotFoundError("Product", target.entityId);
    return row.status;
  }
  if (target.entityType === "khidma_service") {
    const [row] = await tx.select({ status: khidmaServices.status }).from(khidmaServices).where(eq(khidmaServices.id, target.entityId)).limit(1);
    if (!row) throw new ResourceNotFoundError("Service", target.entityId);
    return row.status;
  }
  const [row] = await tx.select({ status: krayaAssets.status }).from(krayaAssets).where(eq(krayaAssets.id, target.entityId)).limit(1);
  if (!row) throw new ResourceNotFoundError("Asset", target.entityId);
  return row.status;
}

/**
 * Listing moderation (§31/§32): ops_admin/admin only, reason required, every
 * decision recorded in both the append-only moderation log and admin_actions.
 */
export async function moderateListing(
  tx: Tx,
  identity: Identity,
  target: ModerationTarget,
): Promise<{ status: string }> {
  requirePrivileged(identity);
  const current = await loadListingStatus(tx, target);
  const rule = ALLOWED[target.action];
  if (!rule.from.includes(current)) {
    throw new ConflictError(`A ${current} listing cannot be ${target.action}d`);
  }
  const update = tx
    .update(
      target.entityType === "souq_product"
        ? souqProducts
        : target.entityType === "khidma_service"
          ? khidmaServices
          : krayaAssets,
    )
    .set({ status: rule.to, updatedAt: new Date() })
    .where(eq(
      target.entityType === "souq_product" ? souqProducts.id : target.entityType === "khidma_service" ? khidmaServices.id : krayaAssets.id,
      target.entityId,
    ))
    .returning({ id: target.entityType === "souq_product" ? souqProducts.id : target.entityType === "khidma_service" ? khidmaServices.id : krayaAssets.id });
  const updated = (await update) as { id: string }[];
  if (updated.length === 0) {
    throw new ValidationError("The listing state changed concurrently — retry");
  }
  await tx.insert(listingModerations).values({
    entityType: target.entityType,
    entityId: target.entityId,
    action: target.action,
    reason: target.reason,
    moderatedBy: identity.userId,
    metadata: { from: current, to: rule.to },
  });
  await recordAdminAction(tx, {
    adminId: identity.userId,
    action: `listing.${target.action}`,
    entityType: target.entityType,
    entityId: target.entityId,
    reason: target.reason,
    metadata: { from: current, to: rule.to },
  });
  await recordAudit(tx, {
    actorId: identity.userId,
    actorRole: identity.role,
    action: `listing.${target.action}`,
    entityType: target.entityType,
    entityId: target.entityId,
    before: { status: current },
    after: { status: rule.to },
    metadata: { reason: target.reason },
  });
  return { status: rule.to };
}
