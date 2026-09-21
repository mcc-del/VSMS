/**
 * Seed the global award thresholds (Bronze/Silver/Gold) per school level,
 * modelled on the President's Volunteer Service Award age bands.
 *
 *   elementary (grades 2-5)  -> 26 / 50 / 75
 *   middle     (grades 6-8)  -> 50 / 75 / 100
 *   high       (grades 9-12) -> 100 / 175 / 250
 *
 * These are organization-agnostic (organizationId = null), i.e. the defaults
 * for every org. A Super Admin can still override per-org in the UI.
 *
 * Idempotent: re-running updates the existing rows in place.
 *
 * Usage (Replit Shell):
 *   DATABASE_URL='<PROD-url>' node build-seed-thresholds.mjs \
 *     && DATABASE_URL='<PROD-url>' node dist/seed-thresholds.mjs
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, pool, awardThresholdsTable } from "@workspace/db";

const ROWS: { level: string; bronze: number; silver: number; gold: number }[] = [
  { level: "elementary", bronze: 26, silver: 50, gold: 75 },
  { level: "middle", bronze: 50, silver: 75, gold: 100 },
  { level: "high", bronze: 100, silver: 175, gold: 250 },
];

async function main() {
  for (const r of ROWS) {
    const existing = await db
      .select({ id: awardThresholdsTable.awardThresholdId })
      .from(awardThresholdsTable)
      .where(
        and(eq(awardThresholdsTable.level, r.level), isNull(awardThresholdsTable.organizationId)),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(awardThresholdsTable)
        .set({ bronze: r.bronze, silver: r.silver, gold: r.gold, updatedAt: new Date() })
        .where(eq(awardThresholdsTable.awardThresholdId, existing[0].id));
      console.log(`Updated ${r.level}: ${r.bronze}/${r.silver}/${r.gold}`);
    } else {
      await db.insert(awardThresholdsTable).values({
        level: r.level,
        organizationId: null,
        bronze: r.bronze,
        silver: r.silver,
        gold: r.gold,
      });
      console.log(`Inserted ${r.level}: ${r.bronze}/${r.silver}/${r.gold}`);
    }
  }
  console.log("Done. Award thresholds seeded.");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
