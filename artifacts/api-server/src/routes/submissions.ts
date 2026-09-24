import { Router } from "express";
import { db, volunteerSubmissionsTable, eventsTable, usersTable, eventRegistrationsTable, guardianshipsTable } from "@workspace/db";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole } from "../middlewares/auth";
import { SubmitInternalHoursBody, ReviewSubmissionBody, OverrideSubmissionBody } from "@workspace/api-zod";
import { managedOrgIds, canManageOrg } from "../lib/org-scope";
import { sendHoursForReview, sendHoursReviewed } from "../lib/email";

const router = Router();

// Alias for joining the event's supervisor (distinct from the participant).
const supervisorUsers = alias(usersTable, "supervisor_users");

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
  supervisorFirstName?: string | null;
  supervisorLastName?: string | null;
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
    supervisorName:
      s.supervisorFirstName || s.supervisorLastName
        ? `${s.supervisorFirstName ?? ""} ${s.supervisorLastName ?? ""}`.trim()
        : null,
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
      supervisorFirstName: supervisorUsers.firstName,
      supervisorLastName: supervisorUsers.lastName,
    })
    .from(volunteerSubmissionsTable)
    .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .leftJoin(supervisorUsers, eq(eventsTable.supervisorId, supervisorUsers.userId))
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

  if (registration && registration.status === "no_show") {
    res.status(400).json({ error: "You were marked as a no-show for this event and cannot submit hours." });
    return;
  }

  // Walk-in: showed up without signing up. Allow submitting hours if they're
  // eligible (org + grade), creating an attended registration on the fly. The
  // supervisor still reviews and approves the hours.
  if (!registration) {
    const [me] = await db
      .select({ organizationId: usersTable.organizationId, grade: usersTable.grade })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (event.organizationId && (me?.organizationId ?? null) !== event.organizationId) {
      res.status(403).json({ error: "This opportunity isn't open to your organization." });
      return;
    }
    if (event.minGrade != null || event.maxGrade != null) {
      const g = me?.grade ? Number(me.grade) : null;
      if (g == null || (event.minGrade != null && g < event.minGrade) || (event.maxGrade != null && g > event.maxGrade)) {
        res.status(403).json({ error: "This opportunity's grade range doesn't include you." });
        return;
      }
    }
    await db.insert(eventRegistrationsTable).values({ eventId, userId, status: "attended" });
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
    // Only Org Admins are scoped by organization. A plain supervisor is scoped
    // by their own events (supervisorId filter below), so the org filter must
    // NOT apply to them — otherwise the empty managed=[] zeroes out the queue.
    const orgFilter =
      req.auth!.role === "org_admin"
        ? managed && managed.length > 0
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
        userId: volunteerSubmissionsTable.userId,
        eventId: volunteerSubmissionsTable.eventId,
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
    // (A plain supervisor was already validated by supervisorId above, and has
    // no managed orgs, so this check must not apply to them.)
    if (req.auth!.role === "org_admin") {
      const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
      if (!canManageOrg(managed, submission.organizationId)) {
        res.status(403).json({ error: "You can only review submissions for your organization." });
        return;
      }
    }

    // Apply the decision atomically: only update while the submission is still
    // awaiting review. If a supervisor and an admin act at the same time, the
    // first one wins and the second gets a clear "already reviewed" conflict
    // instead of silently overriding the decision (or sending a second email).
    const updated = await db
      .update(volunteerSubmissionsTable)
      .set({
        status: status as "approved" | "rejected",
        supervisorComments: comments ?? null,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(volunteerSubmissionsTable.submissionId, submissionId),
          inArray(volunteerSubmissionsTable.status, ["pending", "deferred_overflow"]),
        ),
      )
      .returning({ submissionId: volunteerSubmissionsTable.submissionId });

    if (updated.length === 0) {
      const [current] = await db
        .select({ status: volunteerSubmissionsTable.status })
        .from(volunteerSubmissionsTable)
        .where(eq(volunteerSubmissionsTable.submissionId, submissionId))
        .limit(1);
      res.status(409).json({
        error: `These hours were already ${current?.status ?? "reviewed"} by another reviewer. Refresh to see the current status.`,
        code: "already_reviewed",
        status: current?.status ?? null,
      });
      return;
    }

    // Notify the participant (and their parent/guardians) of the outcome.
    const [participant] = await db
      .select({
        firstName: usersTable.firstName,
        email: usersTable.email,
        parentEmail: usersTable.parentEmail,
        isManaged: usersTable.isManaged,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, submission.userId))
      .limit(1);
    if (participant) {
      const [ev] = await db
        .select({ title: eventsTable.title })
        .from(eventsTable)
        .where(eq(eventsTable.eventId, submission.eventId))
        .limit(1);
      const recipients = [participant.email, participant.parentEmail].filter((e): e is string => !!e);
      // A managed child has no email of their own — notify their guardians.
      if (participant.isManaged) {
        const guardians = await db
          .select({ email: usersTable.email })
          .from(guardianshipsTable)
          .leftJoin(usersTable, eq(guardianshipsTable.guardianUserId, usersTable.userId))
          .where(eq(guardianshipsTable.childUserId, submission.userId));
        for (const g of guardians) if (g.email) recipients.push(g.email);
      }
      sendHoursReviewed(
        recipients,
        participant.firstName,
        ev?.title ?? "your event",
        status === "approved",
        comments ?? null,
      ).catch((err) => req.log.error({ err }, "hours-reviewed email failed"));
    }

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
