import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db, usersTable, manualHoursTable, orgAdminsTable, organizationsTable, auditLogsTable } from "@workspace/db";
import { eq, desc, ilike } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateUserBody, AddManualHoursBody } from "@workspace/api-zod";
import { sendTestEmail, sendAccountInvite } from "../lib/email";
import { recordAudit } from "../lib/audit";
import { managedOrgIds, canManageOrg } from "../lib/org-scope";

const ROLE_LABELS: Record<string, string> = {
  participant: "Participant",
  supervisor: "Supervisor",
  org_admin: "Admin",
  admin: "Super Admin",
  parent: "Parent",
};

// Whether the acting admin (managed = null for Super Admin, else their org ids)
// may act on a target user. Only a Super Admin may act on other Admins/Super
// Admins; an Admin may act on non-admin users in their own organization(s).
function canActOnUser(
  managed: string[] | null,
  targetRole: string,
  targetOrgId: string | null,
): boolean {
  if (managed === null) return true; // Super Admin
  if (targetRole === "admin" || targetRole === "org_admin") return false;
  return canManageOrg(managed, targetOrgId);
}

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

// GET /api/v1/admin/audit-log — recent admin activity (Super Admin only).
router.get("/v1/admin/audit-log", authenticate, requireRole("admin"), async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  const where = action ? ilike(auditLogsTable.action, `%${action}%`) : undefined;
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
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);

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
    if (target.role === "admin") {
      res.status(400).json({ error: "That user is a Super Admin." });
      return;
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
        role: role as "participant" | "supervisor" | "admin",
        phone: phone?.trim() || null,
        organizationId: newUserOrgId,
        resetToken: inviteToken,
        resetTokenExpiresAt: inviteExpires,
      })
      .returning();

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
  const body = (req.body ?? {}) as { firstName?: unknown; lastName?: unknown; phone?: unknown };
  const updates: { firstName?: string; lastName?: string; phone?: string | null } = {};
  if (typeof body.firstName === "string" && body.firstName.trim()) updates.firstName = body.firstName.trim();
  if (typeof body.lastName === "string" && body.lastName.trim()) updates.lastName = body.lastName.trim();
  if ("phone" in body) {
    updates.phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
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

export default router;
