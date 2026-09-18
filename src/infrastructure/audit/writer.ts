import { adminActions, auditLog, providerActions, type AuditEntityType } from "@/db/schema";
import type { Tx } from "@/db/tx";
import { currentRequestId } from "@/infrastructure/request-context/request-context";
import type { JsonObject } from "@/types/json";

export interface AuditInput {
  /** Null actor = system (jobs, reconciliation). */
  actorId: string | null;
  actorRole: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  before?: JsonObject | null;
  after?: JsonObject | null;
  metadata?: JsonObject;
}

/**
 * Appends an audit record inside the caller's transaction (§12). An audit
 * row is part of the business fact: if the transaction rolls back, the
 * unauditable mutation never happened.
 */
export async function recordAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? {},
    requestId: currentRequestId(),
  });
}

export interface AdminActionInput {
  adminId: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  reason: string;
  metadata?: JsonObject;
}

export async function recordAdminAction(tx: Tx, input: AdminActionInput): Promise<void> {
  await tx.insert(adminActions).values({
    adminId: input.adminId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    metadata: input.metadata ?? {},
    requestId: currentRequestId(),
  });
}

export interface ProviderActionInput {
  providerId: string;
  providerRole: "seller" | "professional";
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  metadata?: JsonObject;
}

export async function recordProviderAction(tx: Tx, input: ProviderActionInput): Promise<void> {
  await tx.insert(providerActions).values({
    providerId: input.providerId,
    providerRole: input.providerRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
    requestId: currentRequestId(),
  });
}
