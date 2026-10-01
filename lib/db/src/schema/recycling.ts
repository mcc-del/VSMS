import { pgTable, uuid, varchar, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Each row is one contribution logged toward the Million Cans Recycling
// Competition; the total is the sum of `cans`. Two kinds of rows:
//   - a classroom bin logged by staff (~250 cans, `loggedByUserId` set), or
//   - a public dumpster drop-off from the QR-code form: the bag is weighed,
//     `weightLbs` is stored and `cans` is derived at 35 cans per pound.
// `grade` is a free label (e.g. "Pre-School", "Grade 4") so pre-school through
// grade 12 can all compete, even though volunteering starts at grade 2.
export const recyclingBinsTable = pgTable("recycling_bins", {
  binId: uuid("bin_id").primaryKey().defaultRandom(),
  grade: varchar("grade", { length: 40 }).notNull(),
  cans: integer("cans").notNull().default(250),
  // Drop-off only: optional name typed by whoever brought the bag.
  contributorName: varchar("contributor_name", { length: 80 }),
  // Drop-off only: scale reading in pounds.
  weightLbs: numeric("weight_lbs", { precision: 6, scale: 2 }),
  loggedByUserId: uuid("logged_by_user_id").references(() => usersTable.userId, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RecyclingBin = typeof recyclingBinsTable.$inferSelect;
