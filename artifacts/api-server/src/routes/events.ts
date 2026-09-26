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
import { eq, count, sql, and, inArray, ilike, or } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateEventBody, UpdateEventBody } from "@workspace/api-zod";
import { sendRegistrationConfirmation, sendEventBroadcast, sendAddedToEvent, sendGuardianSignupNotification, sendAccountInvite } from "../lib/email";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { eventHasEnded, todayPT, nowTimePT } from "../lib/event-time";
import { notifyUser } from "../lib/digest";
import { recordAudit } from "../lib/audit";
import { ObjectStorageService } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();
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
    openToAll?: boolean;
    status?: string;
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
    openToAll: e.openToAll ?? true,
    status: e.status ?? "open",
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
    } else {
      // A supervisor's own organization (for scoping their All Opportunities).
      viewerOrgId = viewer?.organizationId ?? null;
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
      openToAll: eventsTable.openToAll,
      status: eventsTable.status,
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
    .orderBy(sql`${eventsTable.eventDate} ASC`, sql`${eventsTable.startTime} ASC`);

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

  // For non-participant viewers, scope by role: a Super Admin sees all; an Org
  // Admin sees their org(s) + open-to-all; a supervisor sees events they run +
  // open-to-all. This keeps org-gated events (R2 safety boundary) from leaking
  // across organizations.
  const viewerRole = req.auth!.role;
  const managed = viewerIsParticipant ? [] : await managedOrgIds(userId!, viewerRole);

  const visible = events.filter((e) => {
    if (!viewerIsParticipant) {
      if (viewerRole === "admin") return true; // Super Admin: everything
      if (!e.organizationId) return true; // open-to-all
      if (managed !== null && managed.includes(e.organizationId)) return true; // Org Admin's org(s)
      if (e.supervisorId === userId) return true; // supervisor's own event
      if (viewerRole === "supervisor" && viewerOrgId && e.organizationId === viewerOrgId) return true; // supervisor's org
      return false;
    }
    // Participants never see drafts (only coming_soon and open).
    if (e.status === "draft") return false;
    // Opportunities with no host org, or explicitly marked open to all, are
    // visible to every participant.
    if (!e.organizationId || e.openToAll) return true;
    // Org-private opportunities are visible only to that org's students. This is
    // a safety boundary (R2): e.g. a Medina-only on-site event, which may share
    // building access or a QR code, must never appear to non-Medina students
    // unless the host org chose to open it to everyone.
    return e.organizationId === viewerOrgId;
  });

  res.json(
    visible.map((e) => {
      let eligibleForMe = true;
      if (viewerIsParticipant) {
        // Org grade-band eligibility (only for the host org's own students; a
        // cross-org open event is judged solely on its per-event grade limits).
        if (e.organizationId && e.organizationId === viewerOrgId) {
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
        slotLabel: eventsTable.slotLabel,
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
        eventTitle: r.slotLabel ? `${r.eventTitle} — ${r.slotLabel}` : (r.eventTitle ?? null),
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
      openToAll: eventsTable.openToAll,
      status: eventsTable.status,
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
    if (event.status !== "open") {
      res.status(400).json({ error: "Sign-ups aren't open for this event yet." });
      return;
    }

    // Enforce org gating (R2) and per-event grade limits.
    const [viewer] = await db
      .select({ organizationId: usersTable.organizationId, grade: usersTable.grade })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (event.organizationId && !event.openToAll && (viewer?.organizationId ?? null) !== event.organizationId) {
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

    if (eventHasEnded(event.eventDate, event.endTime)) {
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
      .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName, parentEmail: usersTable.parentEmail })
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

      // (No supervisor signup email — supervisors see sign-ups live on the
      // event roster; this avoids one email per sign-up.)

      // Notify every parent/guardian — linked parent accounts (digest-aware) and
      // the raw parent email on the student's account (always immediate).
      const childName = toName;
      const linkedGuardians = await db
        .select({ userId: usersTable.userId, email: usersTable.email })
        .from(guardianshipsTable)
        .innerJoin(usersTable, eq(guardianshipsTable.guardianUserId, usersTable.userId))
        .where(eq(guardianshipsTable.childUserId, userId));
      const linkedEmails = new Set<string>();
      for (const g of linkedGuardians) {
        if (!g.email) continue;
        linkedEmails.add(g.email.toLowerCase());
        void notifyUser({
          userId: g.userId,
          category: "guardian_signup",
          line: `${childName} signed up for "${event.title}" (${event.eventDate}).`,
          sendNow: () => sendGuardianSignupNotification(g.email!, childName, event.title, event.eventDate, event.location),
        }).catch((err) => req.log.error({ err }, "guardian signup notification failed"));
      }
      // A parent email with no linked account yet — send immediately.
      if (user.parentEmail && !linkedEmails.has(user.parentEmail.toLowerCase())) {
        sendGuardianSignupNotification(user.parentEmail.toLowerCase(), childName, event.title, event.eventDate, event.location)
          .catch((err) => req.log.error({ err }, "guardian signup notification failed"));
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

    // (No supervisor withdrawal email — supervisors see the current roster live;
    // this avoids one email per withdrawal.)
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
    const canManage = await canManageEvent(req.auth!.role, req.auth!.userId, event);
    // A supervisor may VIEW (read-only) another supervisor's roster within their
    // own organization, but can't manage it (message, add, attendance).
    let canView = canManage;
    if (!canView && req.auth!.role === "supervisor") {
      const [me] = await db.select({ organizationId: usersTable.organizationId }).from(usersTable).where(eq(usersTable.userId, req.auth!.userId)).limit(1);
      if (me?.organizationId && event.organizationId === me.organizationId) canView = true;
    }
    if (!canView) {
      res.status(403).json({ error: "You can only view events in your organization." });
      return;
    }
    const rows = await db
      .select({
        userId: eventRegistrationsTable.userId,
        status: eventRegistrationsTable.status,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        grade: usersTable.grade,
        school: usersTable.school,
        organizationName: organizationsTable.name,
      })
      .from(eventRegistrationsTable)
      .leftJoin(usersTable, eq(eventRegistrationsTable.userId, usersTable.userId))
      .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.organizationId))
      .where(eq(eventRegistrationsTable.eventId, eventId));

    const subs = await db
      .select({ userId: volunteerSubmissionsTable.userId, status: volunteerSubmissionsTable.status })
      .from(volunteerSubmissionsTable)
      .where(eq(volunteerSubmissionsTable.eventId, eventId));
    const subMap = new Map(subs.map((s) => [s.userId, s.status]));

    res.json({
      eventId,
      eventTitle: event.slotLabel ? `${event.title} — ${event.slotLabel}` : event.title,
      imageUrl: event.imageUrl ?? null,
      plannedHours: calculateDurationHours(event.startTime, event.endTime) ?? Number(event.hoursValue),
      canManage,
      participants: rows.map((r) => ({
        userId: r.userId,
        name: [r.firstName, r.lastName].filter(Boolean).join(" "),
        grade: r.grade ?? null,
        status: r.status,
        hoursStatus: subMap.get(r.userId) ?? null,
        organizationName: r.organizationName ?? null,
        school: r.school ?? null,
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

// Sentinel comment marking hours auto-credited by a roster check-out (so an
// undo can safely remove only those, not a student's own submission).
const CHECKOUT_COMMENT = "Checked out at event by supervisor.";

// POST /api/v1/events/:eventId/checkout — one-tap completion. Checking a student
// out marks them attended and auto-credits the event's planned hours (approved,
// no separate review). Undo removes those auto-credited hours.
router.post(
  "/v1/events/:eventId/checkout",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const body = (req.body ?? {}) as { userId?: unknown; checkedOut?: unknown; hours?: unknown };
    const targetUserId = typeof body.userId === "string" ? body.userId : "";
    const checkedOut = body.checkedOut !== false; // default true
    const customHours = typeof body.hours === "number" && Number.isFinite(body.hours) ? body.hours : null;
    if (!targetUserId) { res.status(400).json({ error: "userId is required." }); return; }
    if (customHours !== null && (customHours < 0.25 || customHours > 24)) {
      res.status(400).json({ error: "Hours must be between 0.25 and 24." });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only manage events you supervise." });
      return;
    }

    // Must be on the roster.
    const [reg] = await db
      .select({ userId: eventRegistrationsTable.userId })
      .from(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, targetUserId)))
      .limit(1);
    if (!reg) { res.status(404).json({ error: "That participant isn't registered." }); return; }

    const [existing] = await db
      .select({ submissionId: volunteerSubmissionsTable.submissionId, status: volunteerSubmissionsTable.status, comments: volunteerSubmissionsTable.supervisorComments })
      .from(volunteerSubmissionsTable)
      .where(and(eq(volunteerSubmissionsTable.eventId, eventId), eq(volunteerSubmissionsTable.userId, targetUserId)))
      .limit(1);

    if (checkedOut) {
      // Mark attended and credit planned hours as approved.
      await db
        .update(eventRegistrationsTable)
        .set({ status: "attended" })
        .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, targetUserId)));

      const plannedHours = calculateDurationHours(event.startTime, event.endTime) ?? Number(event.hoursValue);
      const creditHours = customHours ?? plannedHours;
      if (existing) {
        await db
          .update(volunteerSubmissionsTable)
          .set({ status: "approved", hoursWorked: String(creditHours), supervisorComments: CHECKOUT_COMMENT, reviewedAt: new Date() })
          .where(eq(volunteerSubmissionsTable.submissionId, existing.submissionId));
      } else {
        await db.insert(volunteerSubmissionsTable).values({
          userId: targetUserId,
          eventId,
          hoursWorked: String(creditHours),
          status: "approved",
          supervisorComments: CHECKOUT_COMMENT,
          reviewedAt: new Date(),
        });
      }
      res.json({ ok: true, checkedOut: true });
      return;
    }

    // Undo: only remove hours that were auto-credited by a check-out — never a
    // student's own submission.
    if (existing && existing.comments === CHECKOUT_COMMENT) {
      await db.delete(volunteerSubmissionsTable).where(eq(volunteerSubmissionsTable.submissionId, existing.submissionId));
    }
    res.json({ ok: true, checkedOut: false });
  },
);

// POST /api/v1/events/:eventId/checkout-all — check out (credit hours to) every
// participant currently checked in (status "attended") who isn't already checked
// out. One tap to finish a whole event.
router.post(
  "/v1/events/:eventId/checkout-all",
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

    const attendees = await db
      .select({ userId: eventRegistrationsTable.userId })
      .from(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.status, "attended")));

    // Existing submissions (any status) for this event, so we reconcile rather
    // than create duplicates: already-approved are left alone; a pending/rejected
    // one is upgraded to approved; users with none get a fresh approved row.
    const existingSubs = await db
      .select({ userId: volunteerSubmissionsTable.userId, submissionId: volunteerSubmissionsTable.submissionId, status: volunteerSubmissionsTable.status })
      .from(volunteerSubmissionsTable)
      .where(eq(volunteerSubmissionsTable.eventId, eventId));
    const subByUser = new Map(existingSubs.map((s) => [s.userId, s]));

    const plannedHours = calculateDurationHours(event.startTime, event.endTime) ?? Number(event.hoursValue);
    const toInsert: { userId: string; eventId: string; hoursWorked: string; status: "approved"; supervisorComments: string; reviewedAt: Date }[] = [];
    let credited = 0;
    for (const a of attendees) {
      const sub = subByUser.get(a.userId);
      if (sub?.status === "approved") continue; // already credited
      if (sub) {
        await db
          .update(volunteerSubmissionsTable)
          .set({ status: "approved", hoursWorked: String(plannedHours), supervisorComments: CHECKOUT_COMMENT, reviewedAt: new Date() })
          .where(eq(volunteerSubmissionsTable.submissionId, sub.submissionId));
        credited++;
      } else {
        toInsert.push({ userId: a.userId, eventId, hoursWorked: String(plannedHours), status: "approved", supervisorComments: CHECKOUT_COMMENT, reviewedAt: new Date() });
      }
    }
    if (toInsert.length > 0) {
      await db.insert(volunteerSubmissionsTable).values(toInsert);
      credited += toInsert.length;
    }
    res.json({ ok: true, checkedOut: credited });
  },
);

// GET /api/v1/participants/search?q= — name search for the roster "Add
// participant" picker. Returns existing participant accounts (including managed
// children, who have no email) matching the query. Managers can vouch for a
// student from any org, so this isn't org-scoped.
router.get(
  "/v1/participants/search",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) { res.json({ participants: [] }); return; }
    const like = `%${q}%`;
    const rows = await db
      .select({
        userId: usersTable.userId,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        grade: usersTable.grade,
        school: usersTable.school,
        email: usersTable.email,
        isManaged: usersTable.isManaged,
        organizationName: organizationsTable.name,
      })
      .from(usersTable)
      .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.organizationId))
      .where(and(
        eq(usersTable.role, "participant"),
        or(
          ilike(usersTable.firstName, like),
          ilike(usersTable.lastName, like),
          ilike(sql`${usersTable.firstName} || ' ' || ${usersTable.lastName}`, like),
        ),
      ))
      .orderBy(usersTable.firstName)
      .limit(20);
    res.json({
      participants: rows.map((r) => ({
        userId: r.userId,
        name: `${r.firstName} ${r.lastName}`.trim(),
        grade: r.grade ?? null,
        school: r.school ?? null,
        email: r.email ?? null,
        isManaged: r.isManaged,
        organizationName: r.organizationName ?? null,
      })),
    });
  },
);

// POST /api/v1/events/:eventId/attendees — a supervisor/org-admin adds a
// participant to their event by userId (from the search picker) or email. This
// intentionally bypasses org-gating: the supervisor is vouching for a specific
// student, without opening the event to everyone.
router.post(
  "/v1/events/:eventId/attendees",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const body = (req.body ?? {}) as { email?: unknown; userId?: unknown; firstName?: unknown; lastName?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const pickedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    const newFirstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const newLastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    if (!email && !pickedUserId && !(newFirstName && newLastName)) {
      res.status(400).json({ error: "Pick a participant, or enter a name to add someone new." });
      return;
    }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only manage events you supervise." });
      return;
    }

    let participant = (pickedUserId || email)
      ? (await db
          .select({ userId: usersTable.userId, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, grade: usersTable.grade, email: usersTable.email, parentEmail: usersTable.parentEmail })
          .from(usersTable)
          .where(pickedUserId ? eq(usersTable.userId, pickedUserId) : eq(usersTable.email, email))
          .limit(1))[0]
      : undefined;

    // Walk-in who isn't in the system yet: create a participant record so their
    // credited hours are tracked. With an email, we also send a set-password
    // invite. Without an email, we create a managed (login-less) participant —
    // like a grade 2–5 child — that a parent/email can be attached to later.
    if (!participant && newFirstName && newLastName) {
      const hasEmail = !!email;
      const inviteToken = hasEmail ? randomBytes(32).toString("hex") : null;
      const inviteExpires = hasEmail ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;
      const passwordHash = await bcrypt.hash(randomBytes(18).toString("hex"), 12);
      const [created] = await db
        .insert(usersTable)
        .values({
          firstName: newFirstName,
          lastName: newLastName,
          email: hasEmail ? email : null,
          passwordHash,
          role: "participant",
          isManaged: !hasEmail,
          resetToken: inviteToken,
          resetTokenExpiresAt: inviteExpires,
        })
        .returning({ userId: usersTable.userId, firstName: usersTable.firstName, lastName: usersTable.lastName, role: usersTable.role, grade: usersTable.grade, email: usersTable.email, parentEmail: usersTable.parentEmail });
      participant = created;
      if (hasEmail && inviteToken) {
        sendAccountInvite(email, newFirstName, "Participant", inviteToken)
          .catch((err) => req.log.error({ err }, "walk-in account invite failed"));
      }
    }

    if (!participant || participant.role !== "participant") {
      res.status(404).json({
        error: pickedUserId
          ? "That participant no longer exists."
          : "No participant found. Add their name to create a record (email optional).",
        code: "not_found_needs_name",
      });
      return;
    }

    const [existing] = await db
      .select({ id: eventRegistrationsTable.registrationId })
      .from(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, participant.userId)))
      .limit(1);
    if (existing) { res.status(409).json({ error: "That participant is already on this event." }); return; }

    await db.insert(eventRegistrationsTable).values({ eventId, userId: participant.userId, status: "registered" });

    const [adder] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable).where(eq(usersTable.userId, req.auth!.userId)).limit(1);
    const byName = adder ? `${adder.firstName} ${adder.lastName}`.trim() : "A supervisor";
    sendAddedToEvent(
      [participant.email, participant.parentEmail].filter((e): e is string => !!e),
      participant.firstName, event.title, event.eventDate, byName,
    ).catch((err) => req.log.error({ err }, "added-to-event email failed"));

    res.status(201).json({
      userId: participant.userId,
      name: `${participant.firstName} ${participant.lastName}`.trim(),
      grade: participant.grade ?? null,
      status: "registered",
      hoursStatus: null,
      organizationName: null,
      school: null,
    });
  },
);

// POST /api/v1/events/:eventId/attendees/bulk — add many participants at once by
// name (email optional). Each name with no matching account becomes a managed,
// login-less participant. Already-registered people are skipped.
router.post(
  "/v1/events/:eventId/attendees/bulk",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    const body = (req.body ?? {}) as { people?: unknown };
    const people = Array.isArray(body.people) ? body.people : [];
    if (people.length === 0) { res.status(400).json({ error: "Add at least one name." }); return; }
    if (people.length > 200) { res.status(400).json({ error: "Please add at most 200 names at a time." }); return; }

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only manage events you supervise." });
      return;
    }

    let added = 0, skipped = 0;
    for (const raw of people) {
      const p = raw as { firstName?: unknown; lastName?: unknown; email?: unknown };
      const firstName = typeof p.firstName === "string" ? p.firstName.trim() : "";
      const lastName = typeof p.lastName === "string" ? p.lastName.trim() : "";
      const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
      if (!firstName || !lastName) { skipped++; continue; }

      let user = email
        ? (await db.select({ userId: usersTable.userId }).from(usersTable).where(eq(usersTable.email, email)).limit(1))[0]
        : undefined;
      if (!user) {
        const passwordHash = await bcrypt.hash(randomBytes(18).toString("hex"), 12);
        const inviteToken = email ? randomBytes(32).toString("hex") : null;
        const [created] = await db
          .insert(usersTable)
          .values({
            firstName, lastName,
            email: email || null,
            passwordHash,
            role: "participant",
            isManaged: !email,
            resetToken: inviteToken,
            resetTokenExpiresAt: inviteToken ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
          })
          .returning({ userId: usersTable.userId });
        user = created;
        if (email && inviteToken) {
          sendAccountInvite(email, firstName, "Participant", inviteToken).catch(() => {});
        }
      }

      const [existing] = await db
        .select({ id: eventRegistrationsTable.registrationId })
        .from(eventRegistrationsTable)
        .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, user.userId)))
        .limit(1);
      if (existing) { skipped++; continue; }
      await db.insert(eventRegistrationsTable).values({ eventId, userId: user.userId, status: "registered" });
      added++;
    }

    res.status(201).json({ added, skipped, total: people.length });
  },
);

// DELETE /api/v1/events/:eventId/attendees/:userId — a manager removes someone
// from the roster entirely (e.g. added by mistake). Blocked once they've been
// credited hours, so a completed record isn't silently erased.
router.delete(
  "/v1/events/:eventId/attendees/:userId",
  authenticate,
  requireRole("supervisor", "admin", "org_admin"),
  async (req, res) => {
    const { eventId, userId: targetUserId } = req.params as { eventId: string; userId: string };
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.eventId, eventId)).limit(1);
    if (!event) { res.status(404).json({ error: "Event not found" }); return; }
    if (!(await canManageEvent(req.auth!.role, req.auth!.userId, event))) {
      res.status(403).json({ error: "You can only manage events you supervise." });
      return;
    }

    const [approved] = await db
      .select({ id: volunteerSubmissionsTable.submissionId })
      .from(volunteerSubmissionsTable)
      .where(and(
        eq(volunteerSubmissionsTable.eventId, eventId),
        eq(volunteerSubmissionsTable.userId, targetUserId),
        eq(volunteerSubmissionsTable.status, "approved"),
      ))
      .limit(1);
    if (approved) {
      res.status(409).json({ error: "This person already has approved hours for this event. Undo their check-out first, then remove them.", code: "has_approved_hours" });
      return;
    }

    // Remove any pending/rejected submission and the registration.
    await db.delete(volunteerSubmissionsTable).where(and(eq(volunteerSubmissionsTable.eventId, eventId), eq(volunteerSubmissionsTable.userId, targetUserId)));
    const removed = await db
      .delete(eventRegistrationsTable)
      .where(and(eq(eventRegistrationsTable.eventId, eventId), eq(eventRegistrationsTable.userId, targetUserId)))
      .returning({ id: eventRegistrationsTable.registrationId });
    if (removed.length === 0) { res.status(404).json({ error: "That participant isn't on this event." }); return; }
    res.json({ ok: true });
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
    const body = (req.body ?? {}) as { subject?: unknown; message?: unknown; includeGuardians?: unknown; attachments?: unknown };
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const includeGuardians = body.includeGuardians !== false; // default on
    const rawAttachments = Array.isArray(body.attachments)
      ? (body.attachments as { path?: unknown; filename?: unknown }[])
          .filter((a) => typeof a?.path === "string" && typeof a?.filename === "string")
          .slice(0, 5) // cap the number of attachments
      : [];
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

    // Fetch each attachment from object storage and base64-encode it for email.
    const attachments: { filename: string; content: string }[] = [];
    for (const a of rawAttachments) {
      try {
        const file = await objectStorageService.getObjectEntityFile(a.path as string);
        const [buf] = await file.download();
        attachments.push({ filename: a.filename as string, content: buf.toString("base64") });
      } catch (err) {
        req.log.error({ err, path: a.path }, "Failed to read broadcast attachment");
      }
    }

    const list = [...emails];
    const sent = await sendEventBroadcast(list, event.title, senderName, subject, message, attachments);
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

    // Must be today (Pacific)
    if (event.eventDate !== todayPT()) {
      res.status(400).json({
        error:
          "Check-in failed. You can only check in during the active hours indicated on the opportunity listing.",
      });
      return;
    }

    // Must be within start_time–end_time window (compare HH:MM, Pacific)
    const nowTime = nowTimePT().slice(0, 5); // "HH:MM"
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
    if ("openToAll" in d) updates.openToAll = (d as { openToAll?: boolean }).openToAll ?? true;
    if ("status" in d) {
      const s = (d as { status?: string }).status;
      if (s && ["draft", "coming_soon", "open"].includes(s)) updates.status = s;
    }
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

    const { title, description, slotLabel, location, street, city, state, zip, eventDate, startTime, endTime, maxCapacity, minGrade, maxGrade, imageUrl, openToAll, status } =
      parsed.data as any;
    const eventStatus = ["draft", "coming_soon", "open"].includes(status) ? status : "open";
    let { supervisorId, organizationId } = parsed.data as any;

    const role = req.auth!.role;
    // Supervisors and Org Admins supervise their own events.
    if (role === "supervisor" || role === "org_admin") {
      supervisorId = req.auth!.userId;
    }
    // A supervisor always hosts under their OWN organization — never a chosen
    // one. Ignore any org sent by the client and use their account's org.
    if (role === "supervisor") {
      const [me] = await db
        .select({ organizationId: usersTable.organizationId })
        .from(usersTable)
        .where(eq(usersTable.userId, req.auth!.userId))
        .limit(1);
      organizationId = me?.organizationId ?? null;
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
        openToAll: openToAll ?? true,
        status: eventStatus,
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
    // A Super Admin can override with ?force=true (for cleaning up test data).
    const force = req.query.force === "true" && role === "admin";
    if (!force) {
      const [approved] = await db
        .select({ c: count() })
        .from(volunteerSubmissionsTable)
        .where(and(eq(volunteerSubmissionsTable.eventId, eventId), eq(volunteerSubmissionsTable.status, "approved")));
      if (Number(approved?.c ?? 0) > 0) {
        res.status(400).json({
          code: "has_approved_hours",
          error:
            "This event can't be deleted because participants have approved hours for it. Those hours must be preserved.",
        });
        return;
      }
    }

    const [deleted] = await db
      .select({ title: eventsTable.title, eventDate: eventsTable.eventDate })
      .from(eventsTable)
      .where(eq(eventsTable.eventId, eventId))
      .limit(1);
    await db.delete(eventsTable).where(eq(eventsTable.eventId, eventId));
    recordAudit({
      actorUserId: req.auth!.userId,
      action: "event.delete",
      targetType: "event",
      targetId: eventId,
      targetLabel: deleted?.title ?? null,
      summary: `Deleted event "${deleted?.title ?? eventId}"${deleted?.eventDate ? ` (${deleted.eventDate})` : ""}`,
    });
    res.json({ status: "success", message: "Event deleted" });
  },
);

export default router;
