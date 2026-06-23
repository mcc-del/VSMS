import { pgTable, uuid, varchar, text, date, decimal, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const eventsTable = pgTable("events", {
  eventId: uuid("event_id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 150 }).notNull(),
  description: text("description").notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  hoursValue: decimal("hours_value", { precision: 5, scale: 2 }).notNull(),
  maxCapacity: integer("max_capacity").notNull().default(50),
  supervisorId: uuid("supervisor_id")
    .notNull()
    .references(() => usersTable.userId, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({
  eventId: true,
  createdAt: true,
});
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
