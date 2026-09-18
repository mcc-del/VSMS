import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Self-logged adult volunteer hours (supervisors, org admins, staff, parents).
// These are a PERSONAL tracker only: they are auto-recorded with no approval
// step and are NEVER part of the student competition, leaderboard, or medals.
export const adultHoursTable = pgTable("adult_hours", {
  adultHoursId: uuid("adult_hours_id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.userId, { onDelete: "cascade" }),
  activityName: text("activity_name").notNull(),
  organizationName: text("organization_name"),
  volunteerDate: text("volunteer_date").notNull(), // ISO date string YYYY-MM-DD
  hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdultHoursSchema = createInsertSchema(adultHoursTable).omit({
  adultHoursId: true,
  createdAt: true,
});
export type InsertAdultHours = z.infer<typeof insertAdultHoursSchema>;
export type AdultHours = typeof adultHoursTable.$inferSelect;
