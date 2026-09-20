/**
 * Seed one test account per persona (idempotent — safe to re-run).
 *
 * Run on Replit (where DATABASE_URL is set):
 *   pnpm --filter @workspace/api-server run seed:test
 *
 * All accounts share the password below. Rotate/remove these before real launch.
 */
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  organizationsTable,
  orgAdminsTable,
  guardianshipsTable,
} from "@workspace/db";

const PASSWORD = "MedinaTest!23";
const TEST_ORG = "Test Academy";
const TEST_ORG_CODE = "TESTORG";

async function upsertUser(fields: {
  email: string;
  firstName: string;
  lastName: string;
  role: "participant" | "parent" | "supervisor" | "org_admin" | "admin";
  organizationId?: string | null;
  grade?: string | null;
  school?: string | null;
  parentEmail?: string | null;
  phone?: string | null;
}): Promise<string> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const email = fields.email.toLowerCase();
  const [existing] = await db.select({ userId: usersTable.userId }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const values = {
    email,
    passwordHash,
    firstName: fields.firstName,
    lastName: fields.lastName,
    role: fields.role,
    organizationId: fields.organizationId ?? null,
    grade: fields.grade ?? null,
    school: fields.school ?? null,
    parentEmail: fields.parentEmail ?? null,
    phone: fields.phone ?? null,
  };
  if (existing) {
    await db.update(usersTable).set(values).where(eq(usersTable.userId, existing.userId));
    return existing.userId;
  }
  const [created] = await db.insert(usersTable).values(values).returning({ userId: usersTable.userId });
  return created.userId;
}

async function main() {
  // 1) Test organization (with a join code, for verified-membership testing).
  let [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.name, TEST_ORG)).limit(1);
  if (!org) {
    [org] = await db
      .insert(organizationsTable)
      .values({
        name: TEST_ORG,
        description: "Sandbox organization for testing.",
        allowsElementary: true,
        allowsMiddle: true,
        allowsHigh: true,
        competesOnLeaderboard: true,
        joinCode: TEST_ORG_CODE,
      })
      .returning();
  } else if (!org.joinCode) {
    await db.update(organizationsTable).set({ joinCode: TEST_ORG_CODE }).where(eq(organizationsTable.organizationId, org.organizationId));
  }
  const orgId = org.organizationId;

  // 2) One account per persona.
  await upsertUser({ email: "superadmin@medinatest.org", firstName: "Sam", lastName: "SuperAdmin", role: "admin" });

  const adminId = await upsertUser({ email: "admin@medinatest.org", firstName: "Ada", lastName: "Admin", role: "org_admin", organizationId: orgId });
  const [adminLink] = await db.select().from(orgAdminsTable).where(and(eq(orgAdminsTable.userId, adminId), eq(orgAdminsTable.organizationId, orgId))).limit(1);
  if (!adminLink) await db.insert(orgAdminsTable).values({ userId: adminId, organizationId: orgId });

  await upsertUser({ email: "supervisor@medinatest.org", firstName: "Sue", lastName: "Supervisor", role: "supervisor", organizationId: orgId, phone: "(425) 555-0100" });

  await upsertUser({
    email: "participant@medinatest.org", firstName: "Pat", lastName: "Participant", role: "participant",
    organizationId: orgId, grade: "8", school: "Medina Academy Redmond", parentEmail: "parentviewer@medinatest.org",
  });

  // Parent (viewer) — auto-links to the participant above via parentEmail match.
  await upsertUser({ email: "parentviewer@medinatest.org", firstName: "Vera", lastName: "Viewer", role: "parent" });

  // Parent (elementary) + one managed child (no login).
  const parentElemId = await upsertUser({ email: "parentelem@medinatest.org", firstName: "Elle", lastName: "Elementary", role: "parent" });
  const [existingChildLink] = await db.select().from(guardianshipsTable).where(eq(guardianshipsTable.guardianUserId, parentElemId)).limit(1);
  if (!existingChildLink) {
    const [child] = await db
      .insert(usersTable)
      .values({
        firstName: "Charlie", lastName: "Child", role: "participant", isManaged: true,
        grade: "3", school: "Medina Academy Redmond", organizationId: orgId,
      })
      .returning({ userId: usersTable.userId });
    await db.insert(guardianshipsTable).values({ guardianUserId: parentElemId, childUserId: child.userId, isPrimary: true });
  }

  console.log("Seeded test accounts (password for all: " + PASSWORD + "):");
  console.log("  Super Admin       superadmin@medinatest.org");
  console.log("  Admin (1 org)     admin@medinatest.org      (manages '" + TEST_ORG + "')");
  console.log("  Supervisor        supervisor@medinatest.org");
  console.log("  Participant 6-12  participant@medinatest.org (grade 8)");
  console.log("  Parent (viewer)   parentviewer@medinatest.org (sees Pat Participant)");
  console.log("  Parent (elem)     parentelem@medinatest.org  (manages Charlie Child, grade 3)");
  console.log("  Org join code:    " + TEST_ORG_CODE + "  (org: " + TEST_ORG + ")");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
