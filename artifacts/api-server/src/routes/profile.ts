import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { managedOrgIds } from "../lib/org-scope";

const router = Router();

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
