import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { submissionStatusEnum } from "./submissions";

export const externalSubmissionsTable = pgTable("external_submissions", {
  externalSubmissionId: uuid("external_submission_id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.userId, { onDelete: "cascade" }),
  activityName: text("activity_name").notNull(),
  organizationName: text("organization_name").notNull(),
  volunteerDate: text("volunteer_date").notNull(), // ISO date string YYYY-MM-DD
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }).notNull(),
  extSupervisorName: text("ext_supervisor_name").notNull(),
  extSupervisorEmail: text("ext_supervisor_email").notNull(),
  description: text("description"),
  status: submissionStatusEnum("status").notNull().default("pending"),
  supervisorComments: text("supervisor_comments"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertExternalSubmissionSchema = createInsertSchema(externalSubmissionsTable).omit({
  externalSubmissionId: true,
  submittedAt: true,
  reviewedAt: true,
  status: true,
  supervisorComments: true,
});
export type InsertExternalSubmission = z.infer<typeof insertExternalSubmissionSchema>;
export type ExternalSubmission = typeof externalSubmissionsTable.$inferSelect;
