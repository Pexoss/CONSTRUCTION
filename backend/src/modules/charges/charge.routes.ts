import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { tenantMiddleware } from "../../shared/middleware/tenant.middleware";
import { requireFinancialManager } from "../../shared/middleware/financial-manager.middleware";
import { chargeController } from "./charge.controller";

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get("/charges", chargeController.list.bind(chargeController));
router.get("/charges/:id/pdf", chargeController.pdf.bind(chargeController));

router.post("/charges", requireFinancialManager, chargeController.create.bind(chargeController));
router.post(
  "/charges/:id/payments",
  requireFinancialManager,
  chargeController.applyPayment.bind(chargeController),
);
router.post(
  "/charges/:id/cancel",
  requireFinancialManager,
  chargeController.cancel.bind(chargeController),
);
router.put("/charges/:id", requireFinancialManager, chargeController.update.bind(chargeController));

export default router;
