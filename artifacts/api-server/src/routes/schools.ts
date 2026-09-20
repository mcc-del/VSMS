import { Router } from "express";
import { db, schoolsTable, usersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";

const router = Router();

function format(s: typeof schoolsTable.$inferSelect) {
  return {
    schoolId: s.schoolId,
    name: s.name,
    city: s.city ?? null,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
  };
}

// GET /api/v1/schools — approved schools, for the enrollment picker. Public:
// the sign-up form needs it before the user has an account.
router.get("/v1/schools", async (_req, res) => {
  const rows = await db
    .select()
    .from(schoolsTable)
    .where(eq(schoolsTable.status, "approved"))
    .orderBy(asc(schoolsTable.name));
  res.json(rows.map(format));
});

// POST /api/v1/schools/request — anyone (including a not-yet-registered user on
// the sign-up form) can request a school that isn't listed. It's stored as
// "pending" for an admin to approve or merge, so the approved list stays clean
// of spelling variants.
router.post("/v1/schools/request", async (req, res) => {
  const body = (req.body ?? {}) as { name?: unknown; city?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  if (name.length < 2 || name.length > 120) {
    res.status(400).json({ error: "Please enter the full school name." });
    return;
  }

  // If a school with this name already exists (any status), don't duplicate.
  const [existing] = await db
    .select()
    .from(schoolsTable)
    .where(eq(schoolsTable.name, name))
    .limit(1);
  if (existing) {
    if (existing.status === "approved") {
      res.status(200).json({ ...format(existing), alreadyApproved: true });
      return;
    }
    res.status(200).json({ ...format(existing), alreadyRequested: true });
    return;
  }

  const [school] = await db
    .insert(schoolsTable)
    .values({
      name,
      city: city || null,
      status: "pending",
      requestedByUserId: req.auth?.userId ?? null,
    })
    .returning();
  res.status(201).json(format(school));
});

// GET /api/v1/admin/schools — all schools (approved + pending) for the admin
// queue. Optional ?status=pending filter.
router.get("/v1/admin/schools", authenticate, requireRole("admin"), async (req, res) => {
  const status = (req.query.status as string | undefined) ?? undefined;
  const rows =
    status === "pending" || status === "approved"
      ? await db
          .select()
          .from(schoolsTable)
          .where(eq(schoolsTable.status, status))
          .orderBy(asc(schoolsTable.name))
      : await db.select().from(schoolsTable).orderBy(asc(schoolsTable.name));
  res.json(rows.map(format));
});

// POST /api/v1/admin/schools/:schoolId/approve — accept a requested school.
router.post(
  "/v1/admin/schools/:schoolId/approve",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { schoolId } = req.params as { schoolId: string };
    const [school] = await db
      .update(schoolsTable)
      .set({ status: "approved" })
      .where(eq(schoolsTable.schoolId, schoolId))
      .returning();
    if (!school) {
      res.status(404).json({ error: "School not found." });
      return;
    }
    res.json(format(school));
  },
);

// POST /api/v1/admin/schools/:schoolId/merge — merge a pending request into an
// existing approved school. Any user whose school text matches the pending name
// is repointed to the canonical name, then the duplicate is removed.
router.post(
  "/v1/admin/schools/:schoolId/merge",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { schoolId } = req.params as { schoolId: string };
    const targetId =
      typeof (req.body as { targetSchoolId?: unknown })?.targetSchoolId === "string"
        ? ((req.body as { targetSchoolId: string }).targetSchoolId)
        : "";
    if (!targetId) {
      res.status(400).json({ error: "Choose the school to merge into." });
      return;
    }

    const [dup] = await db
      .select()
      .from(schoolsTable)
      .where(eq(schoolsTable.schoolId, schoolId))
      .limit(1);
    const [target] = await db
      .select()
      .from(schoolsTable)
      .where(and(eq(schoolsTable.schoolId, targetId), eq(schoolsTable.status, "approved")))
      .limit(1);
    if (!dup || !target) {
      res.status(404).json({ error: "School not found." });
      return;
    }
    if (dup.schoolId === target.schoolId) {
      res.status(400).json({ error: "Cannot merge a school into itself." });
      return;
    }

    // Repoint any users pinned to the duplicate name, then delete it.
    await db
      .update(usersTable)
      .set({ school: target.name })
      .where(eq(usersTable.school, dup.name));
    await db.delete(schoolsTable).where(eq(schoolsTable.schoolId, dup.schoolId));

    res.json({ status: "ok", message: `Merged into ${target.name}.` });
  },
);

// DELETE /api/v1/admin/schools/:schoolId — reject/remove a school request.
router.delete(
  "/v1/admin/schools/:schoolId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { schoolId } = req.params as { schoolId: string };
    const [school] = await db
      .delete(schoolsTable)
      .where(eq(schoolsTable.schoolId, schoolId))
      .returning();
    if (!school) {
      res.status(404).json({ error: "School not found." });
      return;
    }
    res.json({ status: "ok", message: "School request removed." });
  },
);

export default router;
