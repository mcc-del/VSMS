import { Resend } from "resend";
import { logger } from "./logger";

// The sender address. Until medinaacademy.org is verified in Resend, we send
// from Resend's shared test sender (onboarding@resend.dev). Once the domain is
// verified, set the EMAIL_FROM secret to e.g.
// "MedinaCares <noreply@medinaacademy.org>" — no code change needed.
const FROM_ADDRESS =
  process.env["EMAIL_FROM"] || "MedinaCares <onboarding@resend.dev>";

function getClient(): Resend | null {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    logger.warn("RESEND_API_KEY is not set — email sending is disabled");
    return null;
  }
  return new Resend(apiKey);
}

export interface EventDetails {
  title: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  location: string;
}

function formatEventDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(timeStr: string): string {
  const [hourStr, minStr] = timeStr.split(":");
  const hour = Number(hourStr);
  const min = Number(minStr);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return `${h}:${min.toString().padStart(2, "0")} ${suffix}`;
}

export async function sendRegistrationConfirmation(
  toEmail: string,
  toName: string,
  event: EventDetails,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  const formattedDate = formatEventDate(event.eventDate);
  const startFmt = formatTime(event.startTime);
  const endFmt = formatTime(event.endTime);

  const subject = `You're registered: ${event.title}`;
  const text = [
    `Hi ${toName},`,
    "",
    `You have successfully registered for the following volunteer opportunity:`,
    "",
    `Event:    ${event.title}`,
    `Date:     ${formattedDate}`,
    `Time:     ${startFmt} – ${endFmt}`,
    `Location: ${event.location}`,
    "",
    "Please remember to check in on the day of the event using the VSMS app.",
    "",
    "Thank you for volunteering!",
    "— The VSMS Team",
  ].join("\n");

  try {
    const { data, error } = await client.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject,
      text,
    });
    if (error) {
      logger.error({ error, toEmail, eventTitle: event.title }, "Failed to send confirmation email");
    } else {
      logger.info({ emailId: data?.id, toEmail, eventTitle: event.title }, "Confirmation email sent");
    }
  } catch (err) {
    logger.error({ err, toEmail, eventTitle: event.title }, "Failed to send confirmation email");
  }
}

/**
 * Sends a 2-day reminder email.
 * Returns true only when the email was successfully accepted by the provider.
 * Returns false when the API key is missing or the provider call fails.
 * Callers must inspect the return value before marking reminder_sent=true.
 */
export async function sendReminderEmail(
  toEmail: string,
  toName: string,
  event: EventDetails,
): Promise<boolean> {
  const client = getClient();
  if (!client) {
    logger.warn({ toEmail, eventTitle: event.title }, "Reminder skipped — RESEND_API_KEY not configured");
    return false;
  }

  const formattedDate = formatEventDate(event.eventDate);
  const startFmt = formatTime(event.startTime);
  const endFmt = formatTime(event.endTime);

  const subject = `Reminder: ${event.title} is in 2 days`;
  const text = [
    `Hi ${toName},`,
    "",
    `This is a friendly reminder that you are registered for a volunteer event in 2 days:`,
    "",
    `Event:    ${event.title}`,
    `Date:     ${formattedDate}`,
    `Time:     ${startFmt} – ${endFmt}`,
    `Location: ${event.location}`,
    "",
    "Remember to check in on the day of the event using the VSMS app.",
    "",
    "See you there!",
    "— The VSMS Team",
  ].join("\n");

  try {
    const { data, error } = await client.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject,
      text,
    });
    if (error) {
      logger.error({ error, toEmail, eventTitle: event.title }, "Failed to send reminder email");
      return false;
    }
    logger.info({ emailId: data?.id, toEmail, eventTitle: event.title }, "Reminder email sent");
    return true;
  } catch (err) {
    logger.error({ err, toEmail, eventTitle: event.title }, "Failed to send reminder email");
    return false;
  }
}
