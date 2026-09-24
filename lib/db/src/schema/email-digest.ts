import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Queued notification lines for users who opted into a daily email digest.
// An external daily cron hits the flush endpoint, which groups these per
// recipient into one summary email and clears them.
export const emailDigestQueueTable = pgTable("email_digest_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.userId, { onDelete: "cascade" }),
  category: text("category").notNull(),
  line: text("line").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailDigestItem = typeof emailDigestQueueTable.$inferSelect;
