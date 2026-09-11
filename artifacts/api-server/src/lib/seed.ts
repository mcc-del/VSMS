import bcrypt from "bcryptjs";
import { db, usersTable, organizationsTable, schoolsTable, orgAdminsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger";

// A curated starter list of Greater Seattle schools plus Medina. Admins can
// approve/merge more via the school-request queue. Keeping enrollment on a
// controlled list keeps school data clean (no spelling-variant duplicates).
const DEFAULT_SCHOOLS: Array<{ name: string; city: string }> = [
  { name: "Medina Academy", city: "Redmond" },
  { name: "Bellevue High School", city: "Bellevue" },
  { name: "Interlake High School", city: "Bellevue" },
  { name: "Newport High School", city: "Bellevue" },
  { name: "Sammamish High School", city: "Bellevue" },
  { name: "Mercer Island High School", city: "Mercer Island" },
  { name: "Islander Middle School", city: "Mercer Island" },
  { name: "Redmond High School", city: "Redmond" },
  { name: "Redmond Middle School", city: "Redmond" },
  { name: "Eastlake High School", city: "Sammamish" },
  { name: "Skyline High School", city: "Sammamish" },
  { name: "Issaquah High School", city: "Issaquah" },
  { name: "Liberty High School", city: "Renton" },
  { name: "Garfield High School", city: "Seattle" },
  { name: "Roosevelt High School", city: "Seattle" },
  { name: "Ballard High School", city: "Seattle" },
  { name: "Lakeside School", city: "Seattle" },
  { name: "Ingraham High School", city: "Seattle" },
  { name: "Chief Sealth International High School", city: "Seattle" },
  { name: "Kirkland Middle School", city: "Kirkland" },
  { name: "Lake Washington High School", city: "Kirkland" },
  { name: "Juanita High School", city: "Kirkland" },
  { name: "Bothell High School", city: "Bothell" },
  { name: "Inglemoor High School", city: "Kenmore" },
];

export async function seedSchools(): Promise<void> {
  try {
    for (const s of DEFAULT_SCHOOLS) {
      await db
        .insert(schoolsTable)
        .values({ name: s.name, city: s.city, status: "approved" })
        .onConflictDoUpdate({
          target: schoolsTable.name,
          set: { city: s.city, status: "approved" },
        });
    }
    logger.info({ count: DEFAULT_SCHOOLS.length }, "Seeded schools");
  } catch (err) {
    logger.error({ err }, "Failed to seed schools");
  }
}

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

// Seed a demo Organization Admin (over Essentials First) so the org-scoped
// admin role can be exercised. Idempotent.
export async function seedOrgAdmins(): Promise<void> {
  try {
    const [ef] = await db
      .select({ organizationId: organizationsTable.organizationId })
      .from(organizationsTable)
      .where(eq(organizationsTable.name, "Essentials First"))
      .limit(1);
    if (!ef) {
      logger.warn("Essentials First org not found — skipping org-admin seed");
      return;
    }

    const passwordHash = await bcrypt.hash("OrgAdmin123!", 12);
    const [user] = await db
      .insert(usersTable)
      .values({
        email: "efadmin@test.com",
        passwordHash,
        firstName: "Erin",
        lastName: "EFAdmin",
        role: "org_admin",
      })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: { role: "org_admin", passwordHash: sql`excluded.password_hash` },
      })
      .returning();

    await db
      .insert(orgAdminsTable)
      .values({ userId: user.userId, organizationId: ef.organizationId })
      .onConflictDoNothing();

    logger.info("Seeded org admin efadmin@test.com (Essentials First)");
  } catch (err) {
    logger.error({ err }, "Failed to seed org admin");
  }
}

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
