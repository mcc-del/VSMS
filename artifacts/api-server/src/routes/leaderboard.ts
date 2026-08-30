import { Router } from "express";
import {
  db,
  usersTable,
  eventsTable,
  volunteerSubmissionsTable,
  manualHoursTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";

const router = Router();

function medalFor(hours: number): string | null {
  if (hours >= 80) return "Gold";
  if (hours >= 75) return "Silver";
  if (hours >= 40) return "Bronze";
  return null;
}

// Approved hours per user: approved internal (actual hours or planned) + manual credits.
async function approvedHoursByUser(): Promise<Map<string, number>> {
  const internal = await db
    .select({
      userId: volunteerSubmissionsTable.userId,
      total: sql<string>`sum(coalesce(${volunteerSubmissionsTable.hoursWorked}, ${eventsTable.hoursValue}))`,
    })
    .from(volunteerSubmissionsTable)
    .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .where(eq(volunteerSubmissionsTable.status, "approved"))
    .groupBy(volunteerSubmissionsTable.userId);

  const manual = await db
    .select({
      userId: manualHoursTable.userId,
      total: sql<string>`sum(${manualHoursTable.hours})`,
    })
    .from(manualHoursTable)
    .groupBy(manualHoursTable.userId);

  const map = new Map<string, number>();
  for (const r of internal) map.set(r.userId, Number(r.total ?? 0));
  for (const r of manual) map.set(r.userId, (map.get(r.userId) ?? 0) + Number(r.total ?? 0));
  return map;
}

// GET /api/v1/leaderboard — participants in the requester's school, ranked.
router.get("/v1/leaderboard", authenticate, async (req, res) => {
  const [me] = await db
    .select({ userId: usersTable.userId, school: usersTable.school })
    .from(usersTable)
    .where(eq(usersTable.userId, req.auth!.userId))
    .limit(1);

  const school = me?.school ?? null;
  if (!school) {
    res.json({ school: null, myRank: null, myHours: 0, entries: [] });
    return;
  }

  const students = await db
    .select({
      userId: usersTable.userId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      grade: usersTable.grade,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, "participant"), eq(usersTable.school, school)));

  const hours = await approvedHoursByUser();

  const ranked = students
    .map((s) => ({
      userId: s.userId,
      displayName: `${s.firstName} ${(s.lastName?.[0] ?? "").toUpperCase()}.`.trim(),
      grade: s.grade ?? null,
      totalApprovedHours: hours.get(s.userId) ?? 0,
    }))
    .sort((a, b) => b.totalApprovedHours - a.totalApprovedHours);

  const entries = ranked.map((r, i) => ({
    rank: i + 1,
    displayName: r.displayName,
    grade: r.grade,
    totalApprovedHours: r.totalApprovedHours,
    medal: medalFor(r.totalApprovedHours),
    isMe: r.userId === req.auth!.userId,
  }));

  const mine = entries.find((e) => e.isMe);
  res.json({
    school,
    myRank: mine?.rank ?? null,
    myHours: mine?.totalApprovedHours ?? 0,
    entries,
  });
});

// GET /api/v1/leaderboard/schools — aggregate approved hours per school.
router.get("/v1/leaderboard/schools", authenticate, async (_req, res) => {
  const students = await db
    .select({
      userId: usersTable.userId,
      school: usersTable.school,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "participant"));

  const hours = await approvedHoursByUser();

  const bySchool = new Map<string, { total: number; count: number }>();
  for (const s of students) {
    if (!s.school) continue;
    const entry = bySchool.get(s.school) ?? { total: 0, count: 0 };
    entry.total += hours.get(s.userId) ?? 0;
    entry.count += 1;
    bySchool.set(s.school, entry);
  }

  const standings = [...bySchool.entries()]
    .map(([school, v]) => ({
      school,
      totalHours: Math.round(v.total * 10) / 10,
      avgHours: v.count > 0 ? Math.round((v.total / v.count) * 10) / 10 : 0,
      participantCount: v.count,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  res.json(standings);
});

export default router;
