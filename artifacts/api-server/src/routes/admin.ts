import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db, usersTable, manualHoursTable, orgAdminsTable, organizationsTable, auditLogsTable, awardThresholdsTable, eventsTable, volunteerSubmissionsTable, externalSubmissionsTable, eventRegistrationsTable } from "@workspace/db";
import { eq, desc, ilike, and, isNull, count, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateUserBody, AddManualHoursBody } from "@workspace/api-zod";
import { sendTestEmail, sendAccountInvite } from "../lib/email";
import { recordAudit } from "../lib/audit";
import { thresholdsForGrade, medalFor, resolveThresholds } from "../lib/thresholds";
import { managedOrgIds, canActOnUser, canManageOrg } from "../lib/org-scope";

const ROLE_LABELS: Record<string, string> = {
  participant: "Participant",
  supervisor: "Supervisor",
  org_admin: "Admin",
  admin: "Super Admin",
  parent: "Parent",
};

const router = Router();

// POST /api/v1/admin/test-email — send a test email to confirm sending works.
router.post("/v1/admin/test-email", authenticate, requireRole("admin"), async (req, res) => {
  const to = typeof (req.body as { to?: unknown })?.to === "string" ? (req.body as { to: string }).to.trim() : "";
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const result = await sendTestEmail(to);
  if (!result.ok) {
    res.status(502).json({ error: result.error ?? "Failed to send." });
    return;
  }
  res.json({ ok: true, id: result.id ?? null, to });
});

// POST /v1/admin/users/:userId/reassign-events — move a supervisor's events to
// another supervisor (e.g. before deleting them).
router.post("/v1/admin/users/:userId/reassign-events", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  const { userId } = req.params as { userId: string };
  const toSupervisorId = typeof (req.body as { toSupervisorId?: unknown })?.toSupervisorId === "string"
    ? (req.body as { toSupervisorId: string }).toSupervisorId : "";
  if (!toSupervisorId || toSupervisorId === userId) {
    res.status(400).json({ error: "Choose a different supervisor to receive the events." });
    return;
  }
  const [target] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.userId, toSupervisorId))
    .limit(1);
  if (!target || !["supervisor", "org_admin", "admin"].includes(target.role)) {
    res.status(400).json({ error: "The chosen recipient must be a supervisor or admin." });
    return;
  }
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
  // Which of this supervisor's events the actor may move.
  const events = await db
    .select({ eventId: eventsTable.eventId, organizationId: eventsTable.organizationId })
    .from(eventsTable)
    .where(eq(eventsTable.supervisorId, userId));
  const movable = managed === null ? events : events.filter((e) => canManageOrg(managed, e.organizationId));
  for (const e of movable) {
    await db.update(eventsTable).set({ supervisorId: toSupervisorId }).where(eq(eventsTable.eventId, e.eventId));
  }
  recordAudit({
    actorUserId: req.auth!.userId,
    action: "events.reassign",
    targetType: "user",
    targetId: userId,
    targetLabel: null,
    summary: `Reassigned ${movable.length} event(s) to another supervisor`,
  });
  res.json({ reassigned: movable.length });
});

// ----- Award thresholds (Super Admin) -----
const VALID_LEVELS = new Set(["elementary", "middle", "high"]);

router.get("/v1/admin/award-thresholds", authenticate, requireRole("admin"), async (_req, res) => {
  const rows = await db
    .select({
      awardThresholdId: awardThresholdsTable.awardThresholdId,
      level: awardThresholdsTable.level,
      organizationId: awardThresholdsTable.organizationId,
      organizationName: organizationsTable.name,
      bronze: awardThresholdsTable.bronze,
      silver: awardThresholdsTable.silver,
      gold: awardThresholdsTable.gold,
    })
    .from(awardThresholdsTable)
    .leftJoin(organizationsTable, eq(awardThresholdsTable.organizationId, organizationsTable.organizationId));
  res.json(rows.map((r) => ({ ...r, organizationName: r.organizationName ?? null })));
});

// GET /api/v1/award-thresholds/public — the general (non-org) medal hour goals
// per grade band, for the public landing & login pages. No auth: it's marketing
// copy, and reflects whatever a Super Admin has configured (falling back to the
// program default). Org-specific overrides are intentionally not exposed here.
router.get("/v1/award-thresholds/public", async (_req, res) => {
  const rows = await db
    .select({
      level: awardThresholdsTable.level,
      organizationId: awardThresholdsTable.organizationId,
      bronze: awardThresholdsTable.bronze,
      silver: awardThresholdsTable.silver,
      gold: awardThresholdsTable.gold,
    })
    .from(awardThresholdsTable);
  const levels = ["elementary", "middle", "high"] as const;
  res.json({
    levels: levels.map((level) => ({
      level,
      ...resolveThresholds(rows, level, null),
    })),
  });
});

router.put("/v1/admin/award-thresholds", authenticate, requireRole("admin"), async (req, res) => {
  const b = (req.body ?? {}) as { level?: unknown; organizationId?: unknown; bronze?: unknown; silver?: unknown; gold?: unknown };
  const level = typeof b.level === "string" && VALID_LEVELS.has(b.level) ? b.level : null;
  const organizationId = typeof b.organizationId === "string" && b.organizationId ? b.organizationId : null;
  const bronze = Number(b.bronze), silver = Number(b.silver), gold = Number(b.gold);
  if (![bronze, silver, gold].every((n) => Number.isFinite(n) && n >= 1 && n <= 10000)) {
    res.status(400).json({ error: "Bronze, Silver and Gold must be positive numbers." });
    return;
  }
  if (!(bronze <= silver && silver <= gold)) {
    res.status(400).json({ error: "Thresholds must increase: Bronze ≤ Silver ≤ Gold." });
    return;
  }
  const [existing] = await db
    .select({ id: awardThresholdsTable.awardThresholdId })
    .from(awardThresholdsTable)
    .where(and(
      level === null ? isNull(awardThresholdsTable.level) : eq(awardThresholdsTable.level, level),
      organizationId === null ? isNull(awardThresholdsTable.organizationId) : eq(awardThresholdsTable.organizationId, organizationId),
    ))
    .limit(1);
  let row;
  if (existing) {
    [row] = await db.update(awardThresholdsTable).set({ bronze, silver, gold, updatedAt: new Date() }).where(eq(awardThresholdsTable.awardThresholdId, existing.id)).returning();
  } else {
    [row] = await db.insert(awardThresholdsTable).values({ level, organizationId, bronze, silver, gold }).returning();
  }
  recordAudit({
    actorUserId: req.auth!.userId,
    action: "thresholds.update",
    targetType: "thresholds",
    targetId: row.awardThresholdId,
    targetLabel: `${level ?? "all grades"} / ${organizationId ? "org" : "all orgs"}`,
    summary: `Set award thresholds (${level ?? "all grades"}${organizationId ? ", one org" : ""}) to Bronze ${bronze} / Silver ${silver} / Gold ${gold}`,
  });
  res.json({
    awardThresholdId: row.awardThresholdId,
    level: row.level ?? null,
    organizationId: row.organizationId ?? null,
    organizationName: null,
    bronze: row.bronze, silver: row.silver, gold: row.gold,
  });
});

router.delete("/v1/admin/award-thresholds/:awardThresholdId", authenticate, requireRole("admin"), async (req, res) => {
  const { awardThresholdId } = req.params as { awardThresholdId: string };
  await db.delete(awardThresholdsTable).where(eq(awardThresholdsTable.awardThresholdId, awardThresholdId));
  recordAudit({
    actorUserId: req.auth!.userId,
    action: "thresholds.delete",
    targetType: "thresholds",
    targetId: awardThresholdId,
    targetLabel: null,
    summary: "Removed an award-threshold override",
  });
  res.json({ ok: true });
});

// GET /api/v1/admin/audit-log — recent admin activity (Super Admin only).
router.get("/v1/admin/audit-log", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  const filters = [] as any[];
  if (action) filters.push(ilike(auditLogsTable.action, `%${action}%`));

  // Org Admins see only actions taken by people in their own organization(s) —
  // themselves and their supervisors. Super Admins see everything.
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
  if (managed !== null) {
    const orgUsers = await db
      .select({ userId: usersTable.userId })
      .from(usersTable)
      .where(managed.length > 0 ? inArray(usersTable.organizationId, managed) : isNull(usersTable.userId));
    const ids = orgUsers.map((u) => u.userId);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    filters.push(inArray(auditLogsTable.actorUserId, ids));
  }

  const where = filters.length ? and(...filters) : undefined;
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit);
  res.json(
    rows.map((r) => ({
      auditLogId: r.auditLogId,
      actorName: r.actorName,
      actorRole: r.actorRole,
      action: r.action,
      targetType: r.targetType ?? null,
      targetId: r.targetId ?? null,
      targetLabel: r.targetLabel ?? null,
      summary: r.summary,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// GET /api/v1/admin/users
router.get("/v1/admin/users", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  // Resolve scope from the requester's CURRENT database role, not the JWT role.
  // A stale token (e.g. issued while the account was a Super Admin, or before an
  // org_admin's access changed) must never widen what they can see.
  const [me] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.userId, req.auth!.userId))
    .limit(1);
  const effectiveRole = me?.role ?? req.auth!.role;
  const managed = await managedOrgIds(req.auth!.userId, effectiveRole);

  const users = await db
    .select({
      userId: usersTable.userId,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      organizationId: usersTable.organizationId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  // Map each org-admin to the organizations they manage.
  const adminRows = await db
    .select({ userId: orgAdminsTable.userId, organizationId: orgAdminsTable.organizationId })
    .from(orgAdminsTable);
  const managedByUser = new Map<string, string[]>();
  for (const r of adminRows) {
    const list = managedByUser.get(r.userId) ?? [];
    list.push(r.organizationId);
    managedByUser.set(r.userId, list);
  }

  // Org id -> name for showing each user's affiliation.
  const orgs = await db
    .select({ organizationId: organizationsTable.organizationId, name: organizationsTable.name })
    .from(organizationsTable);
  const orgName = new Map(orgs.map((o) => [o.organizationId, o.name]));

  // An Admin (org_admin) only sees non-admin users in their organization(s).
  const visible = managed === null
    ? users
    : users.filter((u) => canActOnUser(managed, u.role, u.organizationId));

  res.json(
    visible.map((u) => ({
      userId: u.userId,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      organizationId: u.organizationId ?? null,
      organizationName: u.organizationId ? orgName.get(u.organizationId) ?? null : null,
      managedOrganizationIds: managedByUser.get(u.userId) ?? [],
    })),
  );
});

// PATCH /api/v1/admin/users/:userId/org-admin — Super Admin promotes a user to
// Organization Admin over the given orgs, or demotes them (empty list).
router.patch(
  "/v1/admin/users/:userId/org-admin",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
    const raw = (req.body as { organizationIds?: unknown })?.organizationIds;
    const organizationIds = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];

    const [target] = await db
      .select({ userId: usersTable.userId, role: usersTable.role, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    if (userId === req.auth!.userId) {
      res.status(400).json({ error: "You can't change your own admin access." });
      return;
    }
    // A Super Admin can be re-scoped down to a single-org Admin (e.g. an account
    // that was mistakenly created as a Super Admin), but never leave the program
    // with no Super Admin at all.
    if (target.role === "admin") {
      const [{ value: superAdmins }] = await db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"));
      if (superAdmins <= 1) {
        res.status(400).json({ error: "There must be at least one Super Admin. Promote someone else first." });
        return;
      }
    }

    // Replace this user's managed-org rows.
    await db.delete(orgAdminsTable).where(eq(orgAdminsTable.userId, userId));

    const targetLabel = `${target.firstName ?? ""} ${target.lastName ?? ""}`.trim() || userId;
    if (organizationIds.length === 0) {
      // Demote back to a regular participant.
      await db.update(usersTable).set({ role: "participant" }).where(eq(usersTable.userId, userId));
      recordAudit({
        actorUserId: req.auth!.userId,
        action: "user.role_change",
        targetType: "user",
        targetId: userId,
        targetLabel,
        summary: `Removed Admin access from ${targetLabel} (reverted to participant)`,
      });
      res.json({ role: "participant", organizationIds: [] });
      return;
    }

    for (const organizationId of organizationIds) {
      await db.insert(orgAdminsTable).values({ userId, organizationId }).onConflictDoNothing();
    }
    await db.update(usersTable).set({ role: "org_admin" }).where(eq(usersTable.userId, userId));
    recordAudit({
      actorUserId: req.auth!.userId,
      action: "user.role_change",
      targetType: "user",
      targetId: userId,
      targetLabel,
      summary: `Granted Admin access to ${targetLabel} for ${organizationIds.length} organization(s)`,
    });
    res.json({ role: "org_admin", organizationIds });
  },
);

// POST /api/v1/admin/users
router.post(
  "/v1/admin/users",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { firstName, lastName, email, password, role, phone, organizationId } = parsed.data as typeof parsed.data & {
      phone?: string;
      organizationId?: string | null;
    };

    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    // An Admin may only create non-admin users, stamped to their own org. A
    // Super Admin may create any role and choose the org (or leave it unset).
    let newUserOrgId: string | null = null;
    if (managed !== null) {
      if (role !== "participant" && role !== "supervisor") {
        res.status(403).json({ error: "Admins can only create participants and supervisors." });
        return;
      }
      if (managed.length === 0) {
        res.status(403).json({ error: "You don't manage any organization." });
        return;
      }
      // An Admin may choose among the organizations they manage; default to
      // their first if none was specified.
      if (organizationId) {
        if (!managed.includes(organizationId)) {
          res.status(403).json({ error: "You can only assign users to an organization you manage." });
          return;
        }
        newUserOrgId = organizationId;
      } else {
        newUserOrgId = managed[0];
      }
    } else if (organizationId) {
      // Super Admin picked an organization — validate it exists.
      const [org] = await db
        .select({ organizationId: organizationsTable.organizationId })
        .from(organizationsTable)
        .where(eq(organizationsTable.organizationId, organizationId))
        .limit(1);
      if (!org) {
        res.status(400).json({ error: "That organization doesn't exist." });
        return;
      }
      newUserOrgId = organizationId;
    }

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "Email address is already registered." });
      return;
    }

    // Supervisors and Admins must belong to an organization.
    if ((role === "supervisor" || role === "org_admin") && !newUserOrgId) {
      res.status(400).json({ error: "Please choose an organization for this supervisor/admin." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // Also issue a set-password invite token so the new person sets their own
    // password rather than relying on the admin-typed temporary one.
    const inviteToken = randomBytes(32).toString("hex");
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [user] = await db
      .insert(usersTable)
      .values({
        firstName,
        lastName,
        email: email.toLowerCase(),
        passwordHash,
        role: role as "participant" | "supervisor" | "org_admin" | "admin",
        phone: phone?.trim() || null,
        organizationId: newUserOrgId,
        resetToken: inviteToken,
        resetTokenExpiresAt: inviteExpires,
      })
      .returning();

    // An Admin (org_admin) manages the organization they were assigned to.
    // Record the org-admin membership so their scope resolves correctly.
    if (role === "org_admin" && newUserOrgId) {
      await db
        .insert(orgAdminsTable)
        .values({ userId: user.userId, organizationId: newUserOrgId })
        .onConflictDoNothing();
    }

    // Fire-and-forget the invite email (no-op if email isn't configured).
    sendAccountInvite(user.email!, user.firstName, ROLE_LABELS[user.role] ?? user.role, inviteToken)
      .catch((err) => req.log.error({ err }, "account invite email failed"));

    recordAudit({
      actorUserId: req.auth!.userId,
      action: "user.create",
      targetType: "user",
      targetId: user.userId,
      targetLabel: `${user.firstName} ${user.lastName}`,
      summary: `Created ${ROLE_LABELS[user.role] ?? user.role} account for ${user.firstName} ${user.lastName} (${user.email})`,
    });

    res.status(201).json({
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      phone: user.phone ?? null,
      createdAt: user.createdAt.toISOString(),
    });
  },
);

// PATCH /api/v1/admin/users/:userId — edit a user's name and/or phone.
router.patch("/v1/admin/users/:userId", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  const { userId } = req.params as { userId: string };
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
  if (managed !== null) {
    const [t] = await db.select({ role: usersTable.role, organizationId: usersTable.organizationId })
      .from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
    if (!t) { res.status(404).json({ error: "User not found." }); return; }
    if (!canActOnUser(managed, t.role, t.organizationId)) {
      res.status(403).json({ error: "You can only manage users in your organization." });
      return;
    }
  }
  const body = (req.body ?? {}) as { firstName?: unknown; lastName?: unknown; phone?: unknown; organizationId?: unknown };
  const updates: { firstName?: string; lastName?: string; phone?: string | null; organizationId?: string | null } = {};
  if (typeof body.firstName === "string" && body.firstName.trim()) updates.firstName = body.firstName.trim();
  if (typeof body.lastName === "string" && body.lastName.trim()) updates.lastName = body.lastName.trim();
  if ("phone" in body) {
    updates.phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  }
  // Only a Super Admin may reassign a user's organization (affiliation).
  if ("organizationId" in body && req.auth!.role === "admin") {
    updates.organizationId = typeof body.organizationId === "string" && body.organizationId ? body.organizationId : null;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update." });
    return;
  }
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.userId, userId))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json({
    userId: user.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    phone: user.phone ?? null,
    createdAt: user.createdAt.toISOString(),
  });
});

// GET /api/v1/admin/users/:userId/hours — list manual credits for a participant
router.get(
  "/v1/admin/users/:userId/hours",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
      const [t] = await db.select({ role: usersTable.role, organizationId: usersTable.organizationId })
        .from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
      if (!t || !canActOnUser(managed, t.role, t.organizationId)) {
        res.status(403).json({ error: "You can only manage users in your organization." });
        return;
      }
    }
    const awarder = alias(usersTable, "awarder");
    const rows = await db
      .select({
        manualHoursId: manualHoursTable.manualHoursId,
        userId: manualHoursTable.userId,
        hours: manualHoursTable.hours,
        description: manualHoursTable.description,
        dateAwarded: manualHoursTable.dateAwarded,
        createdAt: manualHoursTable.createdAt,
        awardedByFirst: awarder.firstName,
        awardedByLast: awarder.lastName,
      })
      .from(manualHoursTable)
      .leftJoin(awarder, eq(manualHoursTable.awardedByUserId, awarder.userId))
      .where(eq(manualHoursTable.userId, userId))
      .orderBy(desc(manualHoursTable.createdAt));

    res.json(
      rows.map((r) => ({
        manualHoursId: r.manualHoursId,
        userId: r.userId,
        hours: Number(r.hours),
        description: r.description,
        dateAwarded: r.dateAwarded,
        awardedByName:
          r.awardedByFirst || r.awardedByLast
            ? `${r.awardedByFirst ?? ""} ${r.awardedByLast ?? ""}`.trim()
            : null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

// POST /api/v1/admin/users/:userId/hours — grant a manual hour credit
router.post(
  "/v1/admin/users/:userId/hours",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
    const parsed = AddManualHoursBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const [target] = await db
      .select({ userId: usersTable.userId, role: usersTable.role, organizationId: usersTable.organizationId })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (!canActOnUser(managed, target.role, target.organizationId)) {
      res.status(403).json({ error: "You can only add hours for users in your organization." });
      return;
    }

    const { hours, description, dateAwarded } = parsed.data;
    const [credit] = await db
      .insert(manualHoursTable)
      .values({
        userId,
        hours: String(hours),
        description,
        dateAwarded,
        awardedByUserId: req.auth!.userId,
      })
      .returning();

    recordAudit({
      actorUserId: req.auth!.userId,
      action: "hours.grant",
      targetType: "user",
      targetId: userId,
      targetLabel: null,
      summary: `Granted ${hours} manual hour(s): "${description}"`,
    });

    res.status(201).json({
      manualHoursId: credit.manualHoursId,
      userId: credit.userId,
      hours: Number(credit.hours),
      description: credit.description,
      dateAwarded: credit.dateAwarded,
      awardedByName: null,
      createdAt: credit.createdAt.toISOString(),
    });
  },
);

// DELETE /api/v1/admin/hours/:creditId — remove a manual credit
router.delete(
  "/v1/admin/hours/:creditId",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const { creditId } = req.params as { creditId: string };
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
      const [credit] = await db
        .select({ userId: manualHoursTable.userId })
        .from(manualHoursTable)
        .where(eq(manualHoursTable.manualHoursId, creditId))
        .limit(1);
      if (!credit) { res.json({ status: "success", message: "Manual hours removed" }); return; }
      const [t] = await db.select({ role: usersTable.role, organizationId: usersTable.organizationId })
        .from(usersTable).where(eq(usersTable.userId, credit.userId)).limit(1);
      if (!t || !canActOnUser(managed, t.role, t.organizationId)) {
        res.status(403).json({ error: "You can only manage users in your organization." });
        return;
      }
    }
    await db.delete(manualHoursTable).where(eq(manualHoursTable.manualHoursId, creditId));
    recordAudit({
      actorUserId: req.auth!.userId,
      action: "hours.delete",
      targetType: "hours",
      targetId: creditId,
      targetLabel: null,
      summary: "Removed a manual hours credit",
    });
    res.json({ status: "success", message: "Manual hours removed" });
  },
);

// DELETE /api/v1/admin/users/:userId
router.delete(
  "/v1/admin/users/:userId",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (managed !== null) {
      const [t] = await db.select({ role: usersTable.role, organizationId: usersTable.organizationId })
        .from(usersTable).where(eq(usersTable.userId, userId)).limit(1);
      if (!t) { res.json({ status: "success", message: "User deleted" }); return; }
      if (!canActOnUser(managed, t.role, t.organizationId)) {
        res.status(403).json({ error: "You can only delete users in your organization." });
        return;
      }
    }
    const [victim] = await db
      .select({ firstName: usersTable.firstName, lastName: usersTable.lastName, email: usersTable.email, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);

    // A user who supervises events can't be deleted (events — and any approved
    // hours on them — must be preserved). Reassign or remove those events first.
    const [evCount] = await db
      .select({ c: count() })
      .from(eventsTable)
      .where(eq(eventsTable.supervisorId, userId));
    if (Number(evCount?.c ?? 0) > 0) {
      res.status(400).json({
        error: `This person supervises ${evCount.c} event(s) and can't be deleted. Reassign those events to another supervisor (edit each event) or delete the events first, then delete this user.`,
      });
      return;
    }

    await db.delete(usersTable).where(eq(usersTable.userId, userId));
    if (victim) {
      recordAudit({
        actorUserId: req.auth!.userId,
        action: "user.delete",
        targetType: "user",
        targetId: userId,
        targetLabel: `${victim.firstName} ${victim.lastName}`,
        summary: `Deleted ${ROLE_LABELS[victim.role] ?? victim.role} ${victim.firstName} ${victim.lastName} (${victim.email ?? "no email"})`,
      });
    }
    res.json({ status: "success", message: "User deleted" });
  },
);

// GET /api/v1/admin/org-insights — org-scoped analytics for an Org Admin
// (or all orgs for a Super Admin): participants, hours, medal mix, events.
router.get("/v1/admin/org-insights", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);

  // Participants in scope.
  const participants = await db
    .select({ userId: usersTable.userId, grade: usersTable.grade, organizationId: usersTable.organizationId })
    .from(usersTable)
    .where(
      managed === null
        ? eq(usersTable.role, "participant")
        : and(eq(usersTable.role, "participant"), managed.length ? inArray(usersTable.organizationId, managed) : isNull(usersTable.userId)),
    );
  const pIds = participants.map((p) => p.userId);

  // Approved internal + manual hours per participant.
  const hoursByUser = new Map<string, number>();
  if (pIds.length) {
    const subs = await db
      .select({ userId: volunteerSubmissionsTable.userId, hours: volunteerSubmissionsTable.hoursWorked })
      .from(volunteerSubmissionsTable)
      .where(and(eq(volunteerSubmissionsTable.status, "approved"), inArray(volunteerSubmissionsTable.userId, pIds)));
    for (const s of subs) hoursByUser.set(s.userId, (hoursByUser.get(s.userId) ?? 0) + Number(s.hours ?? 0));
    const manual = await db
      .select({ userId: manualHoursTable.userId, hours: manualHoursTable.hours })
      .from(manualHoursTable)
      .where(inArray(manualHoursTable.userId, pIds));
    for (const m of manual) hoursByUser.set(m.userId, (hoursByUser.get(m.userId) ?? 0) + Number(m.hours ?? 0));
  }

  const thresholdRows = await db.select().from(awardThresholdsTable);
  let totalHours = 0;
  const medals = { gold: 0, silver: 0, bronze: 0, none: 0 };
  for (const p of participants) {
    const h = hoursByUser.get(p.userId) ?? 0;
    totalHours += h;
    const medal = medalFor(h, thresholdsForGrade(thresholdRows, p.grade, p.organizationId ?? null));
    if (medal === "Gold") medals.gold++;
    else if (medal === "Silver") medals.silver++;
    else if (medal === "Bronze") medals.bronze++;
    else medals.none++;
  }

  // Events + pending reviews in scope.
  const allEvents = await db
    .select({ eventId: eventsTable.eventId, organizationId: eventsTable.organizationId, eventDate: eventsTable.eventDate })
    .from(eventsTable);
  const scopedEvents = managed === null ? allEvents : allEvents.filter((e) => e.organizationId && managed.includes(e.organizationId));
  const today = new Date().toISOString().split("T")[0];

  const pendingRows = await db
    .select({ eventId: volunteerSubmissionsTable.eventId, organizationId: eventsTable.organizationId })
    .from(volunteerSubmissionsTable)
    .innerJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .where(eq(volunteerSubmissionsTable.status, "pending"));
  const pendingCount = managed === null ? pendingRows.length : pendingRows.filter((r) => r.organizationId && managed.includes(r.organizationId)).length;

  res.json({
    participants: participants.length,
    totalApprovedHours: Math.round(totalHours * 10) / 10,
    medals,
    events: scopedEvents.length,
    upcomingEvents: scopedEvents.filter((e) => e.eventDate >= today).length,
    pendingReviews: pendingCount,
  });
});

// GET /api/v1/admin/pending-reviews — supervisors with unreviewed (pending)
// hours, so an Admin can nudge them. Supervisors have 7 days after an event to
// review; anything older is flagged overdue. Org-scoped for Org Admins.
router.get("/v1/admin/pending-reviews", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
  const supervisorUsers = alias(usersTable, "pr_supervisor");
  const rows = await db
    .select({
      supervisorId: eventsTable.supervisorId,
      supervisorFirstName: supervisorUsers.firstName,
      supervisorLastName: supervisorUsers.lastName,
      eventDate: eventsTable.eventDate,
      organizationId: eventsTable.organizationId,
    })
    .from(volunteerSubmissionsTable)
    .innerJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
    .leftJoin(supervisorUsers, eq(eventsTable.supervisorId, supervisorUsers.userId))
    .where(eq(volunteerSubmissionsTable.status, "pending"));

  const visible = managed === null ? rows : rows.filter((r) => canManageOrg(managed, r.organizationId));

  const today = new Date();
  const overdue = (d: string | null) => {
    if (!d) return false;
    const ended = new Date(d + "T23:59:59");
    return (today.getTime() - ended.getTime()) / (1000 * 60 * 60 * 24) > 7;
  };

  const bySup = new Map<string, { supervisorId: string; supervisorName: string; pendingCount: number; overdueCount: number; oldestEventDate: string | null }>();
  for (const r of visible) {
    if (!r.supervisorId) continue;
    const g = bySup.get(r.supervisorId) ?? {
      supervisorId: r.supervisorId,
      supervisorName: `${r.supervisorFirstName ?? ""} ${r.supervisorLastName ?? ""}`.trim() || "Unknown",
      pendingCount: 0,
      overdueCount: 0,
      oldestEventDate: null as string | null,
    };
    g.pendingCount += 1;
    if (overdue(r.eventDate)) g.overdueCount += 1;
    if (r.eventDate && (!g.oldestEventDate || r.eventDate < g.oldestEventDate)) g.oldestEventDate = r.eventDate;
    bySup.set(r.supervisorId, g);
  }

  const supervisors = [...bySup.values()].sort((a, b) => b.overdueCount - a.overdueCount || b.pendingCount - a.pendingCount);
  res.json({ supervisors });
});

// GET /api/v1/supervisor/reports — deep-dive analytics for a supervisor (their
// own events) or an Org Admin / Super Admin (all events in their org(s), broken
// down per supervisor). Covers fill rate, attendance, hours + dollar value, and
// review timeliness (the 7-day-post-event rule).
//
// Independent Sector's 2024 estimated value of a volunteer hour in the U.S.
// (~$34.79). Used only to translate donated hours into an approximate dollar
// value; adjust as the figure is updated.
const VOLUNTEER_HOUR_VALUE = 34.79;

router.get("/v1/supervisor/reports", authenticate, requireRole("supervisor", "org_admin", "admin"), async (req, res) => {
  const role = req.auth!.role;
  const userId = req.auth!.userId;

  // Scope events to what this viewer owns/manages.
  const supUsers = alias(usersTable, "rep_supervisor");
  const allEvents = await db
    .select({
      eventId: eventsTable.eventId,
      title: eventsTable.title,
      eventDate: eventsTable.eventDate,
      endTime: eventsTable.endTime,
      maxCapacity: eventsTable.maxCapacity,
      hoursValue: eventsTable.hoursValue,
      supervisorId: eventsTable.supervisorId,
      organizationId: eventsTable.organizationId,
      supervisorFirstName: supUsers.firstName,
      supervisorLastName: supUsers.lastName,
    })
    .from(eventsTable)
    .leftJoin(supUsers, eq(eventsTable.supervisorId, supUsers.userId));

  let scopedEvents = allEvents;
  if (role === "supervisor") {
    scopedEvents = allEvents.filter((e) => e.supervisorId === userId);
  } else if (role === "org_admin") {
    const managed = await managedOrgIds(userId, role);
    scopedEvents = managed === null ? allEvents : allEvents.filter((e) => e.organizationId && managed.includes(e.organizationId));
  }
  const eventIds = scopedEvents.map((e) => e.eventId);
  const eventById = new Map(scopedEvents.map((e) => [e.eventId, e]));

  // Registrations (sign-ups + attendance) for scoped events.
  const regs = eventIds.length
    ? await db
        .select({ eventId: eventRegistrationsTable.eventId, status: eventRegistrationsTable.status })
        .from(eventRegistrationsTable)
        .where(inArray(eventRegistrationsTable.eventId, eventIds))
    : [];

  // Internal submissions for scoped events (hours + review timeliness).
  const subs = eventIds.length
    ? await db
        .select({
          eventId: volunteerSubmissionsTable.eventId,
          status: volunteerSubmissionsTable.status,
          hoursWorked: volunteerSubmissionsTable.hoursWorked,
          submittedAt: volunteerSubmissionsTable.submittedAt,
          reviewedAt: volunteerSubmissionsTable.reviewedAt,
        })
        .from(volunteerSubmissionsTable)
        .where(inArray(volunteerSubmissionsTable.eventId, eventIds))
    : [];

  const now = Date.now();
  const DAY = 1000 * 60 * 60 * 24;
  // On-time = reviewed within 7 days after the event date.
  function deadlineFor(eventDate: string): number {
    return new Date(eventDate + "T23:59:59").getTime() + 7 * DAY;
  }

  type EventAgg = {
    eventId: string; title: string; eventDate: string; supervisorId: string; supervisorName: string;
    capacity: number; signups: number; attended: number; noShow: number;
    approvedHours: number; pending: number; approved: number; rejected: number;
    onTime: number; tardy: number; overduePending: number;
  };
  const perEvent = new Map<string, EventAgg>();
  for (const e of scopedEvents) {
    perEvent.set(e.eventId, {
      eventId: e.eventId,
      title: e.title,
      eventDate: e.eventDate,
      supervisorId: e.supervisorId,
      supervisorName: `${e.supervisorFirstName ?? ""} ${e.supervisorLastName ?? ""}`.trim() || "Unknown",
      capacity: e.maxCapacity,
      signups: 0, attended: 0, noShow: 0,
      approvedHours: 0, pending: 0, approved: 0, rejected: 0,
      onTime: 0, tardy: 0, overduePending: 0,
    });
  }
  for (const r of regs) {
    const a = perEvent.get(r.eventId);
    if (!a) continue;
    a.signups += 1;
    if (r.status === "attended") a.attended += 1;
    else if (r.status === "no_show") a.noShow += 1;
  }
  for (const s of subs) {
    const a = perEvent.get(s.eventId);
    if (!a) continue;
    if (s.status === "approved") {
      a.approved += 1;
      a.approvedHours += Number(s.hoursWorked ?? 0);
    } else if (s.status === "rejected") {
      a.rejected += 1;
    } else if (s.status === "pending") {
      a.pending += 1;
    }
    const ev = eventById.get(s.eventId);
    const deadline = ev ? deadlineFor(ev.eventDate) : now;
    if (s.status === "pending") {
      if (now > deadline) a.overduePending += 1;
    } else if (s.reviewedAt) {
      const reviewedMs = new Date(s.reviewedAt as unknown as string).getTime();
      if (reviewedMs <= deadline) a.onTime += 1;
      else a.tardy += 1;
    }
  }

  const events = [...perEvent.values()].sort((x, y) => y.eventDate.localeCompare(x.eventDate));

  // Aggregate across all scoped events.
  const totals = events.reduce(
    (t, e) => {
      t.events += 1;
      t.capacity += e.capacity;
      t.signups += e.signups;
      t.attended += e.attended;
      t.noShow += e.noShow;
      t.approvedHours += e.approvedHours;
      t.pending += e.pending;
      t.approved += e.approved;
      t.rejected += e.rejected;
      t.onTime += e.onTime;
      t.tardy += e.tardy;
      t.overduePending += e.overduePending;
      return t;
    },
    { events: 0, capacity: 0, signups: 0, attended: 0, noShow: 0, approvedHours: 0, pending: 0, approved: 0, rejected: 0, onTime: 0, tardy: 0, overduePending: 0 },
  );

  // Per-supervisor breakdown (Org Admin / Super Admin only).
  let supervisors: any[] = [];
  if (role === "org_admin" || role === "admin") {
    const bySup = new Map<string, any>();
    for (const e of events) {
      const g = bySup.get(e.supervisorId) ?? {
        supervisorId: e.supervisorId,
        supervisorName: e.supervisorName,
        events: 0, capacity: 0, signups: 0, attended: 0, noShow: 0,
        approvedHours: 0, pending: 0, approved: 0, rejected: 0, onTime: 0, tardy: 0, overduePending: 0,
      };
      g.events += 1; g.capacity += e.capacity; g.signups += e.signups; g.attended += e.attended; g.noShow += e.noShow;
      g.approvedHours += e.approvedHours; g.pending += e.pending; g.approved += e.approved; g.rejected += e.rejected;
      g.onTime += e.onTime; g.tardy += e.tardy; g.overduePending += e.overduePending;
      bySup.set(e.supervisorId, g);
    }
    supervisors = [...bySup.values()]
      .map((g) => ({ ...g, approvedHours: Math.round(g.approvedHours * 10) / 10 }))
      .sort((a, b) => b.approvedHours - a.approvedHours);
  }

  res.json({
    valuePerHour: VOLUNTEER_HOUR_VALUE,
    totals: { ...totals, approvedHours: Math.round(totals.approvedHours * 10) / 10 },
    events: events.map((e) => ({ ...e, approvedHours: Math.round(e.approvedHours * 10) / 10 })),
    supervisors,
  });
});

// GET /api/v1/admin/duplicates — accounts that share a phone number (a parent's
// own phone or a student's parent phone). Helps a Super Admin spot and merge
// duplicate parent accounts.
router.get("/v1/admin/duplicates", authenticate, requireRole("admin"), async (_req, res) => {
  const rows = await db
    .select({
      userId: usersTable.userId,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      role: usersTable.role,
      phone: usersTable.phone,
      parentPhone: usersTable.parentPhone,
    })
    .from(usersTable);

  const norm = (p: string | null) => (p ? p.replace(/[^0-9]/g, "") : "");
  const byPhone = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = norm(r.phone) || norm(r.parentPhone);
    if (!key) continue;
    const list = byPhone.get(key) ?? [];
    list.push(r);
    byPhone.set(key, list);
  }

  const groups = [...byPhone.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([phone, list]) => ({
      phone,
      accounts: list.map((u) => ({
        userId: u.userId,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        role: u.role,
      })),
    }));

  res.json({ groups });
});

// GET /api/v1/admin/users/:userId/all-hours — every hour entry logged for one
// user (in-program event submissions, external volunteering, and admin
// credits), across all statuses, so a Super Admin can review and clean up test
// data. (Distinct from /hours, which lists only manual credits.)
router.get(
  "/v1/admin/users/:userId/all-hours",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };

    const internal = await db
      .select({
        id: volunteerSubmissionsTable.submissionId,
        status: volunteerSubmissionsTable.status,
        hoursWorked: volunteerSubmissionsTable.hoursWorked,
        submittedAt: volunteerSubmissionsTable.submittedAt,
        title: eventsTable.title,
        slotLabel: eventsTable.slotLabel,
        eventDate: eventsTable.eventDate,
        plannedHours: eventsTable.hoursValue,
      })
      .from(volunteerSubmissionsTable)
      .leftJoin(eventsTable, eq(volunteerSubmissionsTable.eventId, eventsTable.eventId))
      .where(eq(volunteerSubmissionsTable.userId, userId));

    const external = await db
      .select({
        id: externalSubmissionsTable.externalSubmissionId,
        status: externalSubmissionsTable.status,
        hours: externalSubmissionsTable.hoursWorked,
        date: externalSubmissionsTable.volunteerDate,
        activity: externalSubmissionsTable.activityName,
        orgName: externalSubmissionsTable.organizationName,
      })
      .from(externalSubmissionsTable)
      .where(eq(externalSubmissionsTable.userId, userId));

    const manual = await db
      .select({
        id: manualHoursTable.manualHoursId,
        hours: manualHoursTable.hours,
        date: manualHoursTable.dateAwarded,
        description: manualHoursTable.description,
      })
      .from(manualHoursTable)
      .where(eq(manualHoursTable.userId, userId));

    const entries = [
      ...internal.map((r) => ({
        id: r.id,
        type: "event" as const,
        status: r.status,
        date: r.eventDate ?? "",
        activity: r.slotLabel ? `${r.title ?? "Event"} — ${r.slotLabel}` : (r.title ?? "Event"),
        organization: null as string | null,
        hours: Number(r.hoursWorked ?? r.plannedHours ?? 0),
      })),
      ...external.map((r) => ({
        id: r.id,
        type: "external" as const,
        status: r.status,
        date: r.date ?? "",
        activity: r.activity ?? "External volunteering",
        organization: r.orgName ?? null,
        hours: Number(r.hours ?? 0),
      })),
      ...manual.map((r) => ({
        id: r.id,
        type: "manual" as const,
        status: "approved",
        date: r.date ?? "",
        activity: r.description ?? "Awarded hours",
        organization: null as string | null,
        hours: Number(r.hours ?? 0),
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    res.json({ entries });
  },
);

// DELETE /api/v1/admin/users/:userId/hours/:type/:id — permanently remove one
// hour entry (event submission, external submission, or manual credit). Used to
// clean up test data. Super Admin only.
router.delete(
  "/v1/admin/users/:userId/all-hours/:type/:id",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { userId, type, id } = req.params as { userId: string; type: string; id: string };

    if (type === "event") {
      await db
        .delete(volunteerSubmissionsTable)
        .where(and(eq(volunteerSubmissionsTable.submissionId, id), eq(volunteerSubmissionsTable.userId, userId)));
    } else if (type === "external") {
      await db
        .delete(externalSubmissionsTable)
        .where(and(eq(externalSubmissionsTable.externalSubmissionId, id), eq(externalSubmissionsTable.userId, userId)));
    } else if (type === "manual") {
      await db
        .delete(manualHoursTable)
        .where(and(eq(manualHoursTable.manualHoursId, id), eq(manualHoursTable.userId, userId)));
    } else {
      res.status(400).json({ error: "Unknown hour type." });
      return;
    }

    await recordAudit({
      actorUserId: req.auth!.userId,
      action: "delete_hours",
      summary: `Deleted a ${type} hour entry`,
      targetType: "user",
      targetId: userId,
    });
    res.json({ success: true });
  },
);

export default router;
