import { Router } from "express";
import { db, volunteerSubmissionsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { ClaimHoursBody, ReviewSubmissionBody, OverrideSubmissionBody } from "@workspace/api-zod";

const router = Router();

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
  hoursValue: string | null;
}) {
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
    hoursValue: s.hoursValue ? Number(s.hoursValue) : null,
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
      hoursValue: eventsTable.hoursValue,
    })
    .from(volunteerSubmissionsTable)
    .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .where(eq(volunteerSubmissionsTable.userId, req.auth!.userId))
    .orderBy(volunteerSubmissionsTable.submittedAt);

  res.json(rows.map(formatSubmission));
});

// POST /api/v1/submissions — claim hours
router.post("/v1/submissions", authenticate, requireRole("participant"), async (req, res) => {
  const parsed = ClaimHoursBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { eventId } = parsed.data;
  const userId = req.auth!.userId;

  // Check event exists and is in the past
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.eventId, eventId))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  if (event.eventDate >= today) {
    res.status(400).json({ error: "You can only claim hours for past events" });
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

  if (existing.length > 0) {
    res.status(409).json({ error: "You have already claimed hours for this event" });
    return;
  }

  const [submission] = await db
    .insert(volunteerSubmissionsTable)
    .values({ userId, eventId, status: "pending" })
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
    hoursValue: Number(event.hoursValue),
  });
});

// GET /api/v1/supervisor/submissions — pending queue
router.get(
  "/v1/supervisor/submissions",
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
        hoursValue: eventsTable.hoursValue,
        participantFirstName: usersTable.firstName,
        participantLastName: usersTable.lastName,
        participantEmail: usersTable.email,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .leftJoin(usersTable, eq(volunteerSubmissionsTable.userId, usersTable.userId))
      .where(eq(volunteerSubmissionsTable.status, "pending"))
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
  requireRole("supervisor", "admin"),
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
      .select()
      .from(volunteerSubmissionsTable)
      .where(eq(volunteerSubmissionsTable.submissionId, submissionId))
      .limit(1);

    if (!submission) {
      res.status(404).json({ error: "Submission not found" });
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
        hoursValue: eventsTable.hoursValue,
        participantFirstName: usersTable.firstName,
        participantLastName: usersTable.lastName,
        participantEmail: usersTable.email,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .leftJoin(usersTable, eq(volunteerSubmissionsTable.userId, usersTable.userId))
      .where(inArray(volunteerSubmissionsTable.status, ["approved", "rejected"]))
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
