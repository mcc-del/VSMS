import { Router, type Request } from "express";
import { db, recyclingBinsTable } from "@workspace/db";
import { sql, desc, eq, and, isNotNull } from "drizzle-orm";
import { authenticate, requireRole } from "../middlewares/auth";
import { recordAudit } from "../lib/audit";
import { CANS_PER_POUND, GRADES, cansFromPounds, parseDropoff } from "../lib/cans";

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
    .groupBy(recyclingBinsTable.grade)
    .orderBy(desc(sql`sum(${recyclingBinsTable.cans})`))
    .limit(3);

  return {
    name: NAME,
    goal: GOAL,
    binSize: BIN_SIZE,
    cansPerPound: CANS_PER_POUND,
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

// Simple in-memory limiter for the public drop-off form so one phone can't
// flood the total. Keyed by the client IP (first X-Forwarded-For hop, since
// the app runs behind a proxy). Generous enough for a family emptying a car.
const DROPOFF_WINDOW_MS = 10 * 60 * 1000;
const DROPOFF_MAX_PER_WINDOW = 30;
const dropoffHits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

function allowDropoff(ip: string, now = Date.now()): boolean {
  const recent = (dropoffHits.get(ip) ?? []).filter((t) => now - t < DROPOFF_WINDOW_MS);
  if (recent.length >= DROPOFF_MAX_PER_WINDOW) {
    dropoffHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  dropoffHits.set(ip, recent);
  // Keep the map from growing without bound.
  if (dropoffHits.size > 5000) {
    for (const [k, v] of dropoffHits) {
      if (v.every((t) => now - t >= DROPOFF_WINDOW_MS)) dropoffHits.delete(k);
    }
  }
  return true;
}

// POST /api/v1/recycling/dropoffs — PUBLIC. The QR code on the dumpster opens
// the drop-off form: weigh the bag, enter the pounds, credit a grade.
router.post("/v1/recycling/dropoffs", async (req, res) => {
  const parsed = parseDropoff(req.body, GRADES);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (!allowDropoff(clientIp(req))) {
    res.status(429).json({ error: "Lots of bags! Please wait a few minutes before adding more." });
    return;
  }

  const { grade, contributorName, weightLbs } = parsed.value;
  const cansAdded = cansFromPounds(weightLbs);
  await db.insert(recyclingBinsTable).values({
    grade,
    cans: cansAdded,
    contributorName,
    weightLbs: weightLbs.toFixed(2),
  });

  res.status(201).json({ cansAdded, weightLbs, grade, summary: await summary() });
});

// GET /api/v1/recycling/dropoffs — recent public drop-offs so an admin can
// spot and remove typos (e.g. "150" lbs instead of "15").
router.get("/v1/recycling/dropoffs", authenticate, requireRole("admin"), async (_req, res) => {
  const rows = await db
    .select()
    .from(recyclingBinsTable)
    .where(isNotNull(recyclingBinsTable.weightLbs))
    .orderBy(desc(recyclingBinsTable.createdAt))
    .limit(50);
  res.json(
    rows.map((r) => ({
      dropoffId: r.binId,
      grade: r.grade,
      contributorName: r.contributorName,
      weightLbs: Number(r.weightLbs),
      cans: r.cans,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

// DELETE /api/v1/recycling/dropoffs/:dropoffId — admin removes a bad entry.
router.delete(
  "/v1/recycling/dropoffs/:dropoffId",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    const { dropoffId } = req.params as { dropoffId: string };
    if (!/^[0-9a-f-]{36}$/i.test(dropoffId)) {
      res.status(404).json({ error: "Drop-off not found." });
      return;
    }
    const [row] = await db
      .delete(recyclingBinsTable)
      .where(and(eq(recyclingBinsTable.binId, dropoffId), isNotNull(recyclingBinsTable.weightLbs)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Drop-off not found." });
      return;
    }
    recordAudit({
      actorUserId: req.auth!.userId,
      action: "recycling.dropoff.delete",
      summary: `Removed a ${Number(row.weightLbs)} lb drop-off (${row.cans} cans) credited to ${row.grade}`,
      targetType: "recycling_dropoff",
      targetId: row.binId,
      targetLabel: row.contributorName ?? row.grade,
    });
    res.json(await summary());
  },
);

export default router;
