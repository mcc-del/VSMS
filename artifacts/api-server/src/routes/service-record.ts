import { Router, type Request, type Response } from "express";
import {
  db,
  usersTable,
  eventsTable,
  volunteerSubmissionsTable,
  externalSubmissionsTable,
  manualHoursTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole } from "../middlewares/auth";
import { managedOrgIds, canManageOrg } from "../lib/org-scope";
import { guardianshipsTable } from "@workspace/db";
import { or } from "drizzle-orm";

const router = Router();

function medalFor(hours: number): string | null {
  if (hours >= 80) return "Gold";
  if (hours >= 60) return "Silver";
  if (hours >= 40) return "Bronze";
  return null;
}

// School-year label from a date, e.g. Oct 2026 -> "2026–2027", Feb 2027 -> "2026–2027".
// The award season runs Sept 15 – Jun 15, so months Sept–Dec belong to that year's
// season, and Jan–Aug belong to the prior year's season.
function seasonLabel(d: Date): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 8 ? y : y - 1; // month 8 = September (0-indexed)
  return `${startYear}–${startYear + 1}`;
}

type RecordItem = {
  date: string;
  activity: string;
  organization: string;
  hours: number;
  verifiedBy: string;
  type: "event" | "external" | "manual";
};

// Assemble a verified service record for one participant: their profile, the
// approved hours total + medal, and an itemized, verifier-attributed list of
// every approved activity (in-program events, external volunteering, and
// admin-granted credits). This is the record a student hands to a school or
// college to satisfy a service requirement.
async function buildRecord(userId: string): Promise<Record<string, unknown> | null> {
  const [user] = await db
    .select({
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      grade: usersTable.grade,
      school: usersTable.school,
      orgName: organizationsTable.name,
    })
    .from(usersTable)
    .leftJoin(organizationsTable, eq(usersTable.organizationId, organizationsTable.organizationId))
    .where(eq(usersTable.userId, userId));

  if (!user) return null;

  const supervisor = alias(usersTable, "supervisor");
  const eventOrg = alias(organizationsTable, "event_org");

  // Approved in-program event hours.
  const internal = await db
    .select({
      date: eventsTable.eventDate,
      title: eventsTable.title,
      slotLabel: eventsTable.slotLabel,
      hoursWorked: volunteerSubmissionsTable.hoursWorked,
      plannedHours: eventsTable.hoursValue,
      supFirst: supervisor.firstName,
      supLast: supervisor.lastName,
      orgName: eventOrg.name,
    })
    .from(volunteerSubmissionsTable)
    .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .leftJoin(supervisor, eq(eventsTable.supervisorId, supervisor.userId))
    .leftJoin(eventOrg, eq(eventsTable.organizationId, eventOrg.organizationId))
    .where(
      and(
        eq(volunteerSubmissionsTable.userId, userId),
        eq(volunteerSubmissionsTable.status, "approved"),
      ),
    );

  // Approved external volunteering.
  const external = await db
    .select({
      date: externalSubmissionsTable.volunteerDate,
      activity: externalSubmissionsTable.activityName,
      orgName: externalSubmissionsTable.organizationName,
      hours: externalSubmissionsTable.hoursWorked,
      supName: externalSubmissionsTable.extSupervisorName,
    })
    .from(externalSubmissionsTable)
    .where(
      and(
        eq(externalSubmissionsTable.userId, userId),
        eq(externalSubmissionsTable.status, "approved"),
      ),
    );

  // Admin-granted manual credits (auto-approved).
  const awardedBy = alias(usersTable, "awarded_by");
  const manual = await db
    .select({
      date: manualHoursTable.dateAwarded,
      description: manualHoursTable.description,
      hours: manualHoursTable.hours,
      byFirst: awardedBy.firstName,
      byLast: awardedBy.lastName,
    })
    .from(manualHoursTable)
    .leftJoin(awardedBy, eq(manualHoursTable.awardedByUserId, awardedBy.userId))
    .where(eq(manualHoursTable.userId, userId));

  const items: RecordItem[] = [];

  for (const r of internal) {
    const hrs = Number(r.hoursWorked ?? r.plannedHours ?? 0);
    const sup = [r.supFirst, r.supLast].filter(Boolean).join(" ").trim();
    items.push({
      date: r.date ?? "",
      activity: r.slotLabel ? `${r.title} — ${r.slotLabel}` : (r.title ?? "Event"),
      organization: r.orgName ?? "Medina Academy",
      hours: hrs,
      verifiedBy: sup || "Supervisor",
      type: "event",
    });
  }

  for (const r of external) {
    items.push({
      date: r.date ?? "",
      activity: r.activity ?? "External volunteering",
      organization: r.orgName ?? "",
      hours: Number(r.hours ?? 0),
      verifiedBy: r.supName ?? "External supervisor",
      type: "external",
    });
  }

  for (const r of manual) {
    const by = [r.byFirst, r.byLast].filter(Boolean).join(" ").trim();
    items.push({
      date: r.date ?? "",
      activity: r.description ?? "Awarded hours",
      organization: user.orgName ?? "Medina Academy",
      hours: Number(r.hours ?? 0),
      verifiedBy: by ? `${by} (admin credit)` : "Administrator credit",
      type: "manual",
    });
  }

  // Newest first.
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const totalApprovedHours = items.reduce((sum, i) => sum + i.hours, 0);
  const now = new Date();

  return {
    studentName: `${user.firstName} ${user.lastName}`.trim(),
    grade: user.grade ?? null,
    school: user.school ?? null,
    organizationName: user.orgName ?? null,
    season: seasonLabel(now),
    generatedAt: now.toISOString(),
    totalApprovedHours,
    medal: medalFor(totalApprovedHours),
    items,
  };
}

// GET /api/v1/me/service-record — a participant's own verified record.
router.get(
  "/v1/me/service-record",
  authenticate,
  requireRole("participant"),
  async (req: Request, res: Response) => {
    const record = await buildRecord(req.auth!.userId);
    if (!record) {
      res.status(404).json({ error: "Record not found." });
      return;
    }
    res.json(record);
  },
);

// GET /api/v1/admin/users/:userId/service-record — an admin generates the record
// for any participant (e.g. to hand a family a signed statement).
router.get(
  "/v1/admin/users/:userId/service-record",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    // An Admin may only view records for participants in their organization.
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
      const [t] = await db
        .select({ organizationId: usersTable.organizationId })
        .from(usersTable)
        .where(eq(usersTable.userId, userId))
        .limit(1);
      if (!t || !canManageOrg(managed, t.organizationId)) {
        res.status(403).json({ error: "You can only view records for users in your organization." });
        return;
      }
    }
    const record = await buildRecord(userId);
    if (!record) {
      res.status(404).json({ error: "Record not found." });
      return;
    }
    res.json(record);
  },
);

// GET /api/v1/parent/children/:childId/service-record — a parent views a
// managed child's verified record (guardianship-checked).
router.get(
  "/v1/parent/children/:childId/service-record",
  authenticate,
  requireRole("parent"),
  async (req: Request, res: Response) => {
    const { childId } = req.params as { childId: string };
    const parentEmail = req.auth!.email.toLowerCase();
    const [guarded] = await db
      .select({ userId: usersTable.userId })
      .from(usersTable)
      .leftJoin(
        guardianshipsTable,
        and(eq(guardianshipsTable.childUserId, usersTable.userId), eq(guardianshipsTable.guardianUserId, req.auth!.userId)),
      )
      .where(
        and(
          eq(usersTable.userId, childId),
          eq(usersTable.role, "participant"),
          or(eq(guardianshipsTable.guardianUserId, req.auth!.userId), eq(usersTable.parentEmail, parentEmail)),
        ),
      )
      .limit(1);
    if (!guarded) {
      res.status(404).json({ error: "Child not found." });
      return;
    }
    const record = await buildRecord(childId);
    if (!record) {
      res.status(404).json({ error: "Record not found." });
      return;
    }
    res.json(record);
  },
);

export default router;
