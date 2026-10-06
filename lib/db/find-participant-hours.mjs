// Read-only lookup: show a participant's logged hours (event submissions,
// external submissions, manual credits) with timestamps. Useful for recovering
// a value from a Neon point-in-time branch after an accidental change.
//
//   cd lib/db && DATABASE_URL='<NEON_BRANCH_URL>' node find-participant-hours.mjs "Mariam Haq"
//
import pg from "pg";
const { Pool } = pg;

const name = (process.argv[2] || "").trim();
if (!process.env.DATABASE_URL || !name) {
  console.error('Usage: DATABASE_URL=... node find-participant-hours.mjs "First Last"');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const { rows: users } = await pool.query(
    `SELECT user_id, first_name, last_name, email, grade FROM users
     WHERE lower(first_name || ' ' || last_name) LIKE lower($1)
        OR lower(first_name) LIKE lower($1) OR lower(last_name) LIKE lower($1)`,
    [`%${name}%`],
  );
  if (users.length === 0) { console.log(`No user matching "${name}".`); process.exit(0); }

  for (const u of users) {
    console.log(`\n=== ${u.first_name} ${u.last_name} (${u.email ?? "no email"}, grade ${u.grade ?? "?"}) — ${u.user_id} ===`);

    const ev = await pool.query(
      `SELECT vs.submission_id, vs.status, vs.hours_worked, vs.supervisor_comments, vs.reviewed_at, vs.submitted_at, e.title, e.event_date
       FROM volunteer_submissions vs LEFT JOIN events e ON e.event_id = vs.event_id
       WHERE vs.user_id = $1 ORDER BY vs.submitted_at DESC`, [u.user_id]);
    console.log(`\n  Event submissions (${ev.rows.length}):`);
    for (const r of ev.rows) {
      console.log(`   - ${r.event_date ?? "?"} "${r.title ?? "?"}" · ${r.hours_worked}h · ${r.status} · ${r.supervisor_comments ?? ""} · submitted ${r.submitted_at?.toISOString?.() ?? r.submitted_at}`);
    }

    const ext = await pool.query(
      `SELECT activity_name, organization_name, volunteer_date, hours_worked, status FROM external_submissions WHERE user_id = $1 ORDER BY submitted_at DESC`, [u.user_id]);
    console.log(`\n  External submissions (${ext.rows.length}):`);
    for (const r of ext.rows) console.log(`   - ${r.volunteer_date} ${r.activity_name} (${r.organization_name}) · ${r.hours_worked}h · ${r.status}`);

    const man = await pool.query(
      `SELECT hours, description, date_awarded FROM manual_hours WHERE user_id = $1 ORDER BY date_awarded DESC`, [u.user_id]);
    console.log(`\n  Manual credits (${man.rows.length}):`);
    for (const r of man.rows) console.log(`   - ${r.date_awarded} ${r.hours}h · ${r.description ?? ""}`);
  }
} catch (err) {
  console.error("Lookup failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
