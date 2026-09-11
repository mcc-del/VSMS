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
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(debugRouter);
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
router.use(storageRouter);

export default router;
