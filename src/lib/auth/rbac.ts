import { ForbiddenError } from "@/lib/errors";
import type { Identity, PrivilegedRole, Role } from "@/lib/auth/types";

export function requireRole(identity: Identity, allowed: readonly Role[]): void {
  if (!allowed.includes(identity.role)) {
    throw new ForbiddenError(`Role "${identity.role}" cannot perform this action`);
  }
}

/** Ownership check: the identity must own the target resource. */
export function requireSelf(identity: Identity, ownerId: string, resource: string): void {
  if (identity.role !== "admin" && identity.userId !== ownerId) {
    throw new ForbiddenError(`You do not own this ${resource}`);
  }
}

export function isPrivileged(role: Role): role is PrivilegedRole {
  return role === "ops_admin" || role === "admin";
}

export function requirePrivileged(identity: Identity): void {
  if (!isPrivileged(identity.role)) {
    throw new ForbiddenError("Privileged role required");
  }
}
