import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { seedTestAccounts } from "../lib/seed";

const router: IRouter = Router();

/**
 * Browser-visitable diagnostic: re-runs the test-account seed, then reports
 * which accounts exist and whether the known test passwords verify against
 * the stored hashes. No auth required — returns no secrets (hashes are not
 * exposed). Intended for local/testing use only; remove before production.
 */
router.get("/v1/debug/seed-check", async (_req, res) => {
  await seedTestAccounts();

  const checks = [
    { email: "supervisor@test.com", password: "Supervisor123!" },
    { email: "admin@test.com", password: "Admin123!" },
  ];

  const rows = await db
    .select({
      email: usersTable.email,
      role: usersTable.role,
      passwordHash: usersTable.passwordHash,
    })
    .from(usersTable);

  const allAccounts = rows.map((r) => ({ email: r.email, role: r.role }));

  const results = checks.map((c) => {
    const row = rows.find((r) => r.email === c.email);
    return {
      email: c.email,
      exists: Boolean(row),
      role: row?.role ?? null,
      passwordMatches: row ? bcrypt.compareSync(c.password, row.passwordHash) : false,
    };
  });

  res.json({
    totalAccounts: rows.length,
    allAccounts,
    testAccountChecks: results,
  });
});

export default router;
