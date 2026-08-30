import { Router } from "express";
import {
  db,
  usersTable,
  eventRegistrationsTable,
  eventsTable,
  volunteerSubmissionsTable,
  manualHoursTable,
} from "@workspace/db";
import { eq, and, inArray, gte, sum, sql, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";

const router = Router();

// GET /api/v1/parent/children — children linked to this parent (by email),
// with each child's upcoming schedule and approved-hours total.
router.get(
  "/v1/parent/children",
  authenticate,
  requireRole("parent"),
  async (req, res) => {
    const parentEmail = req.auth!.email.toLowerCase();

    // The parent's last-seen timestamp drives the "new" badges.
    const [parent] = await db
      .select({ userId: usersTable.userId, lastSeen: usersTable.parentLastSeenAt })
      .from(usersTable)
      .where(eq(usersTable.userId, req.auth!.userId))
      .limit(1);
    const lastSeen = parent?.lastSeen ?? null;

    const children = await db
      .select({
        userId: usersTable.userId,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(and(eq(usersTable.role, "participant"), eq(usersTable.parentEmail, parentEmail)))
      .orderBy(asc(usersTable.firstName));

    const today = new Date().toISOString().split("T")[0];

    const result = [];
    for (const child of children) {
      // Approved internal hours (actual hours if present, else planned event hours).
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

    // Mark everything seen as of now, so these registrations aren't "new" next time.
    await db
      .update(usersTable)
      .set({ parentLastSeenAt: new Date() })
      .where(eq(usersTable.userId, req.auth!.userId));

    res.json(result);
  },
);

export default router;
