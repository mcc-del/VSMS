import { Router } from "express";
import {
  db,
  eventsTable,
  usersTable,
  eventRegistrationsTable,
  organizationsTable,
  guardianshipsTable,
  volunteerSubmissionsTable,
} from "@workspace/db";
import { eq, count, sql, and, inArray } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateEventBody, UpdateEventBody } from "@workspace/api-zod";
import { sendRegistrationConfirmation, sendEventBroadcast, sendSignupNotification } from "../lib/email";
import { gradeToLevel, orgAllowsLevel, type SchoolLevel } from "../lib/levels";
import { managedOrgIds, canManageOrg } from "../lib/org-scope";

const router = Router();

function calculateDurationHours(startTime: string, endTime: string): number | null {
  const [startHour, startMinute] = startTime.slice(0, 5).split(":").map(Number);
  const [endHour, endMinute] = endTime.slice(0, 5).split(":").map(Number);
  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return null;
  const minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) return null;
  return Math.round((minutes / 60) * 100) / 100;
}

function formatEvent(
  e: {
    eventId: string;
    title: string;
    description: string;
    slotLabel?: string | null;
    location: string;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    eventDate: string;
    startTime: string;
    endTime: string;
    hoursValue: string;
    maxCapacity: number;
    minGrade?: number | null;
    maxGrade?: number | null;
    imageUrl: string | null;
    supervisorId: string;
    supervisorFirstName: string | null;
    supervisorLastName: string | null;
    supervisorEmail: string | null;
    supervisorPhone?: string | null;
    organizationId?: string | null;
    organizationName?: string | null;
  },
  registrationCount: number,
  myRegistrationStatus: string | null,
  eligibleForMe: boolean = true,
) {
  return {
    eventId: e.eventId,
    title: e.title,
    description: e.description,
    slotLabel: e.slotLabel ?? null,
    location: e.location,
    street: e.street ?? null,
    city: e.city ?? null,
    state: e.state ?? null,
    zip: e.zip ?? null,
    eventDate: e.eventDate,
    startTime: e.startTime,
    endTime: e.endTime,
    hoursValue: calculateDurationHours(e.startTime, e.endTime) ?? Number(e.hoursValue),
    maxCapacity: e.maxCapacity,
    minGrade: e.minGrade ?? null,
    maxGrade: e.maxGrade ?? null,
    imageUrl: e.imageUrl ?? null,
    supervisorId: e.supervisorId,
    supervisorName: e.supervisorFirstName
      ? `${e.supervisorFirstName} ${e.supervisorLastName}`
      : null,
    supervisorEmail: e.supervisorEmail ?? null,
    supervisorPhone: e.supervisorPhone ?? null,
    organizationId: e.organizationId ?? null,
    organizationName: e.organizationName ?? null,
    eligibleForMe,
    registrationCount,
    myRegistrationStatus,
  };
}

// GET /api/v1/events
router.get("/v1/events", authenticate, async (req, res) => {
  const userId = req.auth?.userId;

  // Determine the viewer's school level (participants only) so we can flag
  // which opportunities they're eligible for by org grade-band.
  let viewerLevel: SchoolLevel | null = null;
  let viewerIsParticipant = false;
  let viewerOrgId: string | null = null;
  let viewerGrade: number | null = null;
  // A parent browsing on behalf of a managed child passes ?childId=... — we then
  // filter opportunities by the CHILD's org/grade and show the child's sign-ups.
  const childId = typeof req.query.childId === "string" ? req.query.childId : null;
  let effectiveUserId = userId; // whose registrations to reflect

  if (childId && userId) {
    const [link] = await db
      .select({ id: guardianshipsTable.guardianshipId })
      .from(guardianshipsTable)
      .where(and(eq(guardianshipsTable.guardianUserId, userId), eq(guardianshipsTable.childUserId, childId)))
      .limit(1);
    if (link) {
      const [child] = await db
        .select({ grade: usersTable.grade, organizationId: usersTable.organizationId })
        .from(usersTable)
        .where(eq(usersTable.userId, childId))
        .limit(1);
      viewerIsParticipant = true;
      viewerLevel = gradeToLevel(child?.grade);
      viewerOrgId = child?.organizationId ?? null;
      viewerGrade = child?.grade ? Number(child.grade) : null;
      effectiveUserId = childId;
    }
  } else if (userId) {
    const [viewer] = await db
      .select({
        role: usersTable.role,
        grade: usersTable.grade,
        organizationId: usersTable.organizationId,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    viewerIsParticipant = viewer?.role === "participant";
    if (viewerIsParticipant) {
      viewerLevel = gradeToLevel(viewer?.grade);
      viewerOrgId = viewer?.organizationId ?? null;
      viewerGrade = viewer?.grade ? Number(viewer.grade) : null;
    }
  }

  const events = await db
    .select({
      eventId: eventsTable.eventId,
      title: eventsTable.title,
      description: eventsTable.description,
      slotLabel: eventsTable.slotLabel,
      location: eventsTable.location,
      street: eventsTable.street,
      city: eventsTable.city,
      state: eventsTable.state,
      zip: eventsTable.zip,
      eventDate: eventsTable.eventDate,
      startTime: eventsTable.startTime,
      endTime: eventsTable.endTime,
      hoursValue: eventsTable.hoursValue,
      maxCapacity: eventsTable.maxCapacity,
      minGrade: eventsTable.minGrade,
      maxGrade: eventsTable.maxGrade,
      imageUrl: eventsTable.imageUrl,
      supervisorId: eventsTable.supervisorId,
      supervisorFirstName: usersTable.firstName,
      supervisorLastName: usersTable.lastName,
      supervisorEmail: usersTable.email,
      supervisorPhone: usersTable.phone,
      organizationId: eventsTable.organizationId,
      organizationName: organizationsTable.name,
      allowsElementary: organizationsTable.allowsElementary,
      allowsMiddle: organizationsTable.allowsMiddle,
      allowsHigh: organizationsTable.allowsHigh,
    })
    .from(eventsTable)
    .leftJoin(usersTable, eq(eventsTable.supervisorId, usersTable.userId))
    .leftJoin(organizationsTable, eq(eventsTable.organizationId, organizationsTable.organizationId))
    .orderBy(sql`${eventsTable.eventDate} DESC`);

  // Fetch registration counts
  const regCounts: Record<string, number> = {};
  if (events.length > 0) {
    const rows = await db
      .select({ eventId: eventRegistrationsTable.eventId, cnt: count() })
      .from(eventRegistrationsTable)
      .groupBy(eventRegistrationsTable.eventId);
    rows.forEach((r) => {
      regCounts[r.eventId] = Number(r.cnt);
    });
  }

  // Fetch registrations for the effective user (the child when a parent browses)
  const myRegMap: Record<string, string> = {};
  if (effectiveUserId) {
    const myRegs = await db
      .select()
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.userId, effectiveUserId));
    myRegs.forEach((r) => {
      myRegMap[r.eventId] = r.status;
    });
  }

  const visible = events.filter((e) => {
    // Admins/supervisors (and any non-participant viewer) see everything.
    if (!viewerIsParticipant) return true;
    // Open-to-all opportunities (no org) are visible to every participant.
    if (!e.organizationId) return true;
    // Org-gated opportunities are visible only to that org's students. This is
    // a safety boundary (R2): e.g. Medina on-site events, which may share
    // building access or a QR code, must never appear to non-Medina students.
    return e.organizationId === viewerOrgId;
  });

  res.json(
    visible.map((e) => {
      let eligibleForMe = true;
      if (viewerIsParticipant) {
        // Org grade-band eligibility (only when the event is org-tied).
        if (e.organizationId) {
          eligibleForMe = orgAllowsLevel(
            { allowsElementary: e.allowsElementary ?? true, allowsMiddle: e.allowsMiddle ?? true, allowsHigh: e.allowsHigh ?? true },
            viewerLevel,
          );
        }
        // Per-event grade floor/ceiling (e.g. checkout shift is grade 4+).
        if (eligibleForMe && (e.minGrade != null || e.maxGrade != null)) {
          if (viewerGrade == null) eligibleForMe = false;
          else if (e.minGrade != null && viewerGrade < e.minGrade) eligibleForMe = false;
          else if (e.maxGrade != null && viewerGrade > e.maxGrade) eligibleForMe = false;
        }
      }
      return formatEvent(e, regCounts[e.eventId] ?? 0, myRegMap[e.eventId] ?? null, eligibleForMe);
    }),
  );
});

// GET /api/v1/events/my-registrations  (MUST be before /:eventId)
router.get(
  "/v1/events/my-registrations",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const userId = req.auth!.userId;

    const rows = await db
      .select({
        registrationId: eventRegistrationsTable.registrationId,
        eventId: eventRegistrationsTable.eventId,
        userId: eventRegistrationsTable.userId,
        status: eventRegistrationsTable.status,
        registeredAt: eventRegistrationsTable.registeredAt,
        eventTitle: eventsTable.title,
        eventDate: eventsTable.eventDate,
        startTime: eventsTable.startTime,
        endTime: eventsTable.endTime,
        location: eventsTable.location,
        hoursValue: eventsTable.hoursValue,
        imageUrl: eventsTable.imageUrl,
        supervisorFirstName: usersTable.firstName,
        supervisorLastName: usersTable.lastName,
        supervisorEmail: usersTable.email,
      })
      .from(eventRegistrationsTable)
      .leftJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
      .leftJoin(usersTable, eq(eventsTable.supervisorId, usersTable.userId))
      .where(eq(eventRegistrationsTable.userId, userId))
      .orderBy(eventsTable.eventDate);

    res.json(
      rows.map((r) => ({
        registrationId: r.registrationId,
        eventId: r.eventId,
        userId: r.userId,
        status: r.status,
        registeredAt: r.registeredAt.toISOString(),
        eventTitle: r.eventTitle ?? null,
        eventDate: r.eventDate ?? null,
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        location: r.location ?? null,
        hoursValue: r.startTime && r.endTime
          ? calculateDurationHours(r.startTime, r.endTime)
          : r.hoursValue ? Number(r.hoursValue) : null,
        imageUrl: r.imageUrl ?? null,
        supervisorName: r.supervisorFirstName
          ? `${r.supervisorFirstName} ${r.supervisorLastName}`
          : null,
        supervisorEmail: r.supervisorEmail ?? null,
      })),
    );
  },
);

// GET /api/v1/events/:eventId
router.get("/v1/events/:eventId", authenticate, async (req, res) => {
  const { eventId } = req.params as { eventId: string };
  const userId = req.auth?.userId;

  const [event] = await db
    .select({
      eventId: eventsTable.eventId,
      title: eventsTable.title,
      description: eventsTable.description,
      slotLabel: eventsTable.slotLabel,
      location: eventsTable.location,
      street: eventsTable.street,
      city: eventsTable.city,
      state: eventsTable.state,
      zip: eventsTable.zip,
      eventDate: eventsTable.eventDate,
      startTime: eventsTable.startTime,
      endTime: eventsTable.endTime,
      hoursValue: eventsTable.hoursValue,
      maxCapacity: eventsTable.maxCapacity,
      minGrade: eventsTable.minGrade,
      maxGrade: eventsTable.maxGrade,
      imageUrl: eventsTable.imageUrl,
      supervisorId: eventsTable.supervisorId,
      supervisorFirstName: usersTable.firstName,
      supervisorLastName: usersTable.lastName,
      supervisorEmail: usersTable.email,
      supervisorPhone: usersTable.phone,
      organizationId: eventsTable.organizationId,
      organizationName: organizationsTable.name,
    })
    .from(eventsTable)
    .leftJoin(usersTable, eq(eventsTable.supervisorId, usersTable.userId))
    .leftJoin(organizationsTable, eq(eventsTable.organizationId, organizationsTable.organizationId))
    .where(eq(eventsTable.eventId, eventId))
    .limit(1);

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(eventRegistrationsTable)
    .where(eq(eventRegistrationsTable.eventId, eventId));

  let myRegistrationStatus: string | null = null;
  if (userId) {
    const [myReg] = await db
      .select()
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, eventId),
          eq(eventRegistrationsTable.userId, userId),
        ),
      )
      .limit(1);
    myRegistrationStatus = myReg?.status ?? null;
  }

  res.json(formatEvent(event, Number(cnt), myRegistrationStatus));
});

// POST /api/v1/events/:eventId/register
router.post(
  "/v1/events/:eventId/register",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const userId = req.auth!.userId;

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.eventId, eventId))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Enforce org gating (R2) and per-event grade limits.
    const [viewer] = await db
      .select({ organizationId: usersTable.organizationId, grade: usersTable.grade })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (event.organizationId && (viewer?.organizationId ?? null) !== event.organizationId) {
      res.status(403).json({ error: "This opportunity isn't open to your organization." });
      return;
    }
    if (event.minGrade != null || event.maxGrade != null) {
      const g = viewer?.grade ? Number(viewer.grade) : null;
      if (
        g == null ||
        (event.minGrade != null && g < event.minGrade) ||
        (event.maxGrade != null && g > event.maxGrade)
      ) {
        const range =
          event.minGrade != null && event.maxGrade != null
            ? `grades ${event.minGrade}–${event.maxGrade}`
            : event.minGrade != null
              ? `grade ${event.minGrade} and up`
              : `grade ${event.maxGrade} and below`;
        res.status(403).json({ error: `This opportunity is for ${range}.` });
        return;
      }
    }

    const today = new Date().toISOString().split("T")[0];
    if (event.eventDate < today) {
      res.status(400).json({ error: "Cannot register for a past event." });
      return;
    }

    // Check capacity
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.eventId, eventId));

    if (Number(cnt) >= event.maxCapacity) {
      res
        .status(400)
        .json({ error: "This event has reached its maximum registration limit." });
      return;
    }

    // Check duplicate
    const [existing] = await db
      .select()
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, eventId),
          eq(eventRegistrationsTable.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "You are already registered for this event." });
      return;
    }

    const [registration] = await db
      .insert(eventRegistrationsTable)
      .values({ eventId, userId, status: "registered" })
      .returning();

    const [supervisor] = await db
      .select({
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
        emailNotifications: usersTable.emailNotifications,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, event.supervisorId))
      .limit(1);

    res.status(201).json({
      registrationId: registration.registrationId,
      eventId: registration.eventId,
      userId: registration.userId,
      status: registration.status,
      registeredAt: registration.registeredAt.toISOString(),
      eventTitle: event.title,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      hoursValue: calculateDurationHours(event.startTime, event.endTime) ?? Number(event.hoursValue),
      imageUrl: event.imageUrl ?? null,
      supervisorName: supervisor
        ? `${supervisor.firstName} ${supervisor.lastName}`
        : null,
      supervisorEmail: supervisor?.email ?? null,
      supervisorPhone: supervisor?.phone ?? null,
    });

    // Fire-and-forget confirmation email (does not block the HTTP response)
    const [user] = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);

    if (user && user.email) {
      const toName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
      sendRegistrationConfirmation(user.email, toName, {
        title: event.title,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        slotLabel: event.slotLabel ?? null,
        description: event.description ?? null,
        street: event.street ?? null,
        city: event.city ?? null,
        state: event.state ?? null,
        zip: event.zip ?? null,
        supervisorName: supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : null,
        supervisorPhone: supervisor?.phone ?? null,
        hoursValue: calculateDurationHours(event.startTime, event.endTime) ?? Number(event.hoursValue),
      }).catch((err) => {
        req.log.error({ err }, "Unhandled error sending registration confirmation");
      });

      // Notify the event's supervisor that someone signed up (if they haven't
      // turned activity emails off).
      if (supervisor?.email && supervisor.emailNotifications) {
        sendSignupNotification(
          supervisor.email,
          `${supervisor.firstName} ${supervisor.lastName}`.trim(),
          toName,
          event.title,
          event.eventDate,
        ).catch((err) => req.log.error({ err }, "Unhandled error sending signup notification"));
      }
    }
  },
);

// DELETE /api/v1/events/:eventId/register — participant withdraws their own
// sign-up (only while still "registered"; not after check-in / hours submitted).
router.delete(
  "/v1/events/:eventId/register",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const userId = req.auth!.userId;

    const [existing] = await db
      .select({ id: eventRegistrationsTable.registrationId, status: eventRegistrationsTable.status })
      .from(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, userId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "You're not signed up for this opportunity." });
      return;
    }
    if (existing.status !== "registered") {
      res.status(400).json({ error: "You can't withdraw after checking in or submitting hours." });
      return;
    }

    await db
      .delete(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, userId)));

    res.json({ ok: true });
  },
);

// Can the current supervisor/admin/org-admin manage this event's roster?
async function canManageEvent(
  role: string,
  userId: string,
  event: { supervisorId: string; organizationId: string | null },
): Promise<boolean> {
  if (role === "admin") return true;
  if (role === "supervisor") return event.supervisorId === userId;
  if (role === "org_admin") {
    const managed = await managedOrgIds(userId, role);
    return canManageOrg(managed, event.organizationId);
  }
  return false;
}

// GET /api/v1/events/:eventId/roster — who signed up, with attendance + hours status.
router.get(
  "/v1/events/:eventId/roster",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only manage events you supervise." });
      return;
    }
    const rows = await db
      .select({
        userId: eventRegistrationsTable.userId,
        status: eventRegistrationsTable.status,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        grade: usersTable.grade,
      })
      .from(eventRegistrationsTable)
      .leftJoin(usersTable, eq(eventRegistrationsTable.userId, usersTable.userId))
      .where(eq(eventRegistrationsTable.eventId, eventId));

    const subs = await db
      .select({ userId: volunteerSubmissionsTable.userId, status: volunteerSubmissionsTable.status })
      .from(volunteerSubmissionsTable)
      .where(eq(volunteerSubmissionsTable.eventId, eventId));
    const subMap = new Map(subs.map((s) => [s.userId, s.status]));

    res.json({
      eventId,
      eventTitle: event.title,
      participants: rows.map((r) => ({
        userId: r.userId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
        grade: r.grade ?? null,
        status: r.status,
        hoursStatus: subMap.get(r.userId) ?? null,
      })),
    });
  },
);

// POST /api/v1/events/:eventId/attendance — supervisor sets a participant's
// attendance (check-in = attended; also no_show / registered).
router.post(
  "/v1/events/:eventId/attendance",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const body = (req.body ?? {}) as { userId?: unknown; status?: unknown };
    const targetUserId = typeof body.userId === "string" ? body.userId : "";
    const status = body.status;
    if (!targetUserId || (status !== "attended" && status !== "no_show" && status !== "registered")) {
      res.status(400).json({ error: "userId and a valid status are required." });
      return;
    }
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only manage events you supervise." });
      return;
    }
    const result = await db
      .update(eventRegistrationsTable)
      .set({ status })
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, targetUserId)))
      .returning();
    if (result.length === 0) { res.status(404).json({ error: "That participant isn't registered." }); return; }
    res.json({ ok: true, status });
  },
);

// POST /api/v1/events/:eventId/broadcast — supervisor emails everyone who is
// registered for the event (and optionally the guardians of managed children).
router.post(
  "/v1/events/:eventId/broadcast",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const body = (req.body ?? {}) as { subject?: unknown; message?: unknown; includeGuardians?: unknown };
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const includeGuardians = body.includeGuardians !== false; // default on
    if (subject.length < 2 || message.length < 2) {
      res.status(400).json({ error: "A subject and a message are both required." });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only message events you supervise." });
      return;
    }

    // Registered participants (skip no-shows), with their own email + parentEmail.
    const regs = await db
      .select({
        userId: eventRegistrationsTable.userId,
        status: eventRegistrationsTable.status,
        email: usersTable.email,
        parentEmail: usersTable.parentEmail,
        isManaged: usersTable.isManaged,
      })
      .from(eventRegistrationsTable)
      .leftJoin(usersTable, eq(eventRegistrationsTable.userId, usersTable.userId))
      .where(eq(eventRegistrationsTable.eventId, eventId));

    const emails = new Set<string>();
    const childIds: string[] = [];
    for (const r of regs) {
      if (r.status === "no_show") continue;
      if (r.email) emails.add(r.email.toLowerCase());
      if (includeGuardians && r.parentEmail) emails.add(r.parentEmail.toLowerCase());
      if (includeGuardians && r.isManaged && r.userId) childIds.push(r.userId);
    }

    // Guardians of managed (elementary) children have no email on the child row.
    if (includeGuardians && childIds.length > 0) {
      const guardians = await db
        .select({ email: usersTable.email })
        .from(guardianshipsTable)
        .leftJoin(usersTable, eq(guardianshipsTable.guardianUserId, usersTable.userId))
        .where(inArray(guardianshipsTable.childUserId, childIds));
      for (const g of guardians) if (g.email) emails.add(g.email.toLowerCase());
    }

    const [sender] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.userId, req.auth!.userId))
      .limit(1);
    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : "your supervisor";

    const list = [...emails];
    const sent = await sendEventBroadcast(list, event.title, senderName, subject, message);
    res.json({ recipients: sent, emailConfigured: list.length === 0 ? true : sent > 0 });
  },
);

// POST /api/v1/events/:eventId/checkin
router.post(
  "/v1/events/:eventId/checkin",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const userId = req.auth!.userId;

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.eventId, eventId))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    // Must be today
    const today = new Date().toISOString().split("T")[0];
    if (event.eventDate !== today) {
      res.status(400).json({
        error:
          "Check-in failed. You can only check in during the active hours indicated on the opportunity listing.",
      });
      return;
    }

    // Must be within start_time–end_time window (compare HH:MM)
    const nowUtc = new Date();
    const nowTime = nowUtc.toTimeString().slice(0, 5); // "HH:MM"
    const startTime = event.startTime.slice(0, 5);
    const endTime = event.endTime.slice(0, 5);

    if (nowTime < startTime || nowTime > endTime) {
      res.status(400).json({
        error:
          "Check-in failed. You can only check in during the active hours indicated on the opportunity listing.",
      });
      return;
    }

    // Must be registered
    const [registration] = await db
      .select()
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, eventId),
          eq(eventRegistrationsTable.userId, userId),
        ),
      )
      .limit(1);

    if (!registration) {
      res.status(400).json({ error: "You are not registered for this event." });
      return;
    }

    if (registration.status === "attended") {
      res.status(400).json({ error: "You have already checked in to this event." });
      return;
    }

    // Mutate registration to attended
    await db
      .update(eventRegistrationsTable)
      .set({ status: "attended" })
      .where(eq(eventRegistrationsTable.registrationId, registration.registrationId));

    res.json({
      status: "attended",
      message:
        "Check-in successful. After the event ends, submit the actual hours you worked from your dashboard.",
    });
  },
);

// PATCH /api/v1/events/:eventId
router.patch(
  "/v1/events/:eventId",
  authenticate,
  requireRole("admin", "org_admin", "supervisor"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };

    const parsed = UpdateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const [current] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.eventId, eventId))
      .limit(1);

    if (!current) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const role = req.auth!.role;
    if (role === "org_admin") {
      // Org admins: only their org's events, and can't move to another org.
      const managed = await managedOrgIds(req.auth!.userId, role);
      if (!canManageOrg(managed, current.organizationId)) {
        res.status(403).json({ error: "You can only edit your own organization's events." });
        return;
      }
      const d0 = parsed.data as Record<string, unknown>;
      if ("organizationId" in d0 && !canManageOrg(managed, (d0.organizationId as string) ?? null)) {
        res.status(403).json({ error: "You can only assign events to your own organization." });
        return;
      }
    } else if (role === "supervisor") {
      // Supervisors: only events they supervise.
      if (current.supervisorId !== req.auth!.userId) {
        res.status(403).json({ error: "You can only edit events you supervise." });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    const d = parsed.data as Record<string, unknown>;
    if (d.title !== undefined) updates.title = d.title;
    if (d.description !== undefined) updates.description = d.description;
    if ("slotLabel" in d) updates.slotLabel = (d.slotLabel as string)?.trim() || null;
    if (d.location !== undefined) updates.location = d.location;
    if ("street" in d) updates.street = (d.street as string)?.trim() || null;
    if ("city" in d) updates.city = (d.city as string)?.trim() || null;
    if ("state" in d) updates.state = (d.state as string)?.trim() || null;
    if ("zip" in d) updates.zip = (d.zip as string)?.trim() || null;
    if (d.eventDate !== undefined) updates.eventDate = d.eventDate;
    if (d.startTime !== undefined) updates.startTime = d.startTime;
    if (d.endTime !== undefined) updates.endTime = d.endTime;
    if (d.maxCapacity !== undefined) updates.maxCapacity = d.maxCapacity;
    if ("minGrade" in d) updates.minGrade = d.minGrade ?? null;
    if ("maxGrade" in d) updates.maxGrade = d.maxGrade ?? null;
    if (d.supervisorId !== undefined) updates.supervisorId = d.supervisorId;
    if ("imageUrl" in d) updates.imageUrl = d.imageUrl ?? null;
    if ("organizationId" in d) updates.organizationId = d.organizationId ?? null;

    const nextStartTime = String(d.startTime ?? current.startTime);
    const nextEndTime = String(d.endTime ?? current.endTime);
    const durationHours = calculateDurationHours(nextStartTime, nextEndTime);
    if (durationHours === null) {
      res.status(400).json({ error: "End time must be later than start time." });
      return;
    }
    updates.hoursValue = String(durationHours);

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(eventsTable)
      .set(updates)
      .where(eq(eventsTable.eventId, eventId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.eventId, eventId));

    const [supervisor] = await db
      .select({
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, updated.supervisorId))
      .limit(1);

    res.json(
      formatEvent(
        {
          ...updated,
          supervisorFirstName: supervisor?.firstName ?? null,
          supervisorLastName: supervisor?.lastName ?? null,
          supervisorEmail: supervisor?.email ?? null,
          supervisorPhone: supervisor?.phone ?? null,
        },
        Number(cnt),
        null,
      ),
    );
  },
);

// POST /api/v1/events
router.post(
  "/v1/events",
  authenticate,
  requireRole("admin", "org_admin", "supervisor"),
  async (req, res) => {
    const parsed = CreateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { title, description, slotLabel, location, street, city, state, zip, eventDate, startTime, endTime, maxCapacity, minGrade, maxGrade, imageUrl, organizationId } =
      parsed.data as any;
    let { supervisorId } = parsed.data as any;

    const role = req.auth!.role;
    // Supervisors and Org Admins supervise their own events.
    if (role === "supervisor" || role === "org_admin") {
      supervisorId = req.auth!.userId;
    }
    // Organization Admins may only create events for the org(s) they manage.
    if (role === "org_admin") {
      const managed = await managedOrgIds(req.auth!.userId, role);
      if (!organizationId || !canManageOrg(managed, organizationId)) {
        res.status(403).json({ error: "You can only create events for your own organization." });
        return;
      }
    }

    const durationHours = calculateDurationHours(startTime, endTime);
    if (durationHours === null) {
      res.status(400).json({ error: "End time must be later than start time." });
      return;
    }

    const [event] = await db
      .insert(eventsTable)
      .values({
        title,
        description,
        slotLabel: slotLabel?.trim() || null,
        location: location ?? "",
        street: street?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        eventDate,
        startTime: startTime ?? "09:00:00",
        endTime: endTime ?? "17:00:00",
        hoursValue: String(durationHours),
        maxCapacity: maxCapacity ?? 50,
        minGrade: minGrade ?? null,
        maxGrade: maxGrade ?? null,
        supervisorId,
        imageUrl: imageUrl ?? null,
        organizationId: organizationId ?? null,
      })
      .returning();

    const [supervisor] = await db
      .select({
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        phone: usersTable.phone,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, supervisorId))
      .limit(1);

    res.status(201).json(
      formatEvent(
        {
          ...event,
          supervisorFirstName: supervisor?.firstName ?? null,
          supervisorLastName: supervisor?.lastName ?? null,
          supervisorEmail: supervisor?.email ?? null,
          supervisorPhone: supervisor?.phone ?? null,
        },
        0,
        null,
      ),
    );
  },
);

// DELETE /api/v1/events/:eventId
router.delete(
  "/v1/events/:eventId",
  authenticate,
  requireRole("admin", "org_admin", "supervisor"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const role = req.auth!.role;

    if (role === "org_admin" || role === "supervisor") {
      const [current] = await db
        .select({
          organizationId: eventsTable.organizationId,
          supervisorId: eventsTable.supervisorId,
        })
        .from(eventsTable)
        .where(eq(eventsTable.eventId, eventId))
        .limit(1);
      if (!current) {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      if (role === "org_admin") {
        const managed = await managedOrgIds(req.auth!.userId, role);
        if (!canManageOrg(managed, current.organizationId)) {
          res.status(403).json({ error: "You can only delete your own organization's events." });
          return;
        }
      } else if (current.supervisorId !== req.auth!.userId) {
        res.status(403).json({ error: "You can only delete events you supervise." });
        return;
      }
    }

    // Safety: never destroy accredited hours. Block deletion if any participant
    // has approved hours for this event (deleting would cascade them away).
    const [approved] = await db
      .select({ c: count() })
      .from(volunteerSubmissionsTable)
      .where(and(eq(volunteerSubmissionsTable.eventId, eventId), eq(volunteerSubmissionsTable.status, "approved")));
    if (Number(approved?.c ?? 0) > 0) {
      res.status(400).json({
        error:
          "This event can't be deleted because participants have approved hours for it. Those hours must be preserved.",
      });
      return;
    }

    await db.delete(eventsTable).where(eq(eventsTable.eventId, eventId));
    res.json({ status: "success", message: "Event deleted" });
  },
);

export default router;
