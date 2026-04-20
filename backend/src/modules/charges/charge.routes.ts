import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { tenantMiddleware } from "../../shared/middleware/tenant.middleware";
import { chargeController } from "./charge.controller";

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.post("/charges", chargeController.create.bind(chargeController));
router.get("/charges", chargeController.list.bind(chargeController));
router.post("/charges/:id/payments", chargeController.applyPayment.bind(chargeController));
router.post("/charges/:id/cancel", chargeController.cancel.bind(chargeController));
router.put("/charges/:id", chargeController.update.bind(chargeController));
router.get("/charges/:id/pdf", chargeController.pdf.bind(chargeController));

export default router;

