import { Router } from "express";
import {
  db,
  usersTable,
  eventRegistrationsTable,
  eventsTable,
  volunteerSubmissionsTable,
  manualHoursTable,
  guardianshipsTable,
  guardianInvitesTable,
  organizationsTable,
  awardThresholdsTable,
  externalSubmissionsTable,
} from "@workspace/db";
import { thresholdsForGrade } from "../lib/thresholds";
import { eq, and, inArray, gte, sum, sql, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Alias for joining an event's supervisor when building a child's schedule.
const parentSupervisorUsers = alias(usersTable, "parent_supervisor_users");
import { authenticate, requireRole } from "../middlewares/auth";
import { sendCoGuardianInvite, sendSignupNotification } from "../lib/email";
import { notifyUser } from "../lib/digest";

interface ChildFields {
  firstName: string;
  lastName: string;
  grade: string;
  school: string;
  organizationId: string | null;
}

// Validate and normalize a child payload. `partial` allows a subset (for PATCH).
function parseChild(
  body: unknown,
  partial: boolean,
): { ok: true; value: Partial<ChildFields> } | { ok: false } {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<ChildFields> = {};

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const fields: Array<keyof ChildFields> = ["firstName", "lastName", "grade", "school"];
  const limits: Record<string, number> = { firstName: 50, lastName: 50, grade: 20, school: 120 };

  for (const f of fields) {
    const val = str(b[f]);
    if (val === undefined || val === "") {
      if (!partial) return { ok: false };
      continue;
    }
    if (val.length > limits[f]) return { ok: false };
    out[f] = val;
  }
  if ("organizationId" in b) {
    const org = b.organizationId;
    if (org === null || org === undefined || org === "") out.organizationId = null;
    else if (typeof org === "string") out.organizationId = org;
    else return { ok: false };
  }
  return { ok: true, value: out };
}

const router = Router();

// Resolve the child user IDs linked to a parent: explicit guardianships plus
// the legacy parent-email link (students who signed themselves up and named
// this parent). De-duplicated.
async function resolveChildIds(parentUserId: string, parentEmail: string): Promise<string[]> {
  const links = await db
    .select({ childUserId: guardianshipsTable.childUserId })
    .from(guardianshipsTable)
    .where(eq(guardianshipsTable.guardianUserId, parentUserId));

  const legacy = await db
    .select({ userId: usersTable.userId })
    .from(usersTable)
    .where(
      and(eq(usersTable.role, "participant"), eq(usersTable.parentEmail, parentEmail.toLowerCase())),
    );

  const ids = new Set<string>();
  for (const l of links) ids.add(l.childUserId);
  for (const s of legacy) ids.add(s.userId);
  return [...ids];
}

// Link a guardian to every child the inviter manages. Idempotent (existing
// links are left untouched). Exported so the register flow can consume a
// pending co-guardian invite when the invited person signs up.
export async function linkGuardianToInviterChildren(
  guardianUserId: string,
  inviterUserId: string,
  inviterEmail: string,
): Promise<number> {
  const childIds = await resolveChildIds(inviterUserId, inviterEmail);
  let linked = 0;
  for (const childUserId of childIds) {
    if (childUserId === guardianUserId) continue;
    const inserted = await db
      .insert(guardianshipsTable)
      .values({ guardianUserId, childUserId, isPrimary: false })
      .onConflictDoNothing()
      .returning({ id: guardianshipsTable.guardianshipId });
    if (inserted.length > 0) linked++;
  }
  return linked;
}

// GET /api/v1/parent/children — children linked to this parent, with each
// child's upcoming schedule and approved-hours total.
router.get("/v1/parent/children", authenticate, requireRole("parent"), async (req, res) => {
  const parentEmail = req.auth!.email.toLowerCase();

  const [parent] = await db
    .select({ userId: usersTable.userId, lastSeen: usersTable.parentLastSeenAt })
    .from(usersTable)
    .where(eq(usersTable.userId, req.auth!.userId))
    .limit(1);
  const lastSeen = parent?.lastSeen ?? null;

  const childIds = await resolveChildIds(req.auth!.userId, parentEmail);

  const children =
    childIds.length === 0
      ? []
      : await db
          .select({
            userId: usersTable.userId,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            email: usersTable.email,
            grade: usersTable.grade,
            school: usersTable.school,
            isManaged: usersTable.isManaged,
            organizationId: usersTable.organizationId,
          })
          .from(usersTable)
          .where(inArray(usersTable.userId, childIds))
          .orderBy(asc(usersTable.firstName));

  const today = new Date().toISOString().split("T")[0];
  const thresholdRows = await db.select().from(awardThresholdsTable);

  // External (outside-nonprofit) submissions for all children, grouped by child.
  const externalByChild = new Map<string, any[]>();
  if (childIds.length) {
    const exts = await db
      .select({
        externalSubmissionId: externalSubmissionsTable.externalSubmissionId,
        userId: externalSubmissionsTable.userId,
        activityName: externalSubmissionsTable.activityName,
        organizationName: externalSubmissionsTable.organizationName,
        volunteerDate: externalSubmissionsTable.volunteerDate,
        hoursWorked: externalSubmissionsTable.hoursWorked,
        status: externalSubmissionsTable.status,
        supervisorComments: externalSubmissionsTable.supervisorComments,
        submittedAt: externalSubmissionsTable.submittedAt,
      })
      .from(externalSubmissionsTable)
      .where(inArray(externalSubmissionsTable.userId, childIds));
    for (const e of exts) {
      const list = externalByChild.get(e.userId) ?? [];
      list.push({
        externalSubmissionId: e.externalSubmissionId,
        activityName: e.activityName,
        organizationName: e.organizationName,
        volunteerDate: e.volunteerDate,
        hoursWorked: Number(e.hoursWorked),
        status: e.status,
        supervisorComments: e.supervisorComments ?? null,
        submittedAt: e.submittedAt?.toISOString() ?? null,
      });
      externalByChild.set(e.userId, list);
    }
  }

  const result = [];
  for (const child of children) {
    const [internal] = await db
      .select({
        total: sql<string>`sum(coalesce(${volunteerSubmissionsTable.hoursWorked}, ${eventsTable.hoursValue}))`,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(
        and(
          eq(volunteerSubmissionsTable.userId, child.userId),
          eq(volunteerSubmissionsTable.status, "approved"),
        ),
      );
    const [manual] = await db
      .select({ total: sum(manualHoursTable.hours) })
      .from(manualHoursTable)
      .where(eq(manualHoursTable.userId, child.userId));

    const approvedExternal = (externalByChild.get(child.userId) ?? [])
      .filter((e) => e.status === "approved")
      .reduce((sum, e) => sum + Number(e.hoursWorked ?? 0), 0);

    const totalApprovedHours =
      Number(internal?.total ?? 0) + Number(manual?.total ?? 0) + approvedExternal;

    const regs = await db
      .select({
        registrationId: eventRegistrationsTable.registrationId,
        eventId: eventRegistrationsTable.eventId,
        status: eventRegistrationsTable.status,
        registeredAt: eventRegistrationsTable.registeredAt,
        eventTitle: eventsTable.title,
        slotLabel: eventsTable.slotLabel,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        location: eventsTable.location,
      })
      .from(eventRegistrationsTable)
      .leftJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
      .where(
        and(
          eq(eventRegistrationsTable.userId, child.userId),
          inArray(eventRegistrationsTable.status, ["registered", "attended"]),
          gte(eventsTable.eventDate, today),
        ),
      )
      .orderBy(asc(eventsTable.eventDate));

    // Past events the child was signed up for / attended — the parent can
    // submit their hours here (managed children have no login of their own).
    const pastRegs = await db
      .select({
        registrationId: eventRegistrationsTable.registrationId,
        eventId: eventRegistrationsTable.eventId,
        status: eventRegistrationsTable.status,
        registeredAt: eventRegistrationsTable.registeredAt,
        eventTitle: eventsTable.title,
        slotLabel: eventsTable.slotLabel,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        location: eventsTable.location,
        hoursValue: eventsTable.hoursValue,
        supervisorFirstName: parentSupervisorUsers.firstName,
        supervisorLastName: parentSupervisorUsers.lastName,
      })
      .from(eventRegistrationsTable)
      .leftJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
      .leftJoin(parentSupervisorUsers, eq(eventsTable.supervisorId, parentSupervisorUsers.userId))
      .where(
        and(
          eq(eventRegistrationsTable.userId, child.userId),
          inArray(eventRegistrationsTable.status, ["registered", "attended"]),
          sql`${eventsTable.eventDate} < ${today}`,
        ),
      )
      .orderBy(sql`${eventsTable.eventDate} DESC`);

    // The child's submission status per event (to show pending/approved),
    // plus when it was submitted (for the review-status line).
    const childSubs = await db
      .select({
        eventId: volunteerSubmissionsTable.eventId,
        status: volunteerSubmissionsTable.status,
        submittedAt: volunteerSubmissionsTable.submittedAt,
      })
      .from(volunteerSubmissionsTable)
      .where(eq(volunteerSubmissionsTable.userId, child.userId));
    const subStatus = new Map(childSubs.map((s) => [s.eventId, s.status]));
    const subSubmittedAt = new Map(childSubs.map((s) => [s.eventId, s.submittedAt]));

    result.push({
      userId: child.userId,
      firstName: child.firstName,
      lastName: child.lastName,
      email: child.email,
      grade: child.grade,
      school: child.school,
      isManaged: child.isManaged,
      totalApprovedHours,
      thresholds: thresholdsForGrade(thresholdRows, child.grade, child.organizationId ?? null),
      externalSubmissions: externalByChild.get(child.userId) ?? [],
      upcomingRegistrations: regs.map((r) => ({
        registrationId: r.registrationId,
        eventId: r.eventId,
        eventTitle: r.slotLabel ? `${r.eventTitle} — ${r.slotLabel}` : (r.eventTitle ?? null),
        eventDate: r.eventDate ?? null,
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        location: r.location ?? null,
        status: r.status,
        isNew: lastSeen ? r.registeredAt > lastSeen : false,
        hoursStatus: subStatus.get(r.eventId) ?? null,
      })),
      pastRegistrations: pastRegs.map((r) => ({
        registrationId: r.registrationId,
        eventId: r.eventId,
        eventTitle: r.slotLabel ? `${r.eventTitle} — ${r.slotLabel}` : (r.eventTitle ?? null),
        eventDate: r.eventDate ?? null,
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        location: r.location ?? null,
        status: r.status,
        isNew: false,
        hoursStatus: subStatus.get(r.eventId) ?? null,
        hoursValue: r.hoursValue != null ? Number(r.hoursValue) : null,
        supervisorName:
          r.supervisorFirstName || r.supervisorLastName
            ? `${r.supervisorFirstName ?? ""} ${r.supervisorLastName ?? ""}`.trim()
            : null,
        submittedAt: subSubmittedAt.get(r.eventId)?.toISOString() ?? null,
      })),
    });
  }

  await db
    .update(usersTable)
    .set({ parentLastSeenAt: new Date() })
    .where(eq(usersTable.userId, req.auth!.userId));

  res.json(result);
});

// POST /api/v1/parent/children — add a managed child (no login of its own).
router.post("/v1/parent/children", authenticate, requireRole("parent"), async (req, res) => {
  const parsed = parseChild(req.body, false);
  if (!parsed.ok) {
    res.status(400).json({ error: "Please fill in the child's name, grade, and school." });
    return;
  }
  const { firstName, lastName, grade, school, organizationId } = parsed.value;

  // Every managed child must belong to an organization and the parent must
  // supply its join code (same rule as student self-signup).
  if (!organizationId) {
    res.status(400).json({ error: "Please select the child's organization." });
    return;
  }
  {
    const [org] = await db
      .select({ joinCode: organizationsTable.joinCode, name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.organizationId, organizationId))
      .limit(1);
    if (!org) {
      res.status(400).json({ error: "That organization doesn't exist." });
      return;
    }
    const code = typeof (req.body as { joinCode?: unknown })?.joinCode === "string"
      ? (req.body as { joinCode: string }).joinCode.trim()
      : "";
    if (!code) {
      res.status(400).json({ error: "A join code is required. Ask the program for it." });
      return;
    }
    if (!org.joinCode || code.toLowerCase() !== org.joinCode.toLowerCase()) {
      res.status(400).json({ error: `Incorrect join code for ${org.name}. Ask the program for the code.` });
      return;
    }
  }

  const [child] = await db
    .insert(usersTable)
    .values({
      firstName: firstName!,
      lastName: lastName!,
      email: null,
      passwordHash: null,
      role: "participant",
      isManaged: true,
      parentEmail: req.auth!.email.toLowerCase(),
      school: school!,
      grade: grade!,
      organizationId: organizationId ?? null,
    })
    .returning();

  await db.insert(guardianshipsTable).values({
    guardianUserId: req.auth!.userId,
    childUserId: child.userId,
    isPrimary: true,
  });

  res.status(201).json({
    userId: child.userId,
    firstName: child.firstName,
    lastName: child.lastName,
    grade: child.grade,
    school: child.school,
    isManaged: child.isManaged,
  });
});

// PATCH /api/v1/parent/children/:childId — edit a managed child's details.
router.patch(
  "/v1/parent/children/:childId",
  authenticate,
  requireRole("parent"),
  async (req, res) => {
    const { childId } = req.params as { childId: string };

    // The parent must be a guardian of this child.
    const [link] = await db
      .select({ id: guardianshipsTable.guardianshipId })
      .from(guardianshipsTable)
      .where(
        and(
          eq(guardianshipsTable.guardianUserId, req.auth!.userId),
          eq(guardianshipsTable.childUserId, childId),
        ),
      )
      .limit(1);
    if (!link) {
      res.status(404).json({ error: "Child not found." });
      return;
    }

    const parsed = parseChild(req.body, true);
    if (!parsed.ok) {
      res.status(400).json({ error: "Invalid input." });
      return;
    }

    // Only managed children can be edited by a parent; a self-managed student
    // (their own login) owns their own profile.
    const [child] = await db
      .select({ isManaged: usersTable.isManaged })
      .from(usersTable)
      .where(eq(usersTable.userId, childId))
      .limit(1);
    if (!child?.isManaged) {
      res.status(403).json({ error: "This child manages their own profile." });
      return;
    }

    const { firstName, lastName, grade, school, organizationId } = parsed.value;
    await db
      .update(usersTable)
      .set({
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(grade !== undefined ? { grade } : {}),
        ...(school !== undefined ? { school } : {}),
        ...(organizationId !== undefined ? { organizationId } : {}),
      })
      .where(eq(usersTable.userId, childId));

    res.json({ status: "ok", message: "Child updated." });
  },
);

// DELETE /api/v1/parent/children/:childId — remove a managed child from the
// parent's account. Only managed (grade 2–5, no login) children can be deleted;
// a self-managed student owns their own account. Cascades their registrations,
// submissions, and links.
router.delete("/v1/parent/children/:childId", authenticate, requireRole("parent"), async (req, res) => {
  const { childId } = req.params as { childId: string };
  const [link] = await db
    .select({ id: guardianshipsTable.guardianshipId })
    .from(guardianshipsTable)
    .where(and(eq(guardianshipsTable.guardianUserId, req.auth!.userId), eq(guardianshipsTable.childUserId, childId)))
    .limit(1);
  if (!link) {
    res.status(404).json({ error: "Child not found." });
    return;
  }
  const [child] = await db
    .select({ isManaged: usersTable.isManaged })
    .from(usersTable)
    .where(eq(usersTable.userId, childId))
    .limit(1);
  if (!child?.isManaged) {
    res.status(403).json({ error: "This student has their own account and can't be removed from here." });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.userId, childId));
  res.json({ ok: true });
});

// DELETE /api/v1/parent/children/:childId/register — withdraw a managed child
// from an upcoming event (only while still "registered").
router.delete("/v1/parent/children/:childId/register", authenticate, requireRole("parent"), async (req, res) => {
  const { childId } = req.params as { childId: string };
  const eventId = typeof (req.body as { eventId?: unknown })?.eventId === "string" ? (req.body as { eventId: string }).eventId : "";
  const childIds = await resolveChildIds(req.auth!.userId, req.auth!.email.toLowerCase());
  if (!childIds.includes(childId)) {
    res.status(404).json({ error: "Child not found." });
    return;
  }
  const [reg] = await db
    .select({ id: eventRegistrationsTable.registrationId, status: eventRegistrationsTable.status })
    .from(eventRegistrationsTable)
    .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, childId)))
    .limit(1);
  if (!reg) {
    res.status(404).json({ error: "This child isn't signed up for that event." });
    return;
  }
  if (reg.status !== "registered") {
    res.status(400).json({ error: "Can't withdraw after check-in or once hours are submitted." });
    return;
  }
  await db.delete(eventRegistrationsTable).where(eq(eventRegistrationsTable.registrationId, reg.id));
  res.json({ ok: true });
});

// POST /api/v1/parent/children/:childId/register — sign a managed child up for
// an event on their behalf. The parent must be a guardian of the child.
router.post(
  "/v1/parent/children/:childId/register",
  authenticate,
  requireRole("parent"),
  async (req, res) => {
    const { childId } = req.params as { childId: string };
    const eventIdRaw = (req.body as { eventId?: unknown })?.eventId;
    if (typeof eventIdRaw !== "string" || eventIdRaw.trim() === "") {
      res.status(400).json({ error: "A valid event is required." });
      return;
    }
    const eventId = eventIdRaw.trim();

    const [link] = await db
      .select({ id: guardianshipsTable.guardianshipId })
      .from(guardianshipsTable)
      .where(
        and(
          eq(guardianshipsTable.guardianUserId, req.auth!.userId),
          eq(guardianshipsTable.childUserId, childId),
        ),
      )
      .limit(1);
    if (!link) {
      res.status(404).json({ error: "Child not found." });
      return;
    }

    // Only managed (grade 2–5, no login) children can be signed up by a parent.
    // Older students with their own login manage their own sign-ups; the parent
    // is view-only.
    const [childRow] = await db
      .select({ isManaged: usersTable.isManaged })
      .from(usersTable)
      .where(eq(usersTable.userId, childId))
      .limit(1);
    if (!childRow?.isManaged) {
      res.status(403).json({ error: "This student signs up on their own account — you have view-only access." });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.eventId, eventId))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }
    if (event.status !== "open") {
      res.status(400).json({ error: "Sign-ups aren't open for this event yet." });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    if (event.eventDate < today) {
      res.status(400).json({ error: "Cannot register for a past event." });
      return;
    }

    // Enforce org gating and per-event grade limits for the child.
    const [child] = await db
      .select({ organizationId: usersTable.organizationId, grade: usersTable.grade })
      .from(usersTable)
      .where(eq(usersTable.userId, childId))
      .limit(1);
    if (event.organizationId && !event.openToAll && (child?.organizationId ?? null) !== event.organizationId) {
      res.status(403).json({ error: "This opportunity isn't open to your child's organization." });
      return;
    }
    if (event.minGrade != null || event.maxGrade != null) {
      const g = child?.grade ? Number(child.grade) : null;
      if (g == null || (event.minGrade != null && g < event.minGrade) || (event.maxGrade != null && g > event.maxGrade)) {
        const range =
          event.minGrade != null && event.maxGrade != null ? `grades ${event.minGrade}–${event.maxGrade}`
            : event.minGrade != null ? `grade ${event.minGrade} and up` : `grade ${event.maxGrade} and below`;
        res.status(403).json({ error: `This opportunity is for ${range}.` });
        return;
      }
    }

    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.eventId, eventId));
    if (Number(cnt) >= event.maxCapacity) {
      res.status(400).json({ error: "This event has reached its maximum registration limit." });
      return;
    }

    const [existing] = await db
      .select({ id: eventRegistrationsTable.registrationId })
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, eventId),
          eq(eventRegistrationsTable.userId, childId),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "This child is already registered for this event." });
      return;
    }

    const [registration] = await db
      .insert(eventRegistrationsTable)
      .values({ eventId: eventId, userId: childId, status: "registered" })
      .returning();

    res.status(201).json({
      registrationId: registration.registrationId,
      eventId: registration.eventId,
      childUserId: childId,
      status: registration.status,
      registeredAt: registration.registeredAt.toISOString(),
      eventTitle: event.title,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
    });

    // Notify the event's supervisor that a volunteer signed up.
    const [childRow2] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.userId, childId)).limit(1);
    const [sup] = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, emailNotifications: usersTable.emailNotifications })
      .from(usersTable).where(eq(usersTable.userId, event.supervisorId)).limit(1);
    if (sup?.email) {
      const volName = `${childRow2?.firstName ?? ""} ${childRow2?.lastName ?? ""}`.trim() || "A volunteer";
      void notifyUser({
        userId: event.supervisorId,
        category: "signup",
        line: `${volName} signed up for "${event.title}" (${event.eventDate}).`,
        sendNow: () => sendSignupNotification(sup.email!, `${sup.firstName} ${sup.lastName}`.trim(), volName, event.title, event.eventDate),
      }).catch((err) => req.log.error({ err }, "supervisor signup notification failed"));
    }
  },
);

// POST /api/v1/parent/children/:childId/hours — a parent submits a managed
// child's actual hours for a past event, on the child's behalf. Still goes to
// the supervisor for approval, exactly like a student's own submission.
router.post(
  "/v1/parent/children/:childId/hours",
  authenticate,
  requireRole("parent"),
  async (req, res) => {
    const { childId } = req.params as { childId: string };
    const body = (req.body ?? {}) as { eventId?: unknown; hoursWorked?: unknown };
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const hours = Number(body.hoursWorked);
    if (!eventId || !Number.isFinite(hours) || hours < 0.25 || hours > 24) {
      res.status(400).json({ error: "A valid event and hours (0.25–24) are required." });
      return;
    }

    // The parent must guard this child.
    const parentEmail = req.auth!.email.toLowerCase();
    const childIds = await resolveChildIds(req.auth!.userId, parentEmail);
    if (!childIds.includes(childId)) {
      res.status(404).json({ error: "Child not found." });
      return;
    }
    const [managedRow] = await db
      .select({ isManaged: usersTable.isManaged })
      .from(usersTable)
      .where(eq(usersTable.userId, childId))
      .limit(1);
    if (!managedRow?.isManaged) {
      res.status(403).json({ error: "This student submits hours on their own account — you have view-only access." });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found." }); return; }
    if (event.eventDate >= today) {
      res.status(400).json({ error: "You can submit hours only after the event has ended." });
      return;
    }

    const [reg] = await db
      .select({ status: eventRegistrationsTable.status })
      .from(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, childId)))
      .limit(1);
    if (reg && reg.status === "no_show") {
      res.status(400).json({ error: "Your child was marked as a no-show for this event." });
      return;
    }
    // Walk-in (attended without signing up): if the child wasn't registered but
    // is eligible for the event, create an attended registration on the fly.
    // The supervisor still reviews the hours.
    if (!reg) {
      const [child] = await db
        .select({ organizationId: usersTable.organizationId, grade: usersTable.grade })
        .from(usersTable)
        .where(eq(usersTable.userId, childId))
        .limit(1);
      if (event.organizationId && !event.openToAll && (child?.organizationId ?? null) !== event.organizationId) {
        res.status(403).json({ error: "This opportunity isn't open to your child's organization." });
        return;
      }
      if (event.minGrade != null || event.maxGrade != null) {
        const g = child?.grade ? Number(child.grade) : null;
        if (g == null || (event.minGrade != null && g < event.minGrade) || (event.maxGrade != null && g > event.maxGrade)) {
          res.status(403).json({ error: "This opportunity's grade range doesn't include your child." });
          return;
        }
      }
      await db.insert(eventRegistrationsTable).values({ eventId, userId: childId, status: "attended" });
    }

    const [existing] = await db
      .select({ submissionId: volunteerSubmissionsTable.submissionId, status: volunteerSubmissionsTable.status })
      .from(volunteerSubmissionsTable)
      .where(and(eq(volunteerSubmissionsTable.userId, childId), eq(volunteerSubmissionsTable.eventId, eventId)))
      .limit(1);
    if (existing && existing.status === "approved") {
      res.status(409).json({ error: "These hours are already approved and can't be changed." });
      return;
    }

    if (existing) {
      await db
        .update(volunteerSubmissionsTable)
        .set({ hoursWorked: String(hours), status: "pending", reviewedAt: null })
        .where(eq(volunteerSubmissionsTable.submissionId, existing.submissionId));
    } else {
      await db
        .insert(volunteerSubmissionsTable)
        .values({ userId: childId, eventId, hoursWorked: String(hours), status: "pending" });
    }
    res.status(201).json({ ok: true });
  },
);

// GET /api/v1/parent/co-guardians — other guardians who share this parent's
// children (linked) plus outstanding invites this parent has sent (pending).
router.get("/v1/parent/co-guardians", authenticate, requireRole("parent"), async (req, res) => {
  const parentEmail = req.auth!.email.toLowerCase();
  const childIds = await resolveChildIds(req.auth!.userId, parentEmail);

  const linked =
    childIds.length === 0
      ? []
      : await db
          .selectDistinct({
            userId: usersTable.userId,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            email: usersTable.email,
          })
          .from(guardianshipsTable)
          .innerJoin(usersTable, eq(guardianshipsTable.guardianUserId, usersTable.userId))
          .where(inArray(guardianshipsTable.childUserId, childIds));

  const invites = await db
    .select({ email: guardianInvitesTable.email })
    .from(guardianInvitesTable)
    .where(eq(guardianInvitesTable.inviterUserId, req.auth!.userId));

  res.json({
    linked: linked
      .filter((g) => g.userId !== req.auth!.userId)
      .map((g) => ({
        userId: g.userId,
        name: `${g.firstName} ${g.lastName}`.trim(),
        email: g.email,
        status: "linked" as const,
      })),
    pending: invites.map((i) => ({ email: i.email, status: "pending" as const })),
  });
});

// POST /api/v1/parent/co-guardians — invite a second guardian by email. If they
// already have a parent account, link them now; otherwise store a pending
// invite that is consumed when they register.
router.post("/v1/parent/co-guardians", authenticate, requireRole("parent"), async (req, res) => {
  const raw = (req.body as { email?: unknown })?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }
  if (email === req.auth!.email.toLowerCase()) {
    res.status(400).json({ error: "That's your own email." });
    return;
  }

  const [existing] = await db
    .select({ userId: usersTable.userId, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing) {
    if (existing.role !== "parent") {
      res.status(400).json({ error: "That email belongs to a non-parent account." });
      return;
    }
    const count = await linkGuardianToInviterChildren(
      existing.userId,
      req.auth!.userId,
      req.auth!.email.toLowerCase(),
    );
    res.status(200).json({ status: "linked", linkedChildren: count });
    return;
  }

  await db
    .insert(guardianInvitesTable)
    .values({ email, inviterUserId: req.auth!.userId })
    .onConflictDoNothing();

  // Email the co-guardian with join instructions.
  const [inviter] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.userId, req.auth!.userId))
    .limit(1);
  const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") || "A parent";
  sendCoGuardianInvite(email, inviterName).catch((err) => req.log.error({ err }, "co-guardian email failed"));

  res.status(201).json({ status: "invited" });
});

export default router;
