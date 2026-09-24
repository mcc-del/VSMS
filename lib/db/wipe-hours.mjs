// One-off launch cleanup: delete ALL logged hours from the database.
//
// Removes every record from the three hour sources:
//   - volunteer_submissions   (in-program event hours)
//   - external_submissions    (external volunteering hours)
//   - manual_hours            (admin-granted credits)
//
// Users, events, organizations, and sign-ups are NOT touched.
//
// THIS IS IRREVERSIBLE. Run against the database you intend to wipe:
//   cd lib/db && DATABASE_URL='<YOUR_DATABASE_URL>' node wipe-hours.mjs
//
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Refusing to run: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const before = {};
  for (const t of ["volunteer_submissions", "external_submissions", "manual_hours"]) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
    before[t] = rows[0].n;
  }
  console.log("Rows before:", before);

  await pool.query("BEGIN");
  const del = {};
  for (const t of ["volunteer_submissions", "external_submissions", "manual_hours"]) {
    const res = await pool.query(`DELETE FROM ${t}`);
    del[t] = res.rowCount;
  }
  await pool.query("COMMIT");

  console.log("Deleted:", del);
  console.log("Done. All logged hours have been removed.");
} catch (err) {
  await pool.query("ROLLBACK").catch(() => {});
  console.error("Failed, rolled back:", err);
  process.exit(1);
} finally {
  await pool.end();
}
