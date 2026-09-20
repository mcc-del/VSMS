import { pgTable, uuid, timestamp, pgEnum, unique, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { eventsTable } from "./events";

export const registrationStatusEnum = pgEnum("registration_status", [
  "registered",
  "attended",
  "no_show",
]);

export const eventRegistrationsTable = pgTable(
  "event_registrations",
  {
    registrationId: uuid("registration_id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsTable.eventId, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    status: registrationStatusEnum("status").notNull().default("registered"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    reminderSent: boolean("reminder_sent").notNull().default(false),
  },
  (t) => [unique("event_registrations_event_user_unique").on(t.eventId, t.userId)],
);

export type EventRegistration = typeof eventRegistrationsTable.$inferSelect;
