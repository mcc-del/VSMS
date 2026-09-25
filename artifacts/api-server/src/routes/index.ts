import { Router, type IRouter } from "express";
import healthRouter from "./health";
import debugRouter from "./debug";
import authRouter from "./auth";
import eventsRouter from "./events";
import submissionsRouter from "./submissions";
import externalSubmissionsRouter from "./external-submissions";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";
import parentRouter from "./parent";
import leaderboardRouter from "./leaderboard";
import organizationsRouter from "./organizations";
import schoolsRouter from "./schools";
import profileRouter from "./profile";
import metricsRouter from "./metrics";
import storageRouter from "./storage";
import serviceRecordRouter from "./service-record";
import recyclingRouter from "./recycling";
import nonprofitsRouter from "./nonprofits";
import digestsRouter from "./digests";

const router: IRouter = Router();

router.use(healthRouter);
// Diagnostic routes (they reseed test accounts and report which test passwords
// verify) are only mounted when test data is explicitly enabled — never in
// production, where they would be an unauthenticated account-takeover path.
if (["1", "true", "yes", "on"].includes((process.env["SEED_TEST_DATA"] || "").trim().toLowerCase())) {
  router.use(debugRouter);
}
router.use(authRouter);
router.use(eventsRouter);
router.use(submissionsRouter);
router.use(externalSubmissionsRouter);
router.use(adminRouter);
router.use(dashboardRouter);
router.use(parentRouter);
router.use(leaderboardRouter);
router.use(organizationsRouter);
router.use(schoolsRouter);
router.use(profileRouter);
router.use(metricsRouter);
router.use(storageRouter);
router.use(serviceRecordRouter);
router.use(recyclingRouter);
router.use(nonprofitsRouter);
router.use(digestsRouter);

export default router;
