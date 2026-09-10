import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// An organization that provides volunteer opportunities. Medina Academy is the
// accreditor; other orgs (e.g. Essentials First) run programs whose hours Medina
// accredits. Grade-band toggles control which student levels an org serves.
export const organizationsTable = pgTable("organizations", {
  organizationId: uuid("organization_id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 150 }).unique().notNull(),
  description: text("description"),
  allowsElementary: boolean("allows_elementary").notNull().default(true),
  allowsMiddle: boolean("allows_middle").notNull().default(true),
  allowsHigh: boolean("allows_high").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({
  organizationId: true,
  createdAt: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
