import bcrypt from "bcryptjs";
import { db, usersTable, organizationsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_ORGS = [
  { name: "Medina Academy", description: "Host school and accreditor of volunteer hours.", allowsElementary: true, allowsMiddle: true, allowsHigh: true },
  { name: "Essentials First", description: "Leadership & volunteer opportunities for middle and high school students.", allowsElementary: false, allowsMiddle: true, allowsHigh: true },
  { name: "Others", description: "General external volunteering opportunities.", allowsElementary: true, allowsMiddle: true, allowsHigh: true },
];

export async function seedOrganizations(): Promise<void> {
  try {
    for (const o of DEFAULT_ORGS) {
      await db
        .insert(organizationsTable)
        .values(o)
        .onConflictDoUpdate({
          target: organizationsTable.name,
          set: {
            description: o.description,
            allowsElementary: o.allowsElementary,
            allowsMiddle: o.allowsMiddle,
            allowsHigh: o.allowsHigh,
          },
        });
    }
    logger.info({ orgs: DEFAULT_ORGS.map((o) => o.name) }, "Seeded organizations");
  } catch (err) {
    logger.error({ err }, "Failed to seed organizations");
  }
}

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
    email: "participant@test.com",
    password: "Participant123!",
    firstName: "Pat",
    lastName: "Participant",
    role: "participant" as const,
    parentEmail: "parent@test.com",
    school: "Medina Academy",
    grade: "10",
  },
  {
    email: "parent@test.com",
    password: "Parent123!",
    firstName: "Riley",
    lastName: "Parent",
    role: "parent" as const,
    parentEmail: null,
    school: null,
    grade: null,
  },
  {
    email: "supervisor@test.com",
    password: "Supervisor123!",
    firstName: "Sam",
    lastName: "Supervisor",
    role: "supervisor" as const,
    parentEmail: null,
    school: null,
    grade: null,
  },
  {
    email: "admin@test.com",
    password: "Admin123!",
    firstName: "Alex",
    lastName: "Admin",
    role: "admin" as const,
    parentEmail: null,
    school: null,
    grade: null,
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
          parentEmail: acct.parentEmail,
          school: acct.school,
          grade: acct.grade,
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          // Re-assert role, parent link, and refresh the password hash so a
          // known-good credential always works, even if the row pre-existed.
          set: {
            role: acct.role,
            parentEmail: acct.parentEmail,
            school: acct.school,
            grade: acct.grade,
            passwordHash: sql`excluded.password_hash`,
          },
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
