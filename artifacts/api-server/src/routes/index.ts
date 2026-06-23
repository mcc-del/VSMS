import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import eventsRouter from "./events";
import submissionsRouter from "./submissions";
import externalSubmissionsRouter from "./external-submissions";
import adminRouter from "./admin";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(eventsRouter);
router.use(submissionsRouter);
router.use(externalSubmissionsRouter);
router.use(adminRouter);
router.use(dashboardRouter);

export default router;
