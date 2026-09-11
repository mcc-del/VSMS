import { pgTable, uuid, varchar, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const schoolStatusEnum = pgEnum("school_status", ["approved", "pending"]);

// A curated list of schools students choose from at enrollment. Keeping this as
// a controlled list (rather than free text) prevents spelling variants from
// splitting one real school. Users may request a school that isn't listed; it
// lands here as "pending" for an admin to approve or merge.
export const schoolsTable = pgTable("schools", {
  schoolId: uuid("school_id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).unique().notNull(),
  city: varchar("city", { length: 80 }),
  status: schoolStatusEnum("status").notNull().default("approved"),
  requestedByUserId: uuid("requested_by_user_id").references(() => usersTable.userId, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSchoolSchema = createInsertSchema(schoolsTable).omit({
  schoolId: true,
  createdAt: true,
});
export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schoolsTable.$inferSelect;
