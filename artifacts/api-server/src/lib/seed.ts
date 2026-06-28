import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Idempotently seed built-in test accounts for the supervisor and admin
 * personas so all three roles can be exercised without manual DB edits.
 *
 * Runs on every server startup. Existing accounts (matched by email) have
 * their role re-asserted but are otherwise left untouched, so re-running is
 * always safe.
 *
 * NOTE: these are convenience accounts for non-production testing. Remove or
 * disable seeding before any real deployment.
 */
const TEST_ACCOUNTS = [
  {
    email: "supervisor@test.com",
    password: "Supervisor123!",
    firstName: "Sam",
    lastName: "Supervisor",
    role: "supervisor" as const,
  },
  {
    email: "admin@test.com",
    password: "Admin123!",
    firstName: "Alex",
    lastName: "Admin",
    role: "admin" as const,
  },
];

export async function seedTestAccounts(): Promise<void> {
  try {
    for (const acct of TEST_ACCOUNTS) {
      const passwordHash = await bcrypt.hash(acct.password, 12);
      await db
        .insert(usersTable)
        .values({
          email: acct.email,
          passwordHash,
          firstName: acct.firstName,
          lastName: acct.lastName,
          role: acct.role,
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          // Re-assert role and refresh the password hash so a known-good
          // credential always works, even if the row pre-existed.
          set: { role: acct.role, passwordHash: sql`excluded.password_hash` },
        });
    }
    logger.info(
      { accounts: TEST_ACCOUNTS.map((a) => `${a.email} (${a.role})`) },
      "Seeded test accounts",
    );
  } catch (err) {
    // Don't crash startup if seeding fails — just log it.
    logger.error({ err }, "Failed to seed test accounts");
  }
}
