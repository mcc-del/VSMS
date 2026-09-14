import { Router } from "express";
import {
  db,
  usersTable,
  eventsTable,
  volunteerSubmissionsTable,
  manualHoursTable,
  organizationsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";

const router = Router();

function medalFor(hours: number): string | null {
  if (hours >= 80) return "Gold";
  if (hours >= 60) return "Silver";
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

// GET /api/v1/leaderboard — a single overall individual ranking (R5). No
// school-vs-school standings. Names respect each student's privacy choice (R6):
// an alias, "Anonymous" if hidden, else first name + last initial. A viewer
// always sees their own real row highlighted, even if they've hidden themselves.
router.get("/v1/leaderboard", authenticate, async (req, res) => {
  const students = await db
    .select({
      userId: usersTable.userId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      grade: usersTable.grade,
      displayAlias: usersTable.displayAlias,
      hideFromLeaderboard: usersTable.hideFromLeaderboard,
      orgCompetes: organizationsTable.competesOnLeaderboard,
    })
    .from(usersTable)
    .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.organizationId))
    .where(eq(usersTable.role, "participant"));

  const hours = await approvedHoursByUser();
  const meId = req.auth!.userId;

  const ranked = students
    // Participants whose org has opted out of competing are excluded from the
    // public board — but a viewer always sees their own row (like alias/hide).
    .filter((s) => s.orgCompetes !== false || s.userId === meId)
    .map((s) => ({
      userId: s.userId,
      firstName: s.firstName,
      lastName: s.lastName,
      alias: s.displayAlias,
      hidden: s.hideFromLeaderboard,
      grade: s.grade ?? null,
      totalApprovedHours: hours.get(s.userId) ?? 0,
    }))
    .sort((a, b) => b.totalApprovedHours - a.totalApprovedHours);

  const entries = ranked.map((r, i) => {
    const isMe = r.userId === meId;
    const realName = `${r.firstName} ${(r.lastName?.[0] ?? "").toUpperCase()}.`.trim();
    const displayName = isMe
      ? r.alias || realName
      : r.hidden
        ? "Anonymous"
        : r.alias || realName;
    return {
      rank: i + 1,
      displayName,
      grade: r.hidden && !isMe ? null : r.grade,
      totalApprovedHours: r.totalApprovedHours,
      medal: medalFor(r.totalApprovedHours),
      isMe,
    };
  });

  const mine = entries.find((e) => e.isMe);
  res.json({
    myRank: mine?.rank ?? null,
    myHours: mine?.totalApprovedHours ?? 0,
    entries,
  });
});

export default router;
