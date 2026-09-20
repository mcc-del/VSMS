/**
 * Create (or promote) a single real super-admin account.
 *
 * Credentials are read from environment variables so no password ever lives
 * in the repository. Intended to be run ONCE against the Production database.
 *
 *   SUPERADMIN_EMAIL     required  e.g. mcc@medinaacademy.org
 *   SUPERADMIN_PASSWORD  required  a strong password (min 12 chars enforced)
 *   SUPERADMIN_FIRST     optional  default "Super"
 *   SUPERADMIN_LAST      optional  default "Admin"
 *
 * Behaviour:
 *   - If no user with that email exists, creates one with role "admin".
 *   - If the user already exists, promotes them to role "admin" and resets
 *     their password to the supplied one (so it doubles as a recovery tool).
 *
 * Usage (Replit Shell, Production context):
 *   SUPERADMIN_EMAIL=you@example.org SUPERADMIN_PASSWORD='...' \
 *     node build-createadmin.mjs && node dist/create-superadmin.mjs
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD;
  const firstName = (process.env.SUPERADMIN_FIRST ?? "Super").trim();
  const lastName = (process.env.SUPERADMIN_LAST ?? "Admin").trim();

  if (!email || !password) {
    console.error(
      "Missing SUPERADMIN_EMAIL and/or SUPERADMIN_PASSWORD environment variables.",
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("SUPERADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(usersTable)
      .set({ role: "admin", passwordHash })
      .where(eq(usersTable.email, email));
    console.log(`Promoted existing user ${email} to super admin and reset password.`);
  } else {
    await db.insert(usersTable).values({
      email,
      passwordHash,
      firstName,
      lastName,
      role: "admin",
    });
    console.log(`Created super admin ${email} (${firstName} ${lastName}).`);
  }

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
