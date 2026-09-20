import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Each row is one collected bin logged toward the Million Cans Recycling
// Competition. A bin holds ~250 cans by default; the total is the sum of `cans`.
// `grade` is a free label (e.g. "Pre-School", "Grade 4") so pre-school through
// grade 12 can all compete, even though volunteering starts at grade 2.
export const recyclingBinsTable = pgTable("recycling_bins", {
  binId: uuid("bin_id").primaryKey().defaultRandom(),
  grade: varchar("grade", { length: 40 }).notNull(),
  cans: integer("cans").notNull().default(250),
  loggedByUserId: uuid("logged_by_user_id").references(() => usersTable.userId, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecyclingBin = typeof recyclingBinsTable.$inferSelect;
