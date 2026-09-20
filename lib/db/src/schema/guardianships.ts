import { pgTable, uuid, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Explicit link between a guardian (parent) account and a child participant.
// Supports: one parent with many children, many guardians for one child
// (co-guardians), and the parent "child switcher". A child account may have
// no login of its own (parent-led elementary) — see users.passwordHash null.
export const guardianshipsTable = pgTable(
  "guardianships",
  {
    guardianshipId: uuid("guardianship_id").primaryKey().defaultRandom(),
    guardianUserId: uuid("guardian_user_id")
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    childUserId: uuid("child_user_id")
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    // The primary guardian is the one who created/manages the child account.
    // Co-guardians (invited) get the same access but isPrimary = false.
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("guardianships_guardian_child_uniq").on(t.guardianUserId, t.childUserId)],
);

export const insertGuardianshipSchema = createInsertSchema(guardianshipsTable).omit({
  guardianshipId: true,
  createdAt: true,
});
export type InsertGuardianship = z.infer<typeof insertGuardianshipSchema>;
export type Guardianship = typeof guardianshipsTable.$inferSelect;
