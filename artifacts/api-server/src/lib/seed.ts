import bcrypt from "bcryptjs";
import { db, usersTable, organizationsTable, schoolsTable, orgAdminsTable, guardianshipsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger";

// One representative test login per DISTINCT enrollment flow (not all eight
// grid personas — the others follow the same path). Real testers you invite
// just self-register. Middle/high get their own login; the elementary flow is
// a managed child (no login) under parent@test.com.
const PERSONA_PASSWORD = "Persona123!";
const PERSONA_STUDENTS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  grade: string;
  org: "medina" | "ef" | null;
  school: string;
}> = [
  // Medina student flow
  { email: "faith@test.com", firstName: "Faith", lastName: "M", grade: "7", org: "medina", school: "Medina Academy" },
  // Essentials First student flow
  { email: "zach@test.com", firstName: "Zach", lastName: "E", grade: "8", org: "ef", school: "Redmond Middle School" },
  // Community (no org) student flow
  { email: "mila@test.com", firstName: "Mila", lastName: "C", grade: "6", org: null, school: "Kirkland Middle School" },
];
// Parent-led elementary flow: a managed child (no login) under parent@test.com.
const PERSONA_CHILDREN: Array<{
  firstName: string;
  lastName: string;
  grade: string;
  org: "medina" | null;
  school: string;
}> = [
  { firstName: "Mike", lastName: "M", grade: "4", org: "medina", school: "Medina Academy" },
];

export async function seedPersonas(): Promise<void> {
  try {
    const orgs = await db
      .select({ organizationId: organizationsTable.organizationId, name: organizationsTable.name })
      .from(organizationsTable);
    const medinaId = orgs.find((o) => /medina/i.test(o.name))?.organizationId ?? null;
    const efId = orgs.find((o) => /essentials/i.test(o.name))?.organizationId ?? null;
    const orgId = (k: "medina" | "ef" | null) => (k === "medina" ? medinaId : k === "ef" ? efId : null);

    const passwordHash = await bcrypt.hash(PERSONA_PASSWORD, 12);
    for (const p of PERSONA_STUDENTS) {
      await db
        .insert(usersTable)
        .values({
          email: p.email,
          passwordHash,
          firstName: p.firstName,
          lastName: p.lastName,
          role: "participant",
          parentEmail: "parent@test.com",
          school: p.school,
          grade: p.grade,
          organizationId: orgId(p.org),
        })
        .onConflictDoUpdate({
          target: usersTable.email,
          set: {
            role: "participant",
            parentEmail: "parent@test.com",
            school: p.school,
            grade: p.grade,
            organizationId: orgId(p.org),
            passwordHash: sql`excluded.password_hash`,
          },
        });
    }

    // Managed children under the test parent.
    const [parent] = await db
      .select({ userId: usersTable.userId })
      .from(usersTable)
      .where(eq(usersTable.email, "parent@test.com"))
      .limit(1);
    if (parent) {
      // Existing managed children of this parent (to keep seeding idempotent).
      const existingKids = await db
        .select({ firstName: usersTable.firstName })
        .from(usersTable)
        .innerJoin(guardianshipsTable, eq(guardianshipsTable.childUserId, usersTable.userId))
        .where(eq(guardianshipsTable.guardianUserId, parent.userId));
      const existingNames = new Set(existingKids.map((k) => k.firstName));

      for (const c of PERSONA_CHILDREN) {
        if (existingNames.has(c.firstName)) continue;

        const [child] = await db
          .insert(usersTable)
          .values({
            firstName: c.firstName,
            lastName: c.lastName,
            email: null,
            passwordHash: null,
            role: "participant",
            isManaged: true,
            parentEmail: "parent@test.com",
            school: c.school,
            grade: c.grade,
            organizationId: orgId(c.org),
          })
          .returning();
        await db
          .insert(guardianshipsTable)
          .values({ guardianUserId: parent.userId, childUserId: child.userId, isPrimary: true })
          .onConflictDoNothing();
      }
    }
    logger.info("Seeded persona test accounts");
  } catch (err) {
    logger.error({ err }, "Failed to seed personas");
  }
}

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

// Now that opportunities are org-gated, a participant with no organization only
// sees open/community events. Attach the seeded test participant to Medina so
// the Medina-gated flow is testable out of the box. Idempotent.
export async function seedTestParticipantOrg(): Promise<void> {
  try {
    const [medina] = await db
      .select({ organizationId: organizationsTable.organizationId })
      .from(organizationsTable)
      .where(eq(organizationsTable.name, "Medina Academy"))
      .limit(1);
    if (!medina) return;
    await db
      .update(usersTable)
      .set({ organizationId: medina.organizationId })
      .where(eq(usersTable.email, "participant@test.com"));
  } catch (err) {
    logger.error({ err }, "Failed to set test participant org");
  }
}

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
