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
  // Optional join code: when set, a student choosing this org at sign-up must
  // enter the matching code (keeps org-gated visibility honest — R3 safety).
  joinCode: varchar("join_code", { length: 20 }),
  allowsElementary: boolean("allows_elementary").notNull().default(true),
  allowsMiddle: boolean("allows_middle").notNull().default(true),
  allowsHigh: boolean("allows_high").notNull().default(true),
  // When false, this org's participants are excluded from the public leaderboard
  // by default (they still earn accredited hours and see their own row). For
  // partner orgs whose students just want verified hours, not to compete.
  competesOnLeaderboard: boolean("competes_on_leaderboard").notNull().default(true),
  // When false, this org is hidden from the enrollment/affiliation dropdown
  // (students & parents won't see it as a choice at sign-up). It can still be
  // used for events and existing members. Default: shown.
  showInEnrollment: boolean("show_in_enrollment").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizationsTable).omit({
  organizationId: true,
  createdAt: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
