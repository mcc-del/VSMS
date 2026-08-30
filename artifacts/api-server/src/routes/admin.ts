import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, manualHoursTable } from "@workspace/db";
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

  res.json(
    users.map((u) => ({
      userId: u.userId,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    })),
  );
});

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

    const { firstName, lastName, email, password, role } = parsed.data;

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
      })
      .returning();

    res.status(201).json({
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    });
  },
);

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
