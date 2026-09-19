import { db, auditLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ROLE_LABELS: Record<string, string> = {
  participant: "Participant",
  supervisor: "Supervisor",
  org_admin: "Admin",
  admin: "Super Admin",
  parent: "Parent",
};

export interface AuditEntry {
  actorUserId: string;
  action: string;
  summary: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
}

// Fire-and-forget: records an admin action. Never throws — auditing must not
// break the operation it describes.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const [actor] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.userId, entry.actorUserId))
      .limit(1);
    await db.insert(auditLogsTable).values({
      actorUserId: entry.actorUserId,
      actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : "Unknown",
      actorRole: actor ? (ROLE_LABELS[actor.role] ?? actor.role) : "Unknown",
      action: entry.action,
      summary: entry.summary,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "Failed to write audit log");
  }
}
