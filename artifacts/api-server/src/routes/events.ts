import { Router } from "express";
import { db, eventsTable, usersTable, volunteerSubmissionsTable } from "@workspace/db";
import { eq, count, sql } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateEventBody } from "@workspace/api-zod";

const router = Router();

// GET /api/v1/events
router.get("/v1/events", authenticate, async (req, res) => {
  const events = await db
    .select({
      eventId: eventsTable.eventId,
      title: eventsTable.title,
      description: eventsTable.description,
      eventDate: eventsTable.eventDate,
      hoursValue: eventsTable.hoursValue,
      maxCapacity: eventsTable.maxCapacity,
      supervisorId: eventsTable.supervisorId,
      supervisorFirstName: usersTable.firstName,
      supervisorLastName: usersTable.lastName,
    })
    .from(eventsTable)
    .leftJoin(usersTable, eq(eventsTable.supervisorId, usersTable.userId))
    .orderBy(sql`${eventsTable.eventDate} DESC`);

  const eventIds = events.map((e) => e.eventId);
  const counts: Record<string, number> = {};
  if (eventIds.length > 0) {
    const rows = await db
      .select({ eventId: volunteerSubmissionsTable.eventId, cnt: count() })
      .from(volunteerSubmissionsTable)
      .groupBy(volunteerSubmissionsTable.eventId);
    rows.forEach((r) => {
      counts[r.eventId] = Number(r.cnt);
    });
  }

  res.json(
    events.map((e) => ({
      eventId: e.eventId,
      title: e.title,
      description: e.description,
      eventDate: e.eventDate,
      hoursValue: Number(e.hoursValue),
      maxCapacity: e.maxCapacity,
      supervisorId: e.supervisorId,
      supervisorName: e.supervisorFirstName
        ? `${e.supervisorFirstName} ${e.supervisorLastName}`
        : null,
      registrationCount: counts[e.eventId] ?? 0,
    })),
  );
});

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

    const { title, description, eventDate, hoursValue, maxCapacity, supervisorId } = parsed.data;

    const [event] = await db
      .insert(eventsTable)
      .values({
        title,
        description,
        eventDate,
        hoursValue: String(hoursValue),
        maxCapacity,
        supervisorId,
      })
      .returning();

    const [supervisor] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.userId, supervisorId))
      .limit(1);

    res.status(201).json({
      eventId: event.eventId,
      title: event.title,
      description: event.description,
      eventDate: event.eventDate,
      hoursValue: Number(event.hoursValue),
      maxCapacity: event.maxCapacity,
      supervisorId: event.supervisorId,
      supervisorName: supervisor
        ? `${supervisor.firstName} ${supervisor.lastName}`
        : null,
      registrationCount: 0,
    });
  },
);

// GET /api/v1/events/:eventId
router.get("/v1/events/:eventId", authenticate, async (req, res) => {
  const { eventId } = req.params as { eventId: string };

  const [event] = await db
    .select({
      eventId: eventsTable.eventId,
      title: eventsTable.title,
      description: eventsTable.description,
      eventDate: eventsTable.eventDate,
      hoursValue: eventsTable.hoursValue,
      maxCapacity: eventsTable.maxCapacity,
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
    .from(volunteerSubmissionsTable)
    .where(eq(volunteerSubmissionsTable.eventId, eventId));

  res.json({
    eventId: event.eventId,
    title: event.title,
    description: event.description,
    eventDate: event.eventDate,
    hoursValue: Number(event.hoursValue),
    maxCapacity: event.maxCapacity,
    supervisorId: event.supervisorId,
    supervisorName: event.supervisorFirstName
      ? `${event.supervisorFirstName} ${event.supervisorLastName}`
      : null,
    registrationCount: Number(cnt),
  });
});

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
