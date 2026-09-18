import { and, desc, eq } from "drizzle-orm";

import { auditLog, users } from "@/db/schema";
import type { DbExecutor } from "@/db/tx";
import type { AuditEntityType } from "@/db/schema";
import { statusPresentation } from "@/lib/state-ui";
import type { TimelineItem } from "@/components/dber/ui";

/**
 * Reconstructs the lifecycle timeline of an entity from the append-only
 * audit log (§13/§55): what happened, who did it, when, and from/to states.
 */
export async function getEntityTimeline(
  db: DbExecutor,
  entityType: AuditEntityType,
  entityId: string,
  limit = 30,
): Promise<TimelineItem[]> {
  const rows = await db
    .select({
      action: auditLog.action,
      createdAt: auditLog.createdAt,
      before: auditLog.before,
      after: auditLog.after,
      actorRole: auditLog.actorRole,
      actorName: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return rows
    .map((row) => {
      const after = row.after as { state?: string } | null;
      const before = row.before as { state?: string } | null;
      const stateNote =
        before?.state && after?.state
          ? `${statusPresentation(before.state).label} → ${statusPresentation(after.state).label}`
          : after?.state
            ? statusPresentation(after.state).label
            : undefined;
      return {
        label: row.action
          .split(".")
          .slice(1)
          .join(" ")
          .replace(/_/g, " "),
        at: row.createdAt.toISOString(),
        actor: row.actorName ?? (row.actorRole === "system" ? "System" : row.actorRole),
        note: stateNote,
      };
    });
}
