import { Router } from "express";
import { db, volunteerSubmissionsTable, eventsTable, usersTable, eventRegistrationsTable } from "@workspace/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { SubmitInternalHoursBody, ReviewSubmissionBody, OverrideSubmissionBody } from "@workspace/api-zod";
import { managedOrgIds, canManageOrg } from "../lib/org-scope";
import { sendHoursForReview } from "../lib/email";

const router = Router();

function calculateDurationHours(startTime: string, endTime: string): number | null {
  const [startHour, startMinute] = startTime.slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = endTime.slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return null;
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

function formatSubmission(s: {
  submissionId: string;
  userId: string;
  eventId: string;
  status: string;
  supervisorComments: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  eventTitle: string | null;
  eventDate: string | null;
  hoursWorked: string | null;
  plannedHours: string | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
}) {
  const plannedHours =
    s.eventStartTime && s.eventEndTime
      ? calculateDurationHours(s.eventStartTime, s.eventEndTime)
      : s.plannedHours
        ? Number(s.plannedHours)
        : null;
  return {
    submissionId: s.submissionId,
    userId: s.userId,
    eventId: s.eventId,
    status: s.status,
    supervisorComments: s.supervisorComments,
    submittedAt: s.submittedAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() ?? null,
    eventTitle: s.eventTitle,
    eventDate: s.eventDate,
    hoursWorked: s.hoursWorked
      ? Number(s.hoursWorked)
      : s.status === "approved" && s.plannedHours
        ? Number(s.plannedHours)
        : null,
    plannedHours,
  };
}

// GET /api/v1/submissions — participant's own submissions
router.get("/v1/submissions", authenticate, requireRole("participant"), async (req, res) => {
  const rows = await db
    .select({
      submissionId: volunteerSubmissionsTable.submissionId,
      userId: volunteerSubmissionsTable.userId,
      eventId: volunteerSubmissionsTable.eventId,
      status: volunteerSubmissionsTable.status,
      supervisorComments: volunteerSubmissionsTable.supervisorComments,
      submittedAt: volunteerSubmissionsTable.submittedAt,
      reviewedAt: volunteerSubmissionsTable.reviewedAt,
      eventTitle: eventsTable.title,
      eventDate: eventsTable.eventDate,
      hoursWorked: volunteerSubmissionsTable.hoursWorked,
      plannedHours: eventsTable.hoursValue,
      eventStartTime: eventsTable.startTime,
      eventEndTime: eventsTable.endTime,
    })
    .from(volunteerSubmissionsTable)
    .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .where(eq(volunteerSubmissionsTable.userId, req.auth!.userId))
    .orderBy(volunteerSubmissionsTable.submittedAt);

  res.json(rows.map(formatSubmission));
});

// POST /api/v1/submissions — submit actual hours worked
router.post("/v1/submissions", authenticate, requireRole("participant"), async (req, res) => {
  const parsed = SubmitInternalHoursBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { eventId, hoursWorked } = parsed.data;
  const userId = req.auth!.userId;

  // Check event exists and has ended
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.eventId, eventId))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const nowTime = now.toTimeString().slice(0, 5);
  const eventHasEnded =
    event.eventDate < today ||
    (event.eventDate === today && nowTime > event.endTime.slice(0, 5));
  if (!eventHasEnded) {
    res.status(400).json({ error: "You can submit actual hours only after the event has ended." });
    return;
  }

  // Require a valid registration — no-show or unregistered participants cannot submit hours.
  const [registration] = await db
    .select()
    .from(eventRegistrationsTable)
    .where(
      and(
        eq(eventRegistrationsTable.userId, userId),
        eq(eventRegistrationsTable.eventId, eventId),
      ),
    )
    .limit(1);

  if (!registration) {
    res.status(400).json({ error: "You are not registered for this event and cannot submit hours." });
    return;
  }

  if (registration.status === "no_show") {
    res.status(400).json({ error: "You were marked as a no-show for this event and cannot submit hours." });
    return;
  }

  // Check for duplicate submission
  const existing = await db
    .select()
    .from(volunteerSubmissionsTable)
    .where(
      and(
        eq(volunteerSubmissionsTable.userId, userId),
        eq(volunteerSubmissionsTable.eventId, eventId),
      ),
    )
    .limit(1);

  // Block re-submission only once the hours are APPROVED; a pending or rejected
  // submission can be corrected and re-submitted (goes back to pending).
  if (existing.length > 0 && existing[0].hoursWorked !== null && existing[0].status === "approved") {
    res.status(409).json({ error: "These hours are already approved and can't be changed." });
    return;
  }

  const [submission] = existing.length > 0
    ? await db
        .update(volunteerSubmissionsTable)
        .set({
          hoursWorked: String(hoursWorked),
          status: "pending",
          supervisorComments: null,
          submittedAt: new Date(),
          reviewedAt: null,
        })
        .where(eq(volunteerSubmissionsTable.submissionId, existing[0].submissionId))
        .returning()
    : await db
        .insert(volunteerSubmissionsTable)
        .values({ userId, eventId, hoursWorked: String(hoursWorked), status: "pending" })
        .returning();

  res.status(201).json({
    submissionId: submission.submissionId,
    userId: submission.userId,
    eventId: submission.eventId,
    status: submission.status,
    supervisorComments: null,
    submittedAt: submission.submittedAt.toISOString(),
    reviewedAt: null,
    eventTitle: event.title,
    eventDate: event.eventDate,
    hoursWorked: Number(submission.hoursWorked),
    plannedHours: calculateDurationHours(event.startTime, event.endTime) ?? Number(event.hoursValue),
  });

  // Notify the event's supervisor that hours are waiting for review.
  const [sup] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.userId, event.supervisorId))
    .limit(1);
  const [participant] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.userId, userId))
    .limit(1);
  if (sup?.email) {
    const supName = [sup.firstName, sup.lastName].filter(Boolean).join(" ") || "Supervisor";
    const partName = [participant?.firstName, participant?.lastName].filter(Boolean).join(" ") || "A participant";
    sendHoursForReview(sup.email, supName, partName, event.title).catch((err) =>
      req.log.error({ err }, "hours-for-review email failed"),
    );
  }
});

// GET /api/v1/supervisor/submissions — pending queue
router.get(
  "/v1/supervisor/submissions",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    // Organization Admins only see submissions for events in the org(s) they
    // manage; a Super Admin sees all; a supervisor sees their assigned events.
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    const orgFilter =
      managed !== null
        ? managed.length > 0
          ? inArray(eventsTable.organizationId, managed)
          : eq(eventsTable.eventId, "00000000-0000-0000-0000-000000000000") // none
        : undefined;

    const rows = await db
      .select({
        submissionId: volunteerSubmissionsTable.submissionId,
        userId: volunteerSubmissionsTable.userId,
        eventId: volunteerSubmissionsTable.eventId,
        status: volunteerSubmissionsTable.status,
        supervisorComments: volunteerSubmissionsTable.supervisorComments,
        submittedAt: volunteerSubmissionsTable.submittedAt,
        reviewedAt: volunteerSubmissionsTable.reviewedAt,
        eventTitle: eventsTable.title,
        eventDate: eventsTable.eventDate,
        hoursWorked: volunteerSubmissionsTable.hoursWorked,
        plannedHours: eventsTable.hoursValue,
        eventStartTime: eventsTable.startTime,
        eventEndTime: eventsTable.endTime,
        participantFirstName: usersTable.firstName,
        participantLastName: usersTable.lastName,
        participantEmail: usersTable.email,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .leftJoin(usersTable, eq(volunteerSubmissionsTable.userId, usersTable.userId))
      .where(
        and(
          eq(volunteerSubmissionsTable.status, "pending"),
          isNotNull(volunteerSubmissionsTable.hoursWorked),
          req.auth!.role === "supervisor"
            ? eq(eventsTable.supervisorId, req.auth!.userId)
            : undefined,
          orgFilter,
        ),
      )
      .orderBy(volunteerSubmissionsTable.submittedAt);

    res.json(
      rows.map((r) => ({
        ...formatSubmission(r),
        participantFirstName: r.participantFirstName,
        participantLastName: r.participantLastName,
        participantEmail: r.participantEmail,
      })),
    );
  },
);

// PUT /api/v1/supervisor/submissions/:submissionId/review
router.put(
  "/v1/supervisor/submissions/:submissionId/review",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { submissionId } = req.params as { submissionId: string };

    const parsed = ReviewSubmissionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { status, comments } = parsed.data;

    if (status !== "approved" && status !== "rejected") {
      res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
      return;
    }

    if (status === "rejected" && (!comments || comments.trim() === "")) {
      res.status(400).json({
        error: "You must provide a reason for rejecting this claim.",
      });
      return;
    }

    const [submission] = await db
      .select({
        submissionId: volunteerSubmissionsTable.submissionId,
        supervisorId: eventsTable.supervisorId,
        organizationId: eventsTable.organizationId,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(eq(volunteerSubmissionsTable.submissionId, submissionId))
      .limit(1);

    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    if (req.auth!.role === "supervisor" && submission.supervisorId !== req.auth!.userId) {
      res.status(403).json({ error: "You can only review submissions for your assigned events." });
      return;
    }

    // Organization Admins may only review submissions for events in their org(s).
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null && !canManageOrg(managed, submission.organizationId)) {
      res.status(403).json({ error: "You can only review submissions for your organization." });
      return;
    }

    await db
      .update(volunteerSubmissionsTable)
      .set({
        status: status as "approved" | "rejected",
        supervisorComments: comments ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(volunteerSubmissionsTable.submissionId, submissionId));

    res.json({ status: "success", message: "Submission evaluation processed successfully." });
  },
);

// GET /api/v1/supervisor/history
router.get(
  "/v1/supervisor/history",
  authenticate,
  requireRole("supervisor", "admin"),
  async (req, res) => {
    const rows = await db
      .select({
        submissionId: volunteerSubmissionsTable.submissionId,
        userId: volunteerSubmissionsTable.userId,
        eventId: volunteerSubmissionsTable.eventId,
        status: volunteerSubmissionsTable.status,
        supervisorComments: volunteerSubmissionsTable.supervisorComments,
        submittedAt: volunteerSubmissionsTable.submittedAt,
        reviewedAt: volunteerSubmissionsTable.reviewedAt,
        eventTitle: eventsTable.title,
        eventDate: eventsTable.eventDate,
        hoursWorked: volunteerSubmissionsTable.hoursWorked,
        plannedHours: eventsTable.hoursValue,
        eventStartTime: eventsTable.startTime,
        eventEndTime: eventsTable.endTime,
        participantFirstName: usersTable.firstName,
        participantLastName: usersTable.lastName,
        participantEmail: usersTable.email,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .leftJoin(usersTable, eq(volunteerSubmissionsTable.userId, usersTable.userId))
      .where(
        and(
          inArray(volunteerSubmissionsTable.status, ["approved", "rejected"]),
          req.auth!.role === "supervisor"
            ? eq(eventsTable.supervisorId, req.auth!.userId)
            : undefined,
        ),
      )
      .orderBy(volunteerSubmissionsTable.reviewedAt);

    res.json(
      rows.map((r) => ({
        ...formatSubmission(r),
        participantFirstName: r.participantFirstName,
        participantLastName: r.participantLastName,
        participantEmail: r.participantEmail,
      })),
    );
  },
);

// PUT /api/v1/admin/submissions/:submissionId/override
router.put(
  "/v1/admin/submissions/:submissionId/override",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { submissionId } = req.params as { submissionId: string };

    const parsed = OverrideSubmissionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { status, comments } = parsed.data;

    if (!comments || comments.trim() === "") {
      res.status(400).json({ error: "Admin override requires a comment." });
      return;
    }

    await db
      .update(volunteerSubmissionsTable)
      .set({
        status: status as "pending" | "approved" | "rejected",
        supervisorComments: comments,
        reviewedAt: new Date(),
      })
      .where(eq(volunteerSubmissionsTable.submissionId, submissionId));

    res.json({ status: "success", message: "Override applied successfully." });
  },
);

export default router;
