import { Router } from "express";
import { db, usersTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { managedOrgIds } from "../lib/org-scope";

const router = Router();

// GET /api/v1/me/profile — the current participant's own editable details.
router.get("/v1/me/profile", authenticate, requireRole("participant"), async (req, res) => {
  const [u] = await db
    .select({
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      phone: usersTable.phone,
      grade: usersTable.grade,
      school: usersTable.school,
      organizationId: usersTable.organizationId,
    })
    .from(usersTable)
    .where(eq(usersTable.userId, req.auth!.userId))
    .limit(1);
  if (!u) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone ?? null,
    grade: u.grade ?? null,
    school: u.school ?? null,
    organizationId: u.organizationId ?? null,
  });
});

// PATCH /api/v1/me/profile — participant fixes their own details, incl. a change
// of affiliation. Switching to a code-protected org requires the join code.
router.patch("/v1/me/profile", authenticate, requireRole("participant"), async (req, res) => {
  const body = (req.body ?? {}) as {
    firstName?: unknown; lastName?: unknown; phone?: unknown;
    grade?: unknown; school?: unknown; organizationId?: unknown; joinCode?: unknown;
  };
  const updates: Record<string, unknown> = {};
  if (typeof body.firstName === "string" && body.firstName.trim()) updates.firstName = body.firstName.trim();
  if (typeof body.lastName === "string" && body.lastName.trim()) updates.lastName = body.lastName.trim();
  if ("phone" in body) updates.phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  if (typeof body.grade === "string" && body.grade.trim()) updates.grade = body.grade.trim();
  if (typeof body.school === "string" && body.school.trim()) updates.school = body.school.trim();

  if ("organizationId" in body) {
    const orgId = typeof body.organizationId === "string" && body.organizationId ? body.organizationId : null;
    if (orgId) {
      const [org] = await db
        .select({ joinCode: organizationsTable.joinCode, name: organizationsTable.name })
        .from(organizationsTable)
        .where(eq(organizationsTable.organizationId, orgId))
        .limit(1);
      if (!org) {
        res.status(400).json({ error: "Unknown organization." });
        return;
      }
      if (org.joinCode) {
        const code = typeof body.joinCode === "string" ? body.joinCode.trim() : "";
        if (code.toLowerCase() !== org.joinCode.toLowerCase()) {
          res.status(400).json({ error: `Incorrect join code for ${org.name}.` });
          return;
        }
      }
    }
    updates.organizationId = orgId;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.userId, req.auth!.userId));
  res.json({ ok: true });
});

// GET /api/v1/me/managed-organizations — org IDs the current admin manages.
// `all: true` means a Super Admin (unrestricted).
router.get("/v1/me/managed-organizations", authenticate, async (req, res) => {
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
  if (managed === null) {
    res.json({ all: true, organizationIds: [] });
    return;
  }
  res.json({ all: false, organizationIds: managed });
});

// GET /api/v1/me/leaderboard-preferences — the current participant's alias +
// hide setting for the leaderboard.
router.get(
  "/v1/me/leaderboard-preferences",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const [me] = await db
      .select({
        displayAlias: usersTable.displayAlias,
        hideFromLeaderboard: usersTable.hideFromLeaderboard,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, req.auth!.userId))
      .limit(1);
    res.json({
      displayAlias: me?.displayAlias ?? null,
      hideFromLeaderboard: me?.hideFromLeaderboard ?? false,
    });
  },
);

// PATCH /api/v1/me/leaderboard-preferences — set alias and/or hide flag.
router.patch(
  "/v1/me/leaderboard-preferences",
  authenticate,
  requireRole("participant"),
  async (req, res) => {
    const body = (req.body ?? {}) as { displayAlias?: unknown; hideFromLeaderboard?: unknown };
    const updates: { displayAlias?: string | null; hideFromLeaderboard?: boolean } = {};

    if ("displayAlias" in body) {
      if (body.displayAlias === null || body.displayAlias === "") {
        updates.displayAlias = null;
      } else if (typeof body.displayAlias === "string") {
        const alias = body.displayAlias.trim();
        if (alias.length > 40) {
          res.status(400).json({ error: "Alias must be 40 characters or fewer." });
          return;
        }
        updates.displayAlias = alias;
      } else {
        res.status(400).json({ error: "Invalid alias." });
        return;
      }
    }
    if ("hideFromLeaderboard" in body) {
      updates.hideFromLeaderboard = Boolean(body.hideFromLeaderboard);
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Nothing to update." });
      return;
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.userId, req.auth!.userId));

    const [me] = await db
      .select({
        displayAlias: usersTable.displayAlias,
        hideFromLeaderboard: usersTable.hideFromLeaderboard,
      })
      .from(usersTable)
      .where(eq(usersTable.userId, req.auth!.userId))
      .limit(1);
    res.json({
      displayAlias: me?.displayAlias ?? null,
      hideFromLeaderboard: me?.hideFromLeaderboard ?? false,
    });
  },
);

export default router;
