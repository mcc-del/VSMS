import { Router } from "express";
import { db, nonprofitsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { recordAudit } from "../lib/audit";

const router = Router();

function format(n: typeof nonprofitsTable.$inferSelect) {
  return {
    nonprofitId: n.nonprofitId,
    name: n.name,
    ein: n.ein ?? null,
    website: n.website ?? null,
    active: n.active,
  };
}

// GET /api/v1/nonprofits — the approved allowlist for the external-hours form.
// Any signed-in user needs it; only active ones are returned.
router.get("/v1/nonprofits", authenticate, async (_req, res) => {
  const rows = await db
    .select()
    .from(nonprofitsTable)
    .where(eq(nonprofitsTable.active, true))
    .orderBy(asc(nonprofitsTable.name));
  res.json(rows.map(format));
});

// GET /api/v1/admin/nonprofits — full list (incl. inactive) for Super Admins.
router.get("/v1/admin/nonprofits", authenticate, requireRole("admin"), async (_req, res) => {
  const rows = await db.select().from(nonprofitsTable).orderBy(asc(nonprofitsTable.name));
  res.json(rows.map(format));
});

// POST /api/v1/admin/nonprofits
router.post("/v1/admin/nonprofits", authenticate, requireRole("admin"), async (req, res) => {
  const b = (req.body ?? {}) as { name?: unknown; ein?: unknown; website?: unknown; active?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length < 2) {
    res.status(400).json({ error: "A nonprofit name is required." });
    return;
  }
  try {
    const [n] = await db
      .insert(nonprofitsTable)
      .values({
        name,
        ein: typeof b.ein === "string" && b.ein.trim() ? b.ein.trim() : null,
        website: typeof b.website === "string" && b.website.trim() ? b.website.trim() : null,
        active: b.active === undefined ? true : Boolean(b.active),
      })
      .returning();
    recordAudit({
      actorUserId: req.auth!.userId,
      action: "nonprofit.create",
      targetType: "nonprofit",
      targetId: n.nonprofitId,
      targetLabel: n.name,
      summary: `Added nonprofit "${n.name}" to the allowlist`,
    });
    res.status(201).json(format(n));
  } catch {
    res.status(400).json({ error: "That nonprofit already exists." });
  }
});

// PUT /api/v1/admin/nonprofits/:nonprofitId
router.put("/v1/admin/nonprofits/:nonprofitId", authenticate, requireRole("admin"), async (req, res) => {
  const { nonprofitId } = req.params as { nonprofitId: string };
  const b = (req.body ?? {}) as { name?: unknown; ein?: unknown; website?: unknown; active?: unknown };
  const updates: Record<string, unknown> = {};
  if (typeof b.name === "string") updates.name = b.name.trim();
  if (b.ein !== undefined) updates.ein = typeof b.ein === "string" && b.ein.trim() ? b.ein.trim() : null;
  if (b.website !== undefined) updates.website = typeof b.website === "string" && b.website.trim() ? b.website.trim() : null;
  if (b.active !== undefined) updates.active = Boolean(b.active);

  const [n] = await db
    .update(nonprofitsTable)
    .set(updates)
    .where(eq(nonprofitsTable.nonprofitId, nonprofitId))
    .returning();
  if (!n) {
    res.status(404).json({ error: "Nonprofit not found." });
    return;
  }
  res.json(format(n));
});

// DELETE /api/v1/admin/nonprofits/:nonprofitId
router.delete("/v1/admin/nonprofits/:nonprofitId", authenticate, requireRole("admin"), async (req, res) => {
  const { nonprofitId } = req.params as { nonprofitId: string };
  const [n] = await db.delete(nonprofitsTable).where(eq(nonprofitsTable.nonprofitId, nonprofitId)).returning();
  if (!n) {
    res.status(404).json({ error: "Nonprofit not found." });
    return;
  }
  recordAudit({
    actorUserId: req.auth!.userId,
    action: "nonprofit.delete",
    targetType: "nonprofit",
    targetId: n.nonprofitId,
    targetLabel: n.name,
    summary: `Removed nonprofit "${n.name}" from the allowlist`,
  });
  res.json({ status: "success" });
});

export default router;
