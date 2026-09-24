import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db, usersTable, guardianInvitesTable, organizationsTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { authenticate, signToken } from "../middlewares/auth";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import { linkGuardianToInviterChildren } from "./parent";
import { sendPasswordReset } from "../lib/email";

const router = Router();

// POST /api/v1/auth/register
router.post("/v1/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { firstName, lastName, email, password, accountType, parentEmail, school, grade, organizationId } =
    parsed.data;
  const extra = parsed.data as typeof parsed.data & { joinCode?: string; phone?: string; parentPhone?: string };
  const joinCode = extra.joinCode;
  const phone = extra.phone?.trim();
  const parentPhone = extra.parentPhone?.trim();

  const isParent = accountType === "parent";

  // A phone number is required for everyone: a parent's own phone, or a
  // student's parent phone.
  const requiredPhone = isParent ? phone : parentPhone;
  if (!requiredPhone) {
    res.status(400).json({
      error: isParent ? "A phone number is required." : "A parent phone number is required.",
    });
    return;
  }

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

  // Resolve which organization this student joins, honoring join codes.
  //  - If they selected an org that HAS a code, they must supply the right code.
  //  - If they entered a code (for any org, including one not shown in the
  //    affiliation picker such as a partner nonprofit), we resolve it to that
  //    org and enroll them there.
  // This keeps org-gated visibility honest (only real members land in an org).
  let finalOrganizationId: string | null = isParent ? null : (organizationId || null);
  if (!isParent) {
    const code = joinCode?.trim();
    // Every participant must belong to an organization and enter its join code.
    if (!organizationId) {
      res.status(400).json({ error: "Please select your organization." });
      return;
    }
    if (!code) {
      res.status(400).json({ error: "A join code is required. Ask your school or program for it." });
      return;
    }
    if (organizationId) {
      const [org] = await db
        .select({ joinCode: organizationsTable.joinCode, name: organizationsTable.name })
        .from(organizationsTable)
        .where(eq(organizationsTable.organizationId, organizationId))
        .limit(1);
      if (org?.joinCode) {
        if (!code || code.toLowerCase() !== org.joinCode.toLowerCase()) {
          res.status(400).json({ error: `Incorrect join code for ${org.name}. Ask the program for the code.` });
          return;
        }
      }
    }
    // A code was entered — match it to an organization (case-insensitive).
    if (code) {
      const withCodes = await db
        .select({ organizationId: organizationsTable.organizationId, joinCode: organizationsTable.joinCode })
        .from(organizationsTable);
      const match = withCodes.find(
        (o) => o.joinCode && o.joinCode.toLowerCase() === code.toLowerCase(),
      );
      if (match) {
        finalOrganizationId = match.organizationId;
      } else if (!organizationId) {
        // They typed a code but it matches nothing and they picked no org.
        res.status(400).json({ error: "That code didn't match any organization. Check it with your school or program, or leave it blank." });
        return;
      }
    }
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

  // Possible-duplicate check: if this phone already exists on another account
  // (as a parent's phone or a student's parent phone), warn once. The client
  // can re-submit with confirmDuplicate:true to proceed anyway (e.g. a parent
  // whose student already listed the same number).
  const confirmDuplicate = (req.body as { confirmDuplicate?: unknown })?.confirmDuplicate === true;
  if (!confirmDuplicate && requiredPhone) {
    const phoneMatch = await db
      .select({ userId: usersTable.userId })
      .from(usersTable)
      .where(or(eq(usersTable.phone, requiredPhone), eq(usersTable.parentPhone, requiredPhone)))
      .limit(1);
    if (phoneMatch.length > 0) {
      res.status(409).json({
        code: "possible_duplicate",
        error:
          "An account with this phone number already exists. If that's you, sign in instead. Continue creating a new account?",
      });
      return;
    }
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
      phone: isParent ? (phone || null) : null,
      parentEmail: isParent ? null : parentEmail!.toLowerCase(),
      parentPhone: isParent ? null : (parentPhone || null),
      school: isParent ? null : school!.trim(),
      grade: isParent ? null : (grade?.trim() || null),
      organizationId: finalOrganizationId,
    })
    .returning();

  // If this parent was invited as a co-guardian before signing up, consume any
  // pending invites now and link them to the inviter's children.
  if (isParent) {
    try {
      const invites = await db
        .select()
        .from(guardianInvitesTable)
        .where(eq(guardianInvitesTable.email, user.email!.toLowerCase()));
      for (const inv of invites) {
        const [inviter] = await db
          .select({ userId: usersTable.userId, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.userId, inv.inviterUserId))
          .limit(1);
        if (inviter?.email) {
          await linkGuardianToInviterChildren(user.userId, inviter.userId, inviter.email.toLowerCase());
        }
      }
      if (invites.length > 0) {
        await db
          .delete(guardianInvitesTable)
          .where(eq(guardianInvitesTable.email, user.email!.toLowerCase()));
      }
    } catch {
      // Non-fatal: registration still succeeds even if invite linking fails.
    }
  }

  const token = signToken({ userId: user.userId, role: user.role, email: user.email! });

  res.status(201).json({
    token,
    role: user.role,
    firstName: user.firstName,
    userId: user.userId,
  });

  // (No per-signup admin alert email — new accounts are visible in the Users
  // list and dashboard. Removing it avoids one email per signup.)
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

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({ userId: user.userId, role: user.role, email: user.email! });

  res.json({
    token,
    role: user.role,
    firstName: user.firstName,
    userId: user.userId,
  });
});

// POST /api/v1/auth/forgot-password — email a reset link. Always returns ok so
// we never reveal whether an email is registered.
router.post("/v1/auth/forgot-password", async (req, res) => {
  const email = typeof (req.body as { email?: unknown })?.email === "string"
    ? (req.body as { email: string }).email.trim().toLowerCase()
    : "";
  if (email) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (user && user.passwordHash) {
      const token = randomBytes(24).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.update(usersTable).set({ resetToken: token, resetTokenExpiresAt: expires }).where(eq(usersTable.userId, user.userId));
      sendPasswordReset(email, token).catch((err) => req.log.error({ err }, "reset email failed"));
    }
  }
  res.json({ ok: true });
});

// POST /api/v1/auth/reset-password — set a new password using a valid token.
router.post("/v1/auth/reset-password", async (req, res) => {
  const body = (req.body ?? {}) as { token?: unknown; password?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || password.length < 8) {
    res.status(400).json({ error: "A valid reset link and a password of at least 8 characters are required." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, token)).limit(1);
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.update(usersTable).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null }).where(eq(usersTable.userId, user.userId));
  res.json({ ok: true });
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

  // Org branding: an org's admins & supervisors see their org's name/logo in
  // the app chrome. Only surfaced for org-affiliated staff roles.
  let organizationName: string | null = null;
  let organizationLogoUrl: string | null = null;
  if (user.organizationId && (user.role === "supervisor" || user.role === "org_admin")) {
    const [org] = await db
      .select({ name: organizationsTable.name, logoUrl: organizationsTable.logoUrl })
      .from(organizationsTable)
      .where(eq(organizationsTable.organizationId, user.organizationId))
      .limit(1);
    organizationName = org?.name ?? null;
    organizationLogoUrl = org?.logoUrl ?? null;
  }

  res.json({
    userId: user.userId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    organizationId: user.organizationId ?? null,
    organizationName,
    organizationLogoUrl,
  });
});

export default router;
