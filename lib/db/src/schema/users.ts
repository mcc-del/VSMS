import { pgTable, uuid, varchar, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

export const userRoleEnum = pgEnum("user_role", [
  "participant",
  "supervisor",
  "admin",
  "parent",
  "org_admin",
]);

export const usersTable = pgTable("users", {
  userId: uuid("user_id").primaryKey().defaultRandom(),
  // Nullable: a parent-managed child (elementary) has no login and no email.
  email: varchar("email", { length: 255 }).unique(),
  // Nullable: a managed child account cannot sign in, so it has no password.
  passwordHash: text("password_hash"),
  firstName: varchar("first_name", { length: 50 }).notNull(),
  lastName: varchar("last_name", { length: 50 }).notNull(),
  role: userRoleEnum("role").notNull().default("participant"),
  // Contact phone — shown to participants for a supervisor/event contact.
  phone: varchar("phone", { length: 30 }),
  // A managed child account (parent-led elementary): no login of its own,
  // fully managed by a linked guardian via the guardianships table.
  isManaged: boolean("is_managed").notNull().default(false),
  // For students: their parent's email, used to link a parent account.
  parentEmail: varchar("parent_email", { length: 255 }),
  // For students: school and grade, used for the leaderboard and school standings.
  school: varchar("school", { length: 120 }),
  grade: varchar("grade", { length: 20 }),
  // Affiliation (R3): which organization the student belongs to (Medina / EF /
  // Community). Drives which opportunities they can see. Null = Community/none.
  organizationId: uuid("organization_id").references(() => organizationsTable.organizationId, {
    onDelete: "set null",
  }),
  // For parents: when they last viewed their children's activity (for "new" badges).
  parentLastSeenAt: timestamp("parent_last_seen_at", { withTimezone: true }),
  // Leaderboard privacy (R6): an optional display alias, and a flag to appear
  // as "Anonymous" to everyone but themselves.
  displayAlias: varchar("display_alias", { length: 40 }),
  hideFromLeaderboard: boolean("hide_from_leaderboard").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  userId: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
