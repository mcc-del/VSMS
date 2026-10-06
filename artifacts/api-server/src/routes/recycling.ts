import { Router } from "express";
import { db, recyclingBinsTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { recordAudit } from "../lib/audit";

const ADJUSTMENT_GRADE = "Adjustment";

const router = Router();

// Competition config. Goal and bin size are constants for year one; can move to
// a settings table later if they need to change from the UI.
const NAME = "Million Cans Recycling Competition";
const GOAL = 100000;
const BIN_SIZE = 250;

async function summary() {
  const [totals] = await db
    .select({ total: sql<string>`coalesce(sum(${recyclingBinsTable.cans}), 0)` })
    .from(recyclingBinsTable);
  const totalCans = Number(totals?.total ?? 0);

  const byGrade = await db
    .select({
      grade: recyclingBinsTable.grade,
      cans: sql<string>`sum(${recyclingBinsTable.cans})`,
    })
    .from(recyclingBinsTable)
    .where(sql`${recyclingBinsTable.grade} <> ${ADJUSTMENT_GRADE}`)
    .groupBy(recyclingBinsTable.grade)
    .orderBy(desc(sql`sum(${recyclingBinsTable.cans})`))
    .limit(3);

  return {
    name: NAME,
    goal: GOAL,
    binSize: BIN_SIZE,
    totalCans,
    topGrades: byGrade.map((r) => ({ grade: r.grade, cans: Number(r.cans) })),
  };
}

// GET /api/v1/recycling/summary — PUBLIC (the ribbon shows on login/landing too).
router.get("/v1/recycling/summary", async (_req, res) => {
  res.json(await summary());
});

// POST /api/v1/recycling/bins — log one collected bin toward the total.
// Admins / supervisors / org admins log bins (e.g. when a class bin is emptied).
router.post(
  "/v1/recycling/bins",
  authenticate,
  requireRole("admin", "supervisor", "org_admin"),
  async (req, res) => {
    const body = (req.body ?? {}) as { grade?: unknown; cans?: unknown };
    const grade = typeof body.grade === "string" ? body.grade.trim() : "";
    if (!grade) {
      res.status(400).json({ error: "A grade is required." });
      return;
    }
    const cans =
      typeof body.cans === "number" && Number.isFinite(body.cans) && body.cans > 0
        ? Math.round(body.cans)
        : BIN_SIZE;

    await db.insert(recyclingBinsTable).values({
      grade,
      cans,
      loggedByUserId: req.auth!.userId,
    });

    res.status(201).json(await summary());
  },
);

// POST /api/v1/recycling/set-total — correct the running total to a known
// figure (e.g. after a physical weigh-in). Admin only. Keeps the append-only
// bin model by inserting a single "Adjustment" row for the difference, so the
// correction is traceable and reversible. The difference may be negative.
router.post(
  "/v1/recycling/set-total",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const body = (req.body ?? {}) as { total?: unknown };
    if (typeof body.total !== "number" || !Number.isFinite(body.total) || body.total < 0) {
      res.status(400).json({ error: "A total (0 or more) is required." });
      return;
    }
    const target = Math.round(body.total);

    const [totals] = await db
      .select({ total: sql<string>`coalesce(sum(${recyclingBinsTable.cans}), 0)` })
      .from(recyclingBinsTable);
    const current = Number(totals?.total ?? 0);
    const delta = target - current;

    if (delta !== 0) {
      await db.insert(recyclingBinsTable).values({
        grade: ADJUSTMENT_GRADE,
        cans: delta,
        loggedByUserId: req.auth!.userId,
      });
      await recordAudit({
        actorUserId: req.auth!.userId,
        action: "recycling_set_total",
        summary: `Corrected recycling total from ${current.toLocaleString()} to ${target.toLocaleString()} (adjustment ${delta > 0 ? "+" : ""}${delta.toLocaleString()})`,
      });
    }

    res.json(await summary());
  },
);

export default router;
