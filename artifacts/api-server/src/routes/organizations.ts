import { Router } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateOrganizationBody, UpdateOrganizationBody } from "@workspace/api-zod";
import { managedOrgIds, canManageOrg } from "../lib/org-scope";

const router = Router();

// Public shape: never exposes the actual join code, only whether one is needed.
function format(o: typeof organizationsTable.$inferSelect) {
  return {
    organizationId: o.organizationId,
    name: o.name,
    description: o.description ?? null,
    allowsElementary: o.allowsElementary,
    allowsMiddle: o.allowsMiddle,
    allowsHigh: o.allowsHigh,
    competesOnLeaderboard: o.competesOnLeaderboard,
    requiresJoinCode: Boolean(o.joinCode),
  };
}

// Admin shape: includes the join code so a Super Admin can see/share it.
function formatAdmin(o: typeof organizationsTable.$inferSelect) {
  return { ...format(o), joinCode: o.joinCode ?? null };
}

// GET /api/v1/organizations — public: the sign-up form needs it before the
// user has an account (to choose an affiliation). Codes are never returned here.
router.get("/v1/organizations", async (_req, res) => {
  const rows = await db.select().from(organizationsTable).orderBy(asc(organizationsTable.name));
  res.json(rows.map(format));
});

// GET /api/v1/admin/organizations — includes join codes. Super Admin sees all;
// an Admin (org_admin) sees only the organization(s) they manage.
router.get("/v1/admin/organizations", authenticate, requireRole("admin", "org_admin"), async (req, res) => {
  const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
  const rows = await db.select().from(organizationsTable).orderBy(asc(organizationsTable.name));
  const visible = managed === null ? rows : rows.filter((o) => managed.includes(o.organizationId));
  res.json(visible.map(formatAdmin));
});

// POST /api/v1/admin/organizations
router.post("/v1/admin/organizations", authenticate, requireRole("admin"), async (req, res) => {
  const parsed = CreateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { name, description, allowsElementary, allowsMiddle, allowsHigh, competesOnLeaderboard, joinCode } =
    parsed.data as typeof parsed.data & { competesOnLeaderboard?: boolean; joinCode?: string | null };
  try {
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: name.trim(),
        description: description ?? null,
        allowsElementary: allowsElementary ?? true,
        allowsMiddle: allowsMiddle ?? true,
        allowsHigh: allowsHigh ?? true,
        competesOnLeaderboard: competesOnLeaderboard ?? true,
        joinCode: joinCode?.trim() || null,
      })
      .returning();
    res.status(201).json(formatAdmin(org));
  } catch {
    res.status(400).json({ error: "An organization with that name already exists." });
  }
});

// PUT /api/v1/admin/organizations/:organizationId
router.put(
  "/v1/admin/organizations/:organizationId",
  authenticate,
  requireRole("admin", "org_admin"),
  async (req, res) => {
    const { organizationId } = req.params as { organizationId: string };
    const managed = await managedOrgIds(req.auth!.userId, req.auth!.role);
    if (!canManageOrg(managed, organizationId)) {
      res.status(403).json({ error: "You can only manage your own organization." });
      return;
    }
    const parsed = UpdateOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { name, description, allowsElementary, allowsMiddle, allowsHigh, competesOnLeaderboard, joinCode } =
      parsed.data as typeof parsed.data & { competesOnLeaderboard?: boolean; joinCode?: string | null };
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description ?? null;
    if (allowsElementary !== undefined) updates.allowsElementary = allowsElementary;
    if (allowsMiddle !== undefined) updates.allowsMiddle = allowsMiddle;
    if (allowsHigh !== undefined) updates.allowsHigh = allowsHigh;
    if (competesOnLeaderboard !== undefined) updates.competesOnLeaderboard = competesOnLeaderboard;
    if (joinCode !== undefined) updates.joinCode = joinCode?.trim() || null;

    const [org] = await db
      .update(organizationsTable)
      .set(updates)
      .where(eq(organizationsTable.organizationId, organizationId))
      .returning();
    if (!org) {
      res.status(404).json({ error: "Organization not found." });
      return;
    }
    res.json(formatAdmin(org));
  },
);

export default router;
