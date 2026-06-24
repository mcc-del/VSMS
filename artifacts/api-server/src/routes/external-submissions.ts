import { Router } from "express";
import { db, externalSubmissionsTable, volunteerSubmissionsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, inArray, sum } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { SubmitExternalActivityBody } from "@workspace/api-zod";

const router = Router();

function formatExternal(r: typeof externalSubmissionsTable.$inferSelect) {
  return {
    externalSubmissionId: r.externalSubmissionId,
    userId: r.userId,
    activityName: r.activityName,
    organizationName: r.organizationName,
    volunteerDate: r.volunteerDate,
    hoursWorked: Number(r.hoursWorked),
    extSupervisorName: r.extSupervisorName,
    extSupervisorEmail: r.extSupervisorEmail,
    description: r.description ?? null,
    status: r.status,
    supervisorComments: r.supervisorComments ?? null,
    submittedAt: r.submittedAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  };
}

// GET /api/v1/external-submissions — participant lists their own
router.get(
  "/v1/external-submissions",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const userId = req.auth!.userId;
    const rows = await db
      .select()
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.userId, userId))
      .orderBy(externalSubmissionsTable.submittedAt);

    res.json(rows.map(formatExternal));
  },
);

// POST /api/v1/external-submissions — participant submits external activity
router.post(
  "/v1/external-submissions",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const parsed = SubmitExternalActivityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const userId = req.auth!.userId;
    const { activityName, organizationName, volunteerDate, hoursWorked, extSupervisorName, extSupervisorEmail, description } = parsed.data;

    // Enforce 25% cap: external approved hours ≤ 25% of total approved calendar hours
    // Calculate approved calendar hours
    const [calendarApproved] = await db
      .select({ total: sum(eventsTable.hoursValue) })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(
        and(
          eq(volunteerSubmissionsTable.userId, userId),
          eq(volunteerSubmissionsTable.status, "approved"),
        ),
      );

    const calendarApprovedHours = Number(calendarApproved?.total ?? 0);

    // Calculate approved external hours (already approved, not counting this new one)
    const [externalApproved] = await db
      .select({ total: sum(externalSubmissionsTable.hoursWorked) })
      .from(externalSubmissionsTable)
      .where(
        and(
          eq(externalSubmissionsTable.userId, userId),
          eq(externalSubmissionsTable.status, "approved"),
        ),
      );

    const externalApprovedHours = Number(externalApproved?.total ?? 0);

    // Calculate pending external hours (submitted but not yet reviewed)
    const [externalPending] = await db
      .select({ total: sum(externalSubmissionsTable.hoursWorked) })
      .from(externalSubmissionsTable)
      .where(
        and(
          eq(externalSubmissionsTable.userId, userId),
          eq(externalSubmissionsTable.status, "pending"),
        ),
      );

    const externalPendingHours = Number(externalPending?.total ?? 0);

    // The cap is: (approved external + pending external + new submission) ≤ 25% of approved calendar hours
    // This ensures they can't exceed the cap even if all pending get approved
    const totalExternalIfApproved = externalApprovedHours + externalPendingHours + hoursWorked;
    const maxAllowedExternal = calendarApprovedHours * 0.25;

    // Defer only when there are calendar hours to compare against.
    // With zero approved calendar hours the 25% cap has no baseline, so we
    // let the submission through as "pending" — the cap enforces on future
    // submissions once internal hours accrue.
    const isDeferred = calendarApprovedHours > 0 && totalExternalIfApproved > maxAllowedExternal;

    const [submission] = await db
      .insert(externalSubmissionsTable)
      .values({
        userId,
        activityName,
        organizationName,
        volunteerDate,
        hoursWorked: String(hoursWorked),
        extSupervisorName,
        extSupervisorEmail,
        description: description ?? null,
        status: isDeferred ? "deferred_overflow" : "pending",
      })
      .returning();

    const responseBody: ReturnType<typeof formatExternal> & { message?: string } = formatExternal(submission);
    if (isDeferred) {
      responseBody.message =
        "Your submission exceeds the 25% external hours cap. It has been safely stored in your Deferred Repository and will be released once you complete more in-organization volunteer hours.";
    }
    res.status(201).json(responseBody);
  },
);

// GET /api/v1/supervisor/external-submissions — supervisor lists pending external
router.get(
  "/v1/supervisor/external-submissions",
  authenticate,
  requireRole("supervisor", "admin"),
  async (req, res) => {
    const rows = await db
      .select({
        externalSubmissionId: externalSubmissionsTable.externalSubmissionId,
        userId: externalSubmissionsTable.userId,
        activityName: externalSubmissionsTable.activityName,
        organizationName: externalSubmissionsTable.organizationName,
        volunteerDate: externalSubmissionsTable.volunteerDate,
        hoursWorked: externalSubmissionsTable.hoursWorked,
        extSupervisorName: externalSubmissionsTable.extSupervisorName,
        extSupervisorEmail: externalSubmissionsTable.extSupervisorEmail,
        description: externalSubmissionsTable.description,
        status: externalSubmissionsTable.status,
        supervisorComments: externalSubmissionsTable.supervisorComments,
        submittedAt: externalSubmissionsTable.submittedAt,
        reviewedAt: externalSubmissionsTable.reviewedAt,
        participantFirstName: usersTable.firstName,
        participantLastName: usersTable.lastName,
        participantEmail: usersTable.email,
      })
      .from(externalSubmissionsTable)
      .leftJoin(usersTable, eq(externalSubmissionsTable.userId, usersTable.userId))
      .where(inArray(externalSubmissionsTable.status, ["pending", "deferred_overflow"]))
      .orderBy(externalSubmissionsTable.submittedAt);

    res.json(
      rows.map((r) => ({
        externalSubmissionId: r.externalSubmissionId,
        userId: r.userId,
        activityName: r.activityName,
        organizationName: r.organizationName,
        volunteerDate: r.volunteerDate,
        hoursWorked: Number(r.hoursWorked),
        extSupervisorName: r.extSupervisorName,
        extSupervisorEmail: r.extSupervisorEmail,
        description: r.description ?? null,
        status: r.status,
        supervisorComments: r.supervisorComments ?? null,
        submittedAt: r.submittedAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        participantFirstName: r.participantFirstName ?? null,
        participantLastName: r.participantLastName ?? null,
        participantEmail: r.participantEmail ?? null,
      })),
    );
  },
);

// PUT /api/v1/supervisor/external-submissions/:externalSubmissionId/review
router.put(
  "/v1/supervisor/external-submissions/:externalSubmissionId/review",
  authenticate,
  requireRole("supervisor", "admin"),
  async (req, res) => {
    const { externalSubmissionId } = req.params as { externalSubmissionId: string };
    const { status, comments } = req.body as { status: string; comments?: string | null };

    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({ error: "Invalid status. Use 'approved' or 'rejected'." });
      return;
    }

    if (status === "rejected" && (!comments || comments.trim() === "")) {
      res.status(400).json({ error: "Comments are required when rejecting." });
      return;
    }

    const [existing] = await db
      .select()
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.externalSubmissionId, externalSubmissionId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "External submission not found." });
      return;
    }

    await db
      .update(externalSubmissionsTable)
      .set({
        status: status as "approved" | "rejected",
        supervisorComments: comments ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(externalSubmissionsTable.externalSubmissionId, externalSubmissionId));

    res.json({ status: "success", message: "External submission reviewed." });
  },
);

// GET /api/v1/supervisor/external-history — reviewed external submissions
router.get(
  "/v1/supervisor/external-history",
  authenticate,
  requireRole("supervisor", "admin"),
  async (req, res) => {
    const rows = await db
      .select({
        externalSubmissionId: externalSubmissionsTable.externalSubmissionId,
        userId: externalSubmissionsTable.userId,
        activityName: externalSubmissionsTable.activityName,
        organizationName: externalSubmissionsTable.organizationName,
        volunteerDate: externalSubmissionsTable.volunteerDate,
        hoursWorked: externalSubmissionsTable.hoursWorked,
        extSupervisorName: externalSubmissionsTable.extSupervisorName,
        extSupervisorEmail: externalSubmissionsTable.extSupervisorEmail,
        description: externalSubmissionsTable.description,
        status: externalSubmissionsTable.status,
        supervisorComments: externalSubmissionsTable.supervisorComments,
        submittedAt: externalSubmissionsTable.submittedAt,
        reviewedAt: externalSubmissionsTable.reviewedAt,
        participantFirstName: usersTable.firstName,
        participantLastName: usersTable.lastName,
        participantEmail: usersTable.email,
      })
      .from(externalSubmissionsTable)
      .leftJoin(usersTable, eq(externalSubmissionsTable.userId, usersTable.userId))
      .where(inArray(externalSubmissionsTable.status, ["approved", "rejected"]))
      .orderBy(externalSubmissionsTable.reviewedAt);

    res.json(
      rows.map((r) => ({
        externalSubmissionId: r.externalSubmissionId,
        userId: r.userId,
        activityName: r.activityName,
        organizationName: r.organizationName,
        volunteerDate: r.volunteerDate,
        hoursWorked: Number(r.hoursWorked),
        extSupervisorName: r.extSupervisorName,
        extSupervisorEmail: r.extSupervisorEmail,
        description: r.description ?? null,
        status: r.status,
        supervisorComments: r.supervisorComments ?? null,
        submittedAt: r.submittedAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        participantFirstName: r.participantFirstName ?? null,
        participantLastName: r.participantLastName ?? null,
        participantEmail: r.participantEmail ?? null,
      })),
    );
  },
);

export default router;
