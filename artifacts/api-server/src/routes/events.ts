import { Router } from "express";
import {
  db,
  eventsTable,
  usersTable,
  eventRegistrationsTable,
  organizationsTable,
} from "@workspace/db";
import { eq, count, sql, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateEventBody, UpdateEventBody } from "@workspace/api-zod";
import { sendRegistrationConfirmation } from "../lib/email";
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
  if (userId) {
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

  // Fetch current user's registrations if participant
  const myRegMap: Record<string, string> = {};
  if (userId) {
    const myRegs = await db
      .select()
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.userId, userId));
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
      }).catch((err) => {
        req.log.error({ err }, "Unhandled error sending registration confirmation");
      });
    }
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
  requireRole("admin", "org_admin"),
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

    // Org admins may only edit events for org(s) they manage, and may not move
    // an event to an org they don't manage.
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
      if (!canManageOrg(managed, current.organizationId)) {
        res.status(403).json({ error: "You can only edit your own organization's events." });
        return;
      }
      const d0 = parsed.data as Record<string, unknown>;
      if ("organizationId" in d0 && !canManageOrg(managed, (d0.organizationId as string) ?? null)) {
        res.status(403).json({ error: "You can only assign events to your own organization." });
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
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const parsed = CreateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { title, description, slotLabel, location, street, city, state, zip, eventDate, startTime, endTime, maxCapacity, minGrade, maxGrade, supervisorId, imageUrl, organizationId } =
      parsed.data as any;

    // Organization Admins may only create events for the org(s) they manage.
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
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
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };

    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
      const [current] = await db
        .select({ organizationId: eventsTable.organizationId })
        .from(eventsTable)
        .where(eq(eventsTable.eventId, eventId))
        .limit(1);
      if (!current) {
        res.status(404).json({ error: "Event not found" });
        return;
      }
      if (!canManageOrg(managed, current.organizationId)) {
        res.status(403).json({ error: "You can only delete your own organization's events." });
        return;
      }
    }

    await db.delete(eventsTable).where(eq(eventsTable.eventId, eventId));
    res.json({ status: "success", message: "Event deleted" });
  },
);

export default router;
