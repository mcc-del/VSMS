import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, manualHoursTable, orgAdminsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateUserBody, AddManualHoursBody } from "@workspace/api-zod";

const router = Router();

// GET /api/v1/admin/users
router.get("/v1/admin/users", authenticate, requireRole("admin"), async (req, res) => {
  const users = await db
    .select({
      userId: usersTable.userId,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
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

  res.json(
    users.map((u) => ({
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
      .select({ userId: usersTable.userId, role: usersTable.role })
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

    if (organizationIds.length === 0) {
      // Demote back to a regular participant.
      await db.update(usersTable).set({ role: "participant" }).where(eq(usersTable.userId, userId));
      res.json({ role: "participant", organizationIds: [] });
      return;
    }

    for (const organizationId of organizationIds) {
      await db.insert(orgAdminsTable).values({ userId, organizationId }).onConflictDoNothing();
    }
    await db.update(usersTable).set({ role: "org_admin" }).where(eq(usersTable.userId, userId));
    res.json({ role: "org_admin", organizationIds });
  },
);

// POST /api/v1/admin/users
router.post(
  "/v1/admin/users",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }

    const { firstName, lastName, email, password, role, phone } = parsed.data as typeof parsed.data & {
      phone?: string;
    };

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
    const [user] = await db
      .insert(usersTable)
      .values({
        firstName,
        lastName,
        email: email.toLowerCase(),
        passwordHash,
        role: role as "participant" | "supervisor" | "admin",
        phone: phone?.trim() || null,
      })
      .returning();

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
router.patch("/v1/admin/users/:userId", authenticate, requireRole("admin"), async (req, res) => {
  const { userId } = req.params as { userId: string };
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
  requireRole("admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
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
  requireRole("admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
    const parsed = AddManualHoursBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const [target] = await db
      .select({ userId: usersTable.userId, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found." });
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
  requireRole("admin"),
  async (req, res) => {
    const { creditId } = req.params as { creditId: string };
    await db.delete(manualHoursTable).where(eq(manualHoursTable.manualHoursId, creditId));
    res.json({ status: "success", message: "Manual hours removed" });
  },
);

// DELETE /api/v1/admin/users/:userId
router.delete(
  "/v1/admin/users/:userId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { userId } = req.params as { userId: string };
    await db.delete(usersTable).where(eq(usersTable.userId, userId));
    res.json({ status: "success", message: "User deleted" });
  },
);

export default router;
