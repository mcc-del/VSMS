import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

// Which organizations an Organization Admin manages. A Super Admin (role
// "admin") manages everything and needs no rows here; an "org_admin" manages
// one or more organizations, one row each. Scopes event creation and hour
// approvals to those organizations.
export const orgAdminsTable = pgTable(
  "org_admins",
  {
    orgAdminId: uuid("org_admin_id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.organizationId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("org_admins_user_org_uniq").on(t.userId, t.organizationId)],
);

export const insertOrgAdminSchema = createInsertSchema(orgAdminsTable).omit({
  orgAdminId: true,
  createdAt: true,
});
export type InsertOrgAdmin = z.infer<typeof insertOrgAdminSchema>;
export type OrgAdmin = typeof orgAdminsTable.$inferSelect;
