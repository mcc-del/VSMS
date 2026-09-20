import cron from "node-cron";
import { db, eventRegistrationsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { logger } from "./logger";
import { sendReminderEmail } from "./email";

async function sendTwoDayReminders(): Promise<void> {
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
  const targetDate = twoDaysFromNow.toISOString().split("T")[0];

  logger.info({ targetDate }, "Running 2-day reminder job");

  try {
    const supervisor = alias(usersTable, "supervisor");
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
        slotLabel: eventsTable.slotLabel,
        description: eventsTable.description,
        street: eventsTable.street,
        city: eventsTable.city,
        state: eventsTable.state,
        zip: eventsTable.zip,
        hoursValue: eventsTable.hoursValue,
        supervisorFirstName: supervisor.firstName,
        supervisorLastName: supervisor.lastName,
        supervisorPhone: supervisor.phone,
      })
      .from(eventRegistrationsTable)
      .innerJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
      .innerJoin(usersTable, eq(eventRegistrationsTable.userId, usersTable.userId))
      .leftJoin(supervisor, eq(eventsTable.supervisorId, supervisor.userId))
      .where(
        and(
          eq(eventsTable.eventDate, targetDate),
          eq(eventRegistrationsTable.reminderSent, false),
          eq(usersTable.role, "participant"),
          or(
            eq(eventRegistrationsTable.status, "registered"),
            eq(eventRegistrationsTable.status, "attended"),
          ),
        ),
      );

    logger.info({ count: rows.length, targetDate }, "Found registrations to remind");

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      // Managed children have no email of their own — skip; their linked
      // guardian is notified through the parent flow instead.
      if (!row.userEmail) continue;

      const toName = [row.userFirstName, row.userLastName].filter(Boolean).join(" ") || row.userEmail;

      const delivered = await sendReminderEmail(row.userEmail, toName, {
        title: row.eventTitle ?? "",
        eventDate: row.eventDate ?? "",
        startTime: row.startTime ?? "",
        endTime: row.endTime ?? "",
        location: row.location ?? "",
        slotLabel: row.slotLabel ?? null,
        description: row.description ?? null,
        street: row.street ?? null,
        city: row.city ?? null,
        state: row.state ?? null,
        zip: row.zip ?? null,
        supervisorName: row.supervisorFirstName
          ? `${row.supervisorFirstName} ${row.supervisorLastName ?? ""}`.trim()
          : null,
        supervisorPhone: row.supervisorPhone ?? null,
        hoursValue: row.hoursValue != null ? Number(row.hoursValue) : null,
      });

      if (delivered) {
        await db
          .update(eventRegistrationsTable)
          .set({ reminderSent: true })
          .where(eq(eventRegistrationsTable.registrationId, row.registrationId));
        sent++;
      } else {
        failed++;
      }
    }

    logger.info({ sent, failed, targetDate }, "2-day reminder job completed");
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
