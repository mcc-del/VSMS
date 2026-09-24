// One-off cleanup: delete all seeded/demo test accounts from the database.
//
// Removes any user whose email ends in @test.com, plus managed children (no
// login of their own) whose parent email ends in @test.com. Deleting a user
// cascades away their sign-ups, submissions, hours, and guardianship links.
//
// Real accounts are untouched. THIS IS IRREVERSIBLE. Run against the database
// you intend to clean:
//   cd lib/db && DATABASE_URL='<YOUR_DATABASE_URL>' node wipe-test-accounts.mjs
//
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("Refusing to run: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MATCH = `(lower(email) LIKE '%@test.com' OR lower(parent_email) LIKE '%@test.com')`;

try {
  const { rows: preview } = await pool.query(
    `SELECT user_id, email, parent_email, role FROM users WHERE ${MATCH} ORDER BY email NULLS LAST`,
  );
  console.log(`Found ${preview.length} test account(s):`);
  for (const r of preview) {
    console.log(`  - ${r.email ?? "(no login)"}${r.parent_email ? ` [parent ${r.parent_email}]` : ""} · ${r.role}`);
  }

  if (preview.length === 0) {
    console.log("Nothing to delete.");
  } else {
    await pool.query("BEGIN");
    const res = await pool.query(`DELETE FROM users WHERE ${MATCH}`);
    await pool.query("COMMIT");
    console.log(`\nDeleted ${res.rowCount} test account(s). Their sign-ups, hours, and links were removed too.`);
  }
} catch (err) {
  await pool.query("ROLLBACK").catch(() => {});
  console.error("Failed, rolled back:", err);
  process.exit(1);
} finally {
  await pool.end();
}
