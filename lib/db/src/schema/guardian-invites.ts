import { pgTable, uuid, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A pending invitation for a co-guardian who does not yet have an account.
// When someone registers as a parent with the invited email, the invite is
// consumed and they are linked (via guardianships) to all of the inviter's
// children. Once an email has an account, we link immediately instead of
// creating one of these.
export const guardianInvitesTable = pgTable(
  "guardian_invites",
  {
    inviteId: uuid("invite_id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    inviterUserId: uuid("inviter_user_id")
      .notNull()
      .references(() => usersTable.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("guardian_invites_email_inviter_uniq").on(t.email, t.inviterUserId)],
);

export const insertGuardianInviteSchema = createInsertSchema(guardianInvitesTable).omit({
  inviteId: true,
  createdAt: true,
});
export type InsertGuardianInvite = z.infer<typeof insertGuardianInviteSchema>;
export type GuardianInvite = typeof guardianInvitesTable.$inferSelect;
