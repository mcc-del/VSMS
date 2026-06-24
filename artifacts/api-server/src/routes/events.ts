import { Router } from "express";
import {
  db,
  eventsTable,
  usersTable,
  volunteerSubmissionsTable,
  eventRegistrationsTable,
} from "@workspace/db";
import { eq, count, sql, and, lt } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateEventBody, UpdateEventBody } from "@workspace/api-zod";

const router = Router();

function formatEvent(
  e: {
    eventId: string;
    title: string;
    description: string;
    location: string;
    eventDate: string;
    startTime: string;
    endTime: string;
    hoursValue: string;
    maxCapacity: number;
    imageUrl: string | null;
    supervisorId: string;
    supervisorFirstName: string | null;
    supervisorLastName: string | null;
  },
  registrationCount: number,
  myRegistrationStatus: string | null,
) {
  return {
    eventId: e.eventId,
    title: e.title,
    description: e.description,
    location: e.location,
    eventDate: e.eventDate,
    startTime: e.startTime,
    endTime: e.endTime,
    hoursValue: Number(e.hoursValue),
    maxCapacity: e.maxCapacity,
    imageUrl: e.imageUrl ?? null,
    supervisorId: e.supervisorId,
    supervisorName: e.supervisorFirstName
      ? `${e.supervisorFirstName} ${e.supervisorLastName}`
      : null,
    registrationCount,
    myRegistrationStatus,
  };
}

// Helper: flag no-show registrations for past events
async function flagNoShows() {
  const nowStr = new Date().toISOString().replace("T", " ").split(".")[0];
  // Find events that have ended (event_date + end_time < now)
  await db.execute(
    sql`
      UPDATE event_registrations er
      SET status = 'no_show'
      FROM events e
      WHERE er.event_id = e.event_id
        AND er.status = 'registered'
        AND (e.event_date || ' ' || e.end_time)::timestamp < NOW()
    `,
  );
}

// GET /api/v1/events
router.get("/v1/events", authenticate, async (req, res) => {
  await flagNoShows();

  const userId = req.auth?.userId;

  const events = await db
    .select({
      eventId: eventsTable.eventId,
      title: eventsTable.title,
      description: eventsTable.description,
      location: eventsTable.location,
      eventDate: eventsTable.eventDate,
      startTime: eventsTable.startTime,
      endTime: eventsTable.endTime,
      hoursValue: eventsTable.hoursValue,
      maxCapacity: eventsTable.maxCapacity,
      imageUrl: eventsTable.imageUrl,
      supervisorId: eventsTable.supervisorId,
      supervisorFirstName: usersTable.firstName,
      supervisorLastName: usersTable.lastName,
    })
    .from(eventsTable)
    .leftJoin(usersTable, eq(eventsTable.supervisorId, usersTable.userId))
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

  res.json(
    events.map((e) =>
      formatEvent(e, regCounts[e.eventId] ?? 0, myRegMap[e.eventId] ?? null),
    ),
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
      })
      .from(eventRegistrationsTable)
      .leftJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
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
        hoursValue: r.hoursValue ? Number(r.hoursValue) : null,
        imageUrl: r.imageUrl ?? null,
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
      location: eventsTable.location,
      eventDate: eventsTable.eventDate,
      startTime: eventsTable.startTime,
      endTime: eventsTable.endTime,
      hoursValue: eventsTable.hoursValue,
      maxCapacity: eventsTable.maxCapacity,
      imageUrl: eventsTable.imageUrl,
      supervisorId: eventsTable.supervisorId,
      supervisorFirstName: usersTable.firstName,
      supervisorLastName: usersTable.lastName,
    })
    .from(eventsTable)
    .leftJoin(usersTable, eq(eventsTable.supervisorId, usersTable.userId))
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
      hoursValue: Number(event.hoursValue),
      imageUrl: event.imageUrl ?? null,
    });
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

    // Check for existing submission (prevent duplicates)
    const [existingSub] = await db
      .select()
      .from(volunteerSubmissionsTable)
      .where(
        and(
          eq(volunteerSubmissionsTable.userId, userId),
          eq(volunteerSubmissionsTable.eventId, eventId),
        ),
      )
      .limit(1);

    let submissionId: string;

    if (!existingSub) {
      const [submission] = await db
        .insert(volunteerSubmissionsTable)
        .values({ userId, eventId, status: "pending" })
        .returning();
      submissionId = submission.submissionId;
    } else {
      submissionId = existingSub.submissionId;
    }

    res.json({
      status: "attended",
      message:
        "Check-in successful! Your internal hours have been generated and routed to your supervisor for pending review.",
      submissionId,
    });
  },
);

// PATCH /api/v1/events/:eventId
router.patch(
  "/v1/events/:eventId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };

    const parsed = UpdateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const updates: Record<string, unknown> = {};
    const d = parsed.data as Record<string, unknown>;
    if (d.title !== undefined) updates.title = d.title;
    if (d.description !== undefined) updates.description = d.description;
    if (d.location !== undefined) updates.location = d.location;
    if (d.eventDate !== undefined) updates.eventDate = d.eventDate;
    if (d.startTime !== undefined) updates.startTime = d.startTime;
    if (d.endTime !== undefined) updates.endTime = d.endTime;
    if (d.hoursValue !== undefined) updates.hoursValue = String(d.hoursValue);
    if (d.maxCapacity !== undefined) updates.maxCapacity = d.maxCapacity;
    if (d.supervisorId !== undefined) updates.supervisorId = d.supervisorId;
    if ("imageUrl" in d) updates.imageUrl = d.imageUrl ?? null;

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
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, updated.supervisorId))
      .limit(1);

    res.json(
      formatEvent(
        {
          ...updated,
          supervisorFirstName: supervisor?.firstName ?? null,
          supervisorLastName: supervisor?.lastName ?? null,
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
  requireRole("admin"),
  async (req, res) => {
    const parsed = CreateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { title, description, location, eventDate, startTime, endTime, hoursValue, maxCapacity, supervisorId, imageUrl } =
      parsed.data as any;

    const [event] = await db
      .insert(eventsTable)
      .values({
        title,
        description,
        location: location ?? "",
        eventDate,
        startTime: startTime ?? "09:00:00",
        endTime: endTime ?? "17:00:00",
        hoursValue: String(hoursValue),
        maxCapacity: maxCapacity ?? 50,
        supervisorId,
        imageUrl: imageUrl ?? null,
      })
      .returning();

    const [supervisor] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, supervisorId))
      .limit(1);

    res.status(201).json(
      formatEvent(
        {
          ...event,
          supervisorFirstName: supervisor?.firstName ?? null,
          supervisorLastName: supervisor?.lastName ?? null,
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
  requireRole("admin"),
  async (req, res) => {
    const { eventId } = req.params as { eventId: string };
    await db.delete(eventsTable).where(eq(eventsTable.eventId, eventId));
    res.json({ status: "success", message: "Event deleted" });
  },
);

export default router;
