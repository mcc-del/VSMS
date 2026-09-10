import { pgTable, uuid, varchar, text, date, time, decimal, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const eventsTable = pgTable("events", {
  eventId: uuid("event_id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizationsTable.organizationId, {
    onDelete: "set null",
  }),
  title: varchar("title", { length: 150 }).notNull(),
  description: text("description").notNull(),
  location: varchar("location", { length: 255 }).notNull().default(""),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull().default("09:00:00"),
  endTime: time("end_time").notNull().default("17:00:00"),
  hoursValue: decimal("hours_value", { precision: 5, scale: 2 }).notNull(),
  maxCapacity: integer("max_capacity").notNull().default(50),
  imageUrl: varchar("image_url", { length: 500 }),
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
