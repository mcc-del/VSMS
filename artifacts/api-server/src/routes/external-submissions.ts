import { Router } from "express";
import { db, externalSubmissionsTable, volunteerSubmissionsTable, eventsTable, usersTable } from "@workspace/db";
import { eq, and, inArray, sum, sql, ne } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { SubmitExternalActivityBody } from "@workspace/api-zod";
import { isWithinAwardWindow, AWARD_WINDOW_MESSAGE } from "../lib/season";

const router = Router();

interface ExternalFields {
  activityName: string;
  organizationName: string;
  volunteerDate: string;
  hoursWorked: number;
  extSupervisorName: string;
  extSupervisorEmail: string;
  description?: string | null;
  isNonprofit?: boolean;
  ein?: string | null;
}

// Field-level validation shared by create and edit. Returns an error message,
// or null when the fields are valid. `selfEmail` is the submitter's own email.
function validateExternalFields(data: ExternalFields, selfEmail: string | null): string | null {
  if (data.isNonprofit) {
    const cleaned = (data.ein ?? "").replace(/[^0-9]/g, "");
    if (cleaned.length !== 9) {
      return "A valid 9-digit EIN is required for a registered non-profit.";
    }
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().split("T")[0];
  const { volunteerDate } = data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(volunteerDate) || Number.isNaN(Date.parse(volunteerDate))) {
    return "Please enter a valid volunteer date.";
  }
  if (volunteerDate > todayStr) {
    return "The volunteer date can't be in the future — log hours only after you've volunteered.";
  }
  if (volunteerDate < oneYearAgoStr) {
    return "That date is more than a year ago and can no longer be submitted.";
  }
  if (!isWithinAwardWindow(volunteerDate)) {
    return AWARD_WINDOW_MESSAGE;
  }
  if (
    selfEmail &&
    data.extSupervisorEmail.trim().toLowerCase() === selfEmail.toLowerCase()
  ) {
    return "The supervisor email must belong to someone other than you.";
  }
  return null;
}

// Recompute whether a submission must be deferred under the 25% external cap.
// `excludeId` omits an existing submission (used when editing it in place).
async function computeDeferred(
  userId: string,
  hoursWorked: number,
  excludeId?: string,
): Promise<boolean> {
  const [calendarApproved] = await db
    .select({
      total: sql<string>`sum(coalesce(${volunteerSubmissionsTable.hoursWorked}, ${eventsTable.hoursValue}))`,
    })
    .from(volunteerSubmissionsTable)
    .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .where(
      and(
        eq(volunteerSubmissionsTable.userId, userId),
        eq(volunteerSubmissionsTable.status, "approved"),
      ),
    );
  const calendarApprovedHours = Number(calendarApproved?.total ?? 0);

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

  const [externalPending] = await db
    .select({ total: sum(externalSubmissionsTable.hoursWorked) })
    .from(externalSubmissionsTable)
    .where(
      and(
        eq(externalSubmissionsTable.userId, userId),
        eq(externalSubmissionsTable.status, "pending"),
        ...(excludeId ? [ne(externalSubmissionsTable.externalSubmissionId, excludeId)] : []),
      ),
    );
  const externalPendingHours = Number(externalPending?.total ?? 0);

  const totalExternalIfApproved = externalApprovedHours + externalPendingHours + hoursWorked;
  const maxAllowedExternal = calendarApprovedHours * 0.25;
  return calendarApprovedHours > 0 && totalExternalIfApproved > maxAllowedExternal;
}

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
    isNonprofit: r.isNonprofit,
    ein: r.ein ?? null,
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
      req.log.warn({ body: req.body, issues: parsed.error.issues }, "External submission validation failed");
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const userId = req.auth!.userId;
    const { activityName, organizationName, volunteerDate, hoursWorked, extSupervisorName, extSupervisorEmail, description, isNonprofit, ein } = parsed.data;

    // The external supervisor must be someone other than the student.
    const [self] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);

    const fieldError = validateExternalFields(parsed.data, self?.email ?? null);
    if (fieldError) {
      res.status(400).json({ error: fieldError });
      return;
    }

    // Prevent duplicate submissions of the same activity/org/date.
    const [dupe] = await db
      .select({ status: externalSubmissionsTable.status })
      .from(externalSubmissionsTable)
      .where(
        and(
          eq(externalSubmissionsTable.userId, userId),
          eq(externalSubmissionsTable.activityName, activityName.trim()),
          eq(externalSubmissionsTable.organizationName, organizationName.trim()),
          eq(externalSubmissionsTable.volunteerDate, volunteerDate),
        ),
      )
      .limit(1);
    if (dupe && dupe.status !== "rejected") {
      res.status(409).json({ error: "You've already submitted this activity for this date." });
      return;
    }

    // Enforce the 25% external-hours cap. With zero approved internal hours the
    // cap has no baseline, so the submission is let through as "pending".
    const isDeferred = await computeDeferred(userId, hoursWorked);

    const [submission] = await db
      .insert(externalSubmissionsTable)
      .values({
        userId,
        activityName: activityName.trim(),
        organizationName: organizationName.trim(),
        volunteerDate,
        hoursWorked: String(hoursWorked),
        extSupervisorName: extSupervisorName.trim(),
        extSupervisorEmail: extSupervisorEmail.trim().toLowerCase(),
        description: description?.trim() || null,
        isNonprofit: isNonprofit ?? false,
        ein: isNonprofit ? (ein ?? "").replace(/[^0-9]/g, "") : null,
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

// Editable states: a participant may change or withdraw a submission only while
// it is still awaiting review.
const EDITABLE_STATES = ["pending", "deferred_overflow"] as const;

// PATCH /api/v1/external-submissions/:id — edit a still-pending submission.
router.patch(
  "/v1/external-submissions/:externalSubmissionId",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const { externalSubmissionId } = req.params as { externalSubmissionId: string };
    const userId = req.auth!.userId;

    const [existing] = await db
      .select()
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.externalSubmissionId, externalSubmissionId))
      .limit(1);
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    if (!EDITABLE_STATES.includes(existing.status as (typeof EDITABLE_STATES)[number])) {
      res.status(400).json({ error: "Only a submission awaiting review can be edited." });
      return;
    }

    const parsed = SubmitExternalActivityBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const {
      activityName,
      organizationName,
      volunteerDate,
      hoursWorked,
      extSupervisorName,
      extSupervisorEmail,
      description,
      isNonprofit,
      ein,
    } = parsed.data;

    const [self] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);

    const fieldError = validateExternalFields(parsed.data, self?.email ?? null);
    if (fieldError) {
      res.status(400).json({ error: fieldError });
      return;
    }

    // Duplicate check, excluding this submission itself.
    const [dupe] = await db
      .select({ status: externalSubmissionsTable.status })
      .from(externalSubmissionsTable)
      .where(
        and(
          eq(externalSubmissionsTable.userId, userId),
          eq(externalSubmissionsTable.activityName, activityName.trim()),
          eq(externalSubmissionsTable.organizationName, organizationName.trim()),
          eq(externalSubmissionsTable.volunteerDate, volunteerDate),
          ne(externalSubmissionsTable.externalSubmissionId, externalSubmissionId),
        ),
      )
      .limit(1);
    if (dupe && dupe.status !== "rejected") {
      res.status(409).json({ error: "You've already submitted this activity for this date." });
      return;
    }

    const isDeferred = await computeDeferred(userId, hoursWorked, externalSubmissionId);

    const [updated] = await db
      .update(externalSubmissionsTable)
      .set({
        activityName: activityName.trim(),
        organizationName: organizationName.trim(),
        volunteerDate,
        hoursWorked: String(hoursWorked),
        extSupervisorName: extSupervisorName.trim(),
        extSupervisorEmail: extSupervisorEmail.trim().toLowerCase(),
        description: description?.trim() || null,
        isNonprofit: isNonprofit ?? false,
        ein: isNonprofit ? (ein ?? "").replace(/[^0-9]/g, "") : null,
        status: isDeferred ? "deferred_overflow" : "pending",
        supervisorComments: null,
        reviewedAt: null,
      })
      .where(eq(externalSubmissionsTable.externalSubmissionId, externalSubmissionId))
      .returning();

    res.json(formatExternal(updated));
  },
);

// DELETE /api/v1/external-submissions/:id — withdraw a still-pending submission.
router.delete(
  "/v1/external-submissions/:externalSubmissionId",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const { externalSubmissionId } = req.params as { externalSubmissionId: string };
    const userId = req.auth!.userId;

    const [existing] = await db
      .select({ userId: externalSubmissionsTable.userId, status: externalSubmissionsTable.status })
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.externalSubmissionId, externalSubmissionId))
      .limit(1);
    if (!existing || existing.userId !== userId) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    if (!EDITABLE_STATES.includes(existing.status as (typeof EDITABLE_STATES)[number])) {
      res.status(400).json({ error: "Only a submission awaiting review can be withdrawn." });
      return;
    }

    await db
      .delete(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.externalSubmissionId, externalSubmissionId));
    res.json({ status: "ok", message: "Submission withdrawn." });
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
        isNonprofit: externalSubmissionsTable.isNonprofit,
        ein: externalSubmissionsTable.ein,
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
        isNonprofit: r.isNonprofit,
        ein: r.ein ?? null,
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
        isNonprofit: externalSubmissionsTable.isNonprofit,
        ein: externalSubmissionsTable.ein,
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
        isNonprofit: r.isNonprofit,
        ein: r.ein ?? null,
        participantFirstName: r.participantFirstName ?? null,
        participantLastName: r.participantLastName ?? null,
        participantEmail: r.participantEmail ?? null,
      })),
    );
  },
);

export default router;
