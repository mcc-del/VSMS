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
} from "@workspace/db";
import { eq, and, inArray, gte, sum, sql, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { sendCoGuardianInvite } from "../lib/email";

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
          })
          .from(usersTable)
          .where(inArray(usersTable.userId, childIds))
          .orderBy(asc(usersTable.firstName));

  const today = new Date().toISOString().split("T")[0];

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

    const totalApprovedHours = Number(internal?.total ?? 0) + Number(manual?.total ?? 0);

    const regs = await db
      .select({
        registrationId: eventRegistrationsTable.registrationId,
        eventId: eventRegistrationsTable.eventId,
        status: eventRegistrationsTable.status,
        registeredAt: eventRegistrationsTable.registeredAt,
        eventTitle: eventsTable.title,
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

    result.push({
      userId: child.userId,
      firstName: child.firstName,
      lastName: child.lastName,
      email: child.email,
      grade: child.grade,
      school: child.school,
      isManaged: child.isManaged,
      totalApprovedHours,
      upcomingRegistrations: regs.map((r) => ({
        registrationId: r.registrationId,
        eventId: r.eventId,
        eventTitle: r.eventTitle ?? null,
        eventDate: r.eventDate ?? null,
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        location: r.location ?? null,
        status: r.status,
        isNew: lastSeen ? r.registeredAt > lastSeen : false,
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

  // If the chosen org has a join code, the parent must supply it (same rule as
  // student self-signup — keeps org membership honest).
  if (organizationId) {
    const [org] = await db
      .select({ joinCode: organizationsTable.joinCode, name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.organizationId, organizationId))
      .limit(1);
    if (org?.joinCode) {
      const code = typeof (req.body as { joinCode?: unknown })?.joinCode === "string"
        ? (req.body as { joinCode: string }).joinCode.trim()
        : "";
      if (code.toLowerCase() !== org.joinCode.toLowerCase()) {
        res.status(400).json({ error: `Incorrect join code for ${org.name}. Ask the program for the code.` });
        return;
      }
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

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.eventId, eventId))
      .limit(1);
    if (!event) {
      res.status(404).json({ error: "Event not found." });
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    if (event.eventDate < today) {
      res.status(400).json({ error: "Cannot register for a past event." });
      return;
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
