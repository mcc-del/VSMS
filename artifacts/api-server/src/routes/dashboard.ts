import { Router } from "express";
import { db, usersTable, eventsTable, volunteerSubmissionsTable, externalSubmissionsTable, manualHoursTable, awardThresholdsTable } from "@workspace/db";
import { thresholdsForGrade } from "../lib/thresholds";
import { eq, sum, count, and, inArray, isNotNull } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { managedOrgIds } from "../lib/org-scope";

const router = Router();

// GET /api/v1/dashboard/participant
router.get(
  "/v1/dashboard/participant",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const userId = req.auth!.userId;

    const allSubs = await db
      .select({
        status: volunteerSubmissionsTable.status,
        hoursWorked: volunteerSubmissionsTable.hoursWorked,
        plannedHours: eventsTable.hoursValue,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(eq(volunteerSubmissionsTable.userId, userId));

    let totalApprovedHours = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    for (const sub of allSubs) {
      if (sub.status === "approved") {
        totalApprovedHours += Number(sub.hoursWorked ?? sub.plannedHours ?? 0);
        approvedCount++;
      } else if (sub.status === "pending" && sub.hoursWorked !== null) {
        pendingCount++;
      } else if (sub.status === "rejected") {
        rejectedCount++;
      }
    }

    // Include approved external volunteering hours.
    const extSubs = await db
      .select({
        status: externalSubmissionsTable.status,
        hoursWorked: externalSubmissionsTable.hoursWorked,
      })
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.userId, userId));
    for (const sub of extSubs) {
      if (sub.status === "approved") {
        totalApprovedHours += Number(sub.hoursWorked ?? 0);
        approvedCount++;
      } else if (sub.status === "pending" || sub.status === "deferred_overflow") {
        pendingCount++;
      } else if (sub.status === "rejected") {
        rejectedCount++;
      }
    }

    // Include admin-granted manual hour credits (auto-approved).
    const [manual] = await db
      .select({ total: sum(manualHoursTable.hours) })
      .from(manualHoursTable)
      .where(eq(manualHoursTable.userId, userId));
    totalApprovedHours += Number(manual?.total ?? 0);

    // Resolve this participant's award thresholds (by grade band / org).
    const [me] = await db
      .select({ grade: usersTable.grade, organizationId: usersTable.organizationId })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    const rows = await db.select().from(awardThresholdsTable);
    const thresholds = thresholdsForGrade(rows, me?.grade, me?.organizationId ?? null);

    res.json({ totalApprovedHours, pendingCount, approvedCount, rejectedCount, thresholds });
  },
);

// GET /api/v1/dashboard/supervisor
router.get(
  "/v1/dashboard/supervisor",
  authenticate,
  requireRole("supervisor", "admin"),
  async (req, res) => {
    // Scope the counts the same way the pending queue is scoped: a supervisor
    // sees only their events; an Org Admin only their org(s); a Super Admin all.
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    // Only Org Admins are org-scoped; a supervisor is scoped by their events.
    const orgFilter =
      req.auth!.role === "org_admin"
        ? managed && managed.length > 0
          ? inArray(eventsTable.organizationId, managed)
          : eq(eventsTable.eventId, "00000000-0000-0000-0000-000000000000")
        : undefined;

    const rows = await db
      .select({ status: volunteerSubmissionsTable.status, cnt: count() })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(
        and(
          isNotNull(volunteerSubmissionsTable.hoursWorked),
          req.auth!.role === "supervisor" ? eq(eventsTable.supervisorId, req.auth!.userId) : undefined,
          orgFilter,
        ),
      )
      .groupBy(volunteerSubmissionsTable.status);

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    for (const r of rows) {
      if (r.status === "pending") pendingCount = Number(r.cnt);
      else if (r.status === "approved") approvedCount = Number(r.cnt);
      else if (r.status === "rejected") rejectedCount = Number(r.cnt);
    }

    res.json({ pendingCount, approvedCount, rejectedCount });
  },
);

// GET /api/v1/dashboard/admin
router.get(
  "/v1/dashboard/admin",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const [userRows, eventRows, subRows] = await Promise.all([
      db
        .select({ role: usersTable.role, cnt: count() })
        .from(usersTable)
        .groupBy(usersTable.role),
      db.select({ cnt: count() }).from(eventsTable),
      db
        .select({ status: volunteerSubmissionsTable.status, cnt: count() })
        .from(volunteerSubmissionsTable)
        .groupBy(volunteerSubmissionsTable.status),
    ]);

    let totalUsers = 0;
    let participantCount = 0;
    let supervisorCount = 0;
    for (const r of userRows) {
      totalUsers += Number(r.cnt);
      if (r.role === "participant") participantCount = Number(r.cnt);
      if (r.role === "supervisor") supervisorCount = Number(r.cnt);
    }

    const totalEvents = Number(eventRows[0]?.cnt ?? 0);

    let totalSubmissions = 0;
    let pendingSubmissions = 0;
    let approvedSubmissions = 0;
    let rejectedSubmissions = 0;
    for (const r of subRows) {
      totalSubmissions += Number(r.cnt);
      if (r.status === "pending") pendingSubmissions = Number(r.cnt);
      else if (r.status === "approved") approvedSubmissions = Number(r.cnt);
      else if (r.status === "rejected") rejectedSubmissions = Number(r.cnt);
    }

    res.json({
      totalUsers,
      totalEvents,
      totalSubmissions,
      pendingSubmissions,
      approvedSubmissions,
      rejectedSubmissions,
      participantCount,
      supervisorCount,
    });
  },
);

export default router;
