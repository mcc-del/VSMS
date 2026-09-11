import app from "./app";
import { logger } from "./lib/logger";
import { seedTestAccounts, seedOrganizations, seedSchools, seedOrgAdmins, seedTestParticipantOrg } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Ensure the supervisor/admin test personas exist so all roles can be
  // exercised without manual database edits. Org admins are seeded after
  // organizations exist (they reference an org).
  void seedSchools();
  void (async () => {
    // Order matters: accounts and organizations must exist before we link the
    // demo org admin and attach the test participant to Medina.
    await Promise.all([seedTestAccounts(), seedOrganizations()]);
    await seedOrgAdmins();
    await seedTestParticipantOrg();
  })();
});
