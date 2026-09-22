import { pgTable, uuid, varchar, text, date, time, decimal, integer, timestamp, boolean } from "drizzle-orm/pg-core";
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
  // A short optional label for a specific shift/slot of a multi-slot event,
  // e.g. "Setup", "Checkout", "Cleanup crew".
  slotLabel: varchar("slot_label", { length: 80 }),
  // Location: `location` is the venue name; the rest is the structured address.
  location: varchar("location", { length: 255 }).notNull().default(""),
  street: varchar("street", { length: 200 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 40 }),
  zip: varchar("zip", { length: 20 }),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  startTime: time("start_time").notNull().default("09:00:00"),
  endTime: time("end_time").notNull().default("17:00:00"),
  hoursValue: decimal("hours_value", { precision: 5, scale: 2 }).notNull(),
  maxCapacity: integer("max_capacity").notNull().default(50),
  // Optional grade eligibility floor/ceiling (e.g. min 4 for a checkout shift).
  minGrade: integer("min_grade"),
  maxGrade: integer("max_grade"),
  // When true, students from ANY organization can see and sign up for this
  // event (the host org still owns/manages it and gets the reporting credit).
  // When false, only the host org's students see it. Defaults to open.
  openToAll: boolean("open_to_all").notNull().default(true),
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
