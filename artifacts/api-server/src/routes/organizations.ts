import { Router } from "express";
import { db, organizationsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { CreateOrganizationBody, UpdateOrganizationBody } from "@workspace/api-zod";

const router = Router();

function format(o: typeof organizationsTable.$inferSelect) {
  return {
    organizationId: o.organizationId,
    name: o.name,
    description: o.description ?? null,
    allowsElementary: o.allowsElementary,
    allowsMiddle: o.allowsMiddle,
    allowsHigh: o.allowsHigh,
  };
}

// GET /api/v1/organizations — any authenticated user can list orgs.
router.get("/v1/organizations", authenticate, async (_req, res) => {
  const rows = await db.select().from(organizationsTable).orderBy(asc(organizationsTable.name));
  res.json(rows.map(format));
});

// POST /api/v1/admin/organizations
router.post("/v1/admin/organizations", authenticate, requireRole("admin"), async (req, res) => {
  const parsed = CreateOrganizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { name, description, allowsElementary, allowsMiddle, allowsHigh } = parsed.data;
  try {
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: name.trim(),
        description: description ?? null,
        allowsElementary: allowsElementary ?? true,
        allowsMiddle: allowsMiddle ?? true,
        allowsHigh: allowsHigh ?? true,
      })
      .returning();
    res.status(201).json(format(org));
  } catch {
    res.status(400).json({ error: "An organization with that name already exists." });
  }
});

// PUT /api/v1/admin/organizations/:organizationId
router.put(
  "/v1/admin/organizations/:organizationId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { organizationId } = req.params as { organizationId: string };
    const parsed = UpdateOrganizationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { name, description, allowsElementary, allowsMiddle, allowsHigh } = parsed.data;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description ?? null;
    if (allowsElementary !== undefined) updates.allowsElementary = allowsElementary;
    if (allowsMiddle !== undefined) updates.allowsMiddle = allowsMiddle;
    if (allowsHigh !== undefined) updates.allowsHigh = allowsHigh;

    const [org] = await db
      .update(organizationsTable)
      .set(updates)
      .where(eq(organizationsTable.organizationId, organizationId))
      .returning();
    if (!org) {
      res.status(404).json({ error: "Organization not found." });
      return;
    }
    res.json(format(org));
  },
);

export default router;
