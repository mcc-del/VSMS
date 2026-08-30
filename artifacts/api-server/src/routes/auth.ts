import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, signToken } from "../middlewares/auth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";

const router = Router();

// POST /api/v1/auth/register
router.post("/v1/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { firstName, lastName, email, password, accountType, parentEmail, school, grade } = parsed.data;

  const isParent = accountType === "parent";

  // Students must provide a parent email so a parent account can be linked.
  if (!isParent && (!parentEmail || parentEmail.trim() === "")) {
    res.status(400).json({ error: "A parent email is required to sign up as a student." });
    return;
  }
  // Students must provide a school so they appear on the leaderboard/standings.
  if (!isParent && (!school || school.trim() === "")) {
    res.status(400).json({ error: "Please select your school." });
    return;
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
  const [user] = await db
    .insert(usersTable)
    .values({
      firstName,
      lastName,
      email: email.toLowerCase(),
      passwordHash,
      role: isParent ? "parent" : "participant",
      parentEmail: isParent ? null : parentEmail!.toLowerCase(),
      school: isParent ? null : school!.trim(),
      grade: isParent ? null : (grade?.trim() || null),
    })
    .returning();

  const token = signToken({ userId: user.userId, role: user.role, email: user.email });

  res.status(201).json({
    token,
    role: user.role,
    firstName: user.firstName,
    userId: user.userId,
  });
});

// POST /api/v1/auth/login
router.post("/v1/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({ userId: user.userId, role: user.role, email: user.email });

  res.json({
    token,
    role: user.role,
    firstName: user.firstName,
    userId: user.userId,
  });
});

// GET /api/v1/auth/me
router.get("/v1/auth/me", authenticate, async (req, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.userId, req.auth!.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    userId: user.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  });
});

export default router;
