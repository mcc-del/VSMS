import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { eventsTable } from "./events";

export const submissionStatusEnum = pgEnum("submission_status", ["pending", "approved", "rejected"]);

export const volunteerSubmissionsTable = pgTable("volunteer_submissions", {
  submissionId: uuid("submission_id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.userId, { onDelete: "cascade" }),
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.eventId, { onDelete: "cascade" }),
  status: submissionStatusEnum("status").notNull().default("pending"),
  supervisorComments: text("supervisor_comments"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertSubmissionSchema = createInsertSchema(volunteerSubmissionsTable).omit({
  submissionId: true,
  submittedAt: true,
  reviewedAt: true,
});
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof volunteerSubmissionsTable.$inferSelect;
