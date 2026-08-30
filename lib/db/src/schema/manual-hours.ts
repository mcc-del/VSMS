import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Manual hour credits granted directly by an admin. These are auto-approved
// and count toward a participant's total approved hours and milestones.
export const manualHoursTable = pgTable("manual_hours", {
  manualHoursId: uuid("manual_hours_id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.userId, { onDelete: "cascade" }),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  description: text("description").notNull(),
  dateAwarded: text("date_awarded").notNull(), // ISO date string YYYY-MM-DD
  awardedByUserId: uuid("awarded_by_user_id").references(() => usersTable.userId, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertManualHoursSchema = createInsertSchema(manualHoursTable).omit({
  manualHoursId: true,
  createdAt: true,
});
export type InsertManualHours = z.infer<typeof insertManualHoursSchema>;
export type ManualHours = typeof manualHoursTable.$inferSelect;
