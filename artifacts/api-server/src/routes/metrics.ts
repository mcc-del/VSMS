import { Router } from "express";
import {
  db,
  usersTable,
  eventsTable,
  eventRegistrationsTable,
  volunteerSubmissionsTable,
  externalSubmissionsTable,
  manualHoursTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and, inArray, sql, gte } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { awardThresholdsTable } from "@workspace/db";
import { thresholdsForGrade, medalFor as medalForT } from "../lib/thresholds";

const router = Router();

// GET /api/v1/admin/metrics — aggregated program metrics for the reports view.
router.get("/v1/admin/metrics", authenticate, requireRole("admin"), async (_req, res) => {
  // Approved hours per user, split by source.
  const [internalRows, manualRows, externalRows] = await Promise.all([
    db
      .select({
        userId: volunteerSubmissionsTable.userId,
        total: sql<string>`sum(coalesce(${volunteerSubmissionsTable.hoursWorked}, ${eventsTable.hoursValue}))`,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(eq(volunteerSubmissionsTable.status, "approved"))
      .groupBy(volunteerSubmissionsTable.userId),
    db
      .select({ userId: manualHoursTable.userId, total: sql<string>`sum(${manualHoursTable.hours})` })
      .from(manualHoursTable)
      .groupBy(manualHoursTable.userId),
    db
      .select({ userId: externalSubmissionsTable.userId, total: sql<string>`sum(${externalSubmissionsTable.hoursWorked})` })
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.status, "approved"))
      .groupBy(externalSubmissionsTable.userId),
  ]);

  const internalByUser = new Map<string, number>();
  for (const r of internalRows) internalByUser.set(r.userId, Number(r.total ?? 0));
  const manualByUser = new Map<string, number>();
  for (const r of manualRows) manualByUser.set(r.userId, Number(r.total ?? 0));
  const externalByUser = new Map<string, number>();
  for (const r of externalRows) externalByUser.set(r.userId, Number(r.total ?? 0));

  // All participants with org + school for bucketing.
  const participants = await db
    .select({
      userId: usersTable.userId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      grade: usersTable.grade,
      school: usersTable.school,
      organizationId: usersTable.organizationId,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "participant"));

  const orgs = await db
    .select({ organizationId: organizationsTable.organizationId, name: organizationsTable.name })
    .from(organizationsTable);
  const orgName = new Map(orgs.map((o) => [o.organizationId, o.name]));

  // Each participant's medal is judged against their own resolved thresholds.
  const thresholdRows = await db.select().from(awardThresholdsTable);
  const medalKey = (total: number, grade: string | null, orgId: string | null): "gold" | "silver" | "bronze" | "none" => {
    const m = medalForT(total, thresholdsForGrade(thresholdRows, grade, orgId));
    return m ? (m.toLowerCase() as "gold" | "silver" | "bronze") : "none";
  };

  let internalTotal = 0;
  let externalTotal = 0;
  let manualTotal = 0;
  const medalCounts = { gold: 0, silver: 0, bronze: 0, none: 0 };
  let activeVolunteers = 0;
  const byOrg = new Map<string, number>();
  const bySchool = new Map<string, number>();
  const perUser: { userId: string; name: string; hours: number; org: string; medal: string }[] = [];

  for (const p of participants) {
    const internal = internalByUser.get(p.userId) ?? 0;
    const manual = manualByUser.get(p.userId) ?? 0;
    const external = externalByUser.get(p.userId) ?? 0;
    const total = internal + manual + external;
    internalTotal += internal;
    manualTotal += manual;
    externalTotal += external;
    if (total > 0) activeVolunteers++;
    const medal = medalKey(total, p.grade ?? null, p.organizationId ?? null);
    medalCounts[medal]++;
    const org = p.organizationId ? orgName.get(p.organizationId) ?? "Community" : "Community";
    byOrg.set(org, (byOrg.get(org) ?? 0) + total);
    if (p.school) bySchool.set(p.school, (bySchool.get(p.school) ?? 0) + total);
    perUser.push({
      userId: p.userId,
      name: `${p.firstName} ${p.lastName}`.trim(),
      hours: total,
      org,
      medal,
    });
  }

  const round = (n: number) => Math.round(n * 10) / 10;
  const totalApprovedHours = internalTotal + manualTotal + externalTotal;

  // Pending review counts.
  const [pendingInternal, pendingExternal] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(volunteerSubmissionsTable)
      .where(eq(volunteerSubmissionsTable.status, "pending")),
    db
      .select({ c: sql<number>`count(*)` })
      .from(externalSubmissionsTable)
      .where(inArray(externalSubmissionsTable.status, ["pending", "deferred_overflow"])),
  ]);

  // Event stats.
  const today = new Date().toISOString().split("T")[0];
  const [eventAgg] = await db
    .select({
      total: sql<number>`count(*)`,
      upcoming: sql<number>`count(*) filter (where ${eventsTable.eventDate} >= ${today})`,
      capacity: sql<string>`coalesce(sum(${eventsTable.maxCapacity}),0)`,
    })
    .from(eventsTable);
  const [regAgg] = await db
    .select({ total: sql<number>`count(*)` })
    .from(eventRegistrationsTable)
    .leftJoin(eventsTable, eq(eventRegistrationsTable.eventId, eventsTable.eventId))
    .where(gte(eventsTable.eventDate, today));

  const topVolunteers = perUser
    .filter((u) => u.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8)
    .map((u) => ({ name: u.name, hours: round(u.hours), org: u.org, medal: u.medal }));

  const hoursByOrg = [...byOrg.entries()]
    .map(([name, hours]) => ({ name, hours: round(hours) }))
    .sort((a, b) => b.hours - a.hours);
  const hoursBySchool = [...bySchool.entries()]
    .map(([name, hours]) => ({ name, hours: round(hours) }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);

  res.json({
    participants: participants.length,
    activeVolunteers,
    participationRate: participants.length ? Math.round((activeVolunteers / participants.length) * 100) : 0,
    totalApprovedHours: round(totalApprovedHours),
    hoursBreakdown: {
      internal: round(internalTotal),
      manual: round(manualTotal),
      external: round(externalTotal),
    },
    medalCounts,
    medalsAwarded: medalCounts.gold + medalCounts.silver + medalCounts.bronze,
    pendingReviews: Number(pendingInternal?.[0]?.c ?? 0) + Number(pendingExternal?.[0]?.c ?? 0),
    events: {
      total: Number(eventAgg?.total ?? 0),
      upcoming: Number(eventAgg?.upcoming ?? 0),
      upcomingRegistrations: Number(regAgg?.total ?? 0),
      totalCapacity: Number(eventAgg?.capacity ?? 0),
    },
    hoursByOrg,
    hoursBySchool,
    topVolunteers,
  });
});

// GET /api/v1/admin/report-rows — one row per participant with their approved
// hours, school, org, grade, and medal — for drill-down reports + CSV export.
router.get("/v1/admin/report-rows", authenticate, requireRole("admin"), async (_req, res) => {
  const [internalRows, manualRows, externalRows] = await Promise.all([
    db
      .select({
        userId: volunteerSubmissionsTable.userId,
        total: sql<string>`sum(coalesce(${volunteerSubmissionsTable.hoursWorked}, ${eventsTable.hoursValue}))`,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(eq(volunteerSubmissionsTable.status, "approved"))
      .groupBy(volunteerSubmissionsTable.userId),
    db
      .select({ userId: manualHoursTable.userId, total: sql<string>`sum(${manualHoursTable.hours})` })
      .from(manualHoursTable)
      .groupBy(manualHoursTable.userId),
    db
      .select({ userId: externalSubmissionsTable.userId, total: sql<string>`sum(${externalSubmissionsTable.hoursWorked})` })
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.status, "approved"))
      .groupBy(externalSubmissionsTable.userId),
  ]);
  const sum3 = (uid: string) => {
    const g = (rows: { userId: string; total: string }[]) => Number(rows.find((r) => r.userId === uid)?.total ?? 0);
    return g(internalRows) + g(manualRows) + g(externalRows);
  };

  const participants = await db
    .select({
      userId: usersTable.userId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      grade: usersTable.grade,
      school: usersTable.school,
      organizationId: usersTable.organizationId,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "participant"));

  const orgs = await db
    .select({ organizationId: organizationsTable.organizationId, name: organizationsTable.name })
    .from(organizationsTable);
  const orgName = new Map(orgs.map((o) => [o.organizationId, o.name]));
  const thresholdRows = await db.select().from(awardThresholdsTable);

  const round = (n: number) => Math.round(n * 10) / 10;
  const rows = participants
    .map((p) => {
      const hours = round(sum3(p.userId));
      const medal = medalForT(hours, thresholdsForGrade(thresholdRows, p.grade ?? null, p.organizationId ?? null));
      return {
        name: `${p.firstName} ${p.lastName}`.trim(),
        school: p.school ?? "—",
        organization: p.organizationId ? orgName.get(p.organizationId) ?? "Community" : "Community",
        grade: p.grade ?? "—",
        approvedHours: hours,
        medal: medal ? medal.toLowerCase() : "none",
      };
    })
    .sort((a, b) => b.approvedHours - a.approvedHours);

  res.json(rows);
});

export default router;
