import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// An append-only record of significant admin actions, for Super Admin review.
// Actor identity is snapshotted (name/role) so the entry stays readable even
// if the acting user is later renamed or deleted.
export const auditLogsTable = pgTable("audit_logs", {
  auditLogId: uuid("audit_log_id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => usersTable.userId, { onDelete: "set null" }),
  actorName: varchar("actor_name", { length: 120 }).notNull(),
  actorRole: varchar("actor_role", { length: 30 }).notNull(),
  action: varchar("action", { length: 60 }).notNull(),
  targetType: varchar("target_type", { length: 30 }),
  targetId: varchar("target_id", { length: 64 }),
  targetLabel: varchar("target_label", { length: 200 }),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({
  auditLogId: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
