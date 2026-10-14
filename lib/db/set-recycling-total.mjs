// Set the Million Cans running total to an exact figure (e.g. after a
// physical weigh-in). Reads the current total and inserts ONE adjustment row
// for the difference, credited to the whole school so it moves the total but
// not the grade or named-contributor standings. The difference may be
// negative. Append-only, so it's traceable and reversible.
//
// In the Replit Shell (DATABASE_URL is already set there):
//   node lib/db/set-recycling-total.mjs 1400
//
import pg from "pg";
const { Pool } = pg;

const SCHOOL_WIDE = "Whole school";

const target = Math.round(Number(process.argv[2]));
if (!process.env.DATABASE_URL || !Number.isFinite(target) || target < 0) {
  console.error('Usage: DATABASE_URL=... node set-recycling-total.mjs <target-cans>   (e.g. 1400)');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows } = await pool.query(
    `SELECT coalesce(sum(cans), 0)::int AS total FROM recycling_bins`,
  );
  const current = rows[0].total;
  const delta = target - current;

  if (delta === 0) {
    console.log(`Total is already ${target.toLocaleString()} cans. Nothing to do.`);
  } else {
    await pool.query(
      `INSERT INTO recycling_bins (grade, cans) VALUES ($1, $2)`,
      [SCHOOL_WIDE, delta],
    );
    console.log(
      `Total set from ${current.toLocaleString()} to ${target.toLocaleString()} cans ` +
        `(adjustment ${delta > 0 ? "+" : ""}${delta.toLocaleString()}).`,
    );
  }
} catch (err) {
  console.error("Failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
