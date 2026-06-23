import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateUserBody } from "@workspace/api-zod";

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
