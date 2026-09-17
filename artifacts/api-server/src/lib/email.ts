import { Resend } from "resend";
import { logger } from "./logger";

// The sender address. Until medinaacademy.org is verified in Resend, we send
// from Resend's shared test sender (onboarding@resend.dev). Once the domain is
// verified, set the EMAIL_FROM secret to e.g.
// "MedinaCares <noreply@medinaacademy.org>" — no code change needed.
const FROM_ADDRESS =
  process.env["EMAIL_FROM"] || "MedinaCares <onboarding@resend.dev>";

// Public app URL used to build links inside emails.
const APP_URL = (process.env["APP_URL"] || "https://vsa.medinaacademy.org").replace(/\/$/, "");

// Password reset link.
export async function sendPasswordReset(toEmail: string, token: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const text = [
    "We received a request to reset your MedinaCares password.",
    "",
    `Reset it here (link expires in 1 hour): ${link}`,
    "",
    "If you didn't request this, you can ignore this email.",
    "— MedinaCares Volunteer Service Awards",
  ].join("\n");
  try {
    await client.emails.send({ from: FROM_ADDRESS, to: toEmail, subject: "Reset your MedinaCares password", text });
  } catch (err) {
    logger.error({ err, toEmail }, "Failed to send password reset");
  }
}

// Co-guardian invitation.
export async function sendCoGuardianInvite(toEmail: string, inviterName: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const text = [
    `${inviterName} has invited you as a co-guardian on MedinaCares, so you can help manage and track your children's volunteering.`,
    "",
    `Create your account with THIS email address (${toEmail}) to be linked automatically: ${APP_URL}/register`,
    "Choose \"I'm a parent\" when you sign up.",
    "",
    "— MedinaCares Volunteer Service Awards",
  ].join("\n");
  try {
    await client.emails.send({ from: FROM_ADDRESS, to: toEmail, subject: "You've been invited as a co-guardian on MedinaCares", text });
  } catch (err) {
    logger.error({ err, toEmail }, "Failed to send co-guardian invite");
  }
}

// Notify a supervisor that hours are waiting for their review.
export async function sendHoursForReview(toEmail: string, supervisorName: string, participantName: string, eventTitle: string): Promise<void> {
  const client = getClient();
  if (!client) return;
  const text = [
    `Hi ${supervisorName},`,
    "",
    `${participantName} submitted volunteer hours for "${eventTitle}" and they're waiting for your review.`,
    "",
    `Review and approve or reject here: ${APP_URL}/supervisor/pending`,
    "",
    "— MedinaCares Volunteer Service Awards",
  ].join("\n");
  try {
    await client.emails.send({ from: FROM_ADDRESS, to: toEmail, subject: `Hours to review: ${eventTitle}`, text });
  } catch (err) {
    logger.error({ err, toEmail }, "Failed to send hours-for-review email");
  }
}

function getClient(): Resend | null {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    logger.warn("RESEND_API_KEY is not set — email sending is disabled");
    return null;
  }
  return new Resend(apiKey);
}

// Sends a simple test email so an admin can confirm the sending domain works.
// Returns { ok, id?, error? } so the caller can surface the result in the UI.
export async function sendTestEmail(
  toEmail: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const client = getClient();
  if (!client) return { ok: false, error: "RESEND_API_KEY is not set on the server." };

  const subject = "MedinaCares — test email ✅";
  const text = [
    "This is a test email from the MedinaCares platform.",
    "",
    `If you can read this, email sending is working and the sender is: ${FROM_ADDRESS}.`,
    "",
    "— MedinaCares Volunteer Service Awards",
  ].join("\n");

  try {
    const { data, error } = await client.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject,
      text,
    });
    if (error) {
      logger.error({ error, toEmail }, "Test email failed");
      return { ok: false, error: typeof error === "string" ? error : (error as { message?: string }).message ?? "Send failed" };
    }
    logger.info({ emailId: data?.id, toEmail }, "Test email sent");
    return { ok: true, id: data?.id };
  } catch (err) {
    logger.error({ err, toEmail }, "Test email failed");
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
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
