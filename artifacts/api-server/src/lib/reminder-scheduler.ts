import cron from "node-cron";
import { db, eventRegistrationsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendReminderEmail } from "./email";

async function sendTwoDayReminders(): Promise<void> {
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  const targetDate = twoDaysFromNow.toISOString().split("T")[0];

  logger.info({ targetDate }, "Running 2-day reminder job");

  try {
    const rows = await db
      .select({
        registrationId: eventRegistrationsTable.registrationId,
        userEmail: usersTable.email,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
        eventTitle: eventsTable.title,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        location: eventsTable.location,
      })
      .from(eventRegistrationsTable)
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
      .innerJoin(usersTable, eq(eventRegistrationsTable.userId, usersTable.userId))
      .where(
        and(
          eq(eventsTable.eventDate, targetDate),
          eq(eventRegistrationsTable.reminderSent, false),
          or(
            eq(eventRegistrationsTable.status, "registered"),
            eq(eventRegistrationsTable.status, "attended"),
          ),
        ),
      );

    logger.info({ count: rows.length, targetDate }, "Found registrations to remind");

    for (const row of rows) {
      const toName = [row.userFirstName, row.userLastName].filter(Boolean).join(" ") || row.userEmail;

      await sendReminderEmail(row.userEmail, toName, {
        title: row.eventTitle ?? "",
        eventDate: row.eventDate ?? "",
        startTime: row.startTime ?? "",
        endTime: row.endTime ?? "",
        location: row.location ?? "",
      });

      await db
        .update(eventRegistrationsTable)
        .set({ reminderSent: true })
        .where(eq(eventRegistrationsTable.registrationId, row.registrationId));
    }

    logger.info({ count: rows.length }, "2-day reminder job completed");
  } catch (err) {
    logger.error({ err }, "Error in 2-day reminder job");
  }
}

export function startReminderScheduler(): void {
  cron.schedule("0 8 * * *", () => {
    sendTwoDayReminders().catch((err) => {
      logger.error({ err }, "Unhandled error in reminder scheduler");
    });
  });

  logger.info("Reminder scheduler started (runs daily at 08:00)");
}
