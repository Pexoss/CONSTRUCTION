import { Router } from "express";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { tenantMiddleware } from "../../shared/middleware/tenant.middleware";
import { financialController } from "./financial.controller";
import { financialFlags } from "./financial.flags";

const router = Router();
router.use(authMiddleware);
router.use(tenantMiddleware);

router.get("/financial/board", (req, res, next) => {
  if (!financialFlags.unifiedModule) {
    return res.status(404).json({ success: false, message: "Módulo financeiro unificado desabilitado" });
  }
  return financialController.getBoard(req, res, next);
});

router.get("/financial/dashboard", (req, res, next) => {
  if (!financialFlags.unifiedModule) {
    return res.status(404).json({ success: false, message: "Módulo financeiro unificado desabilitado" });
  }
  return financialController.getDashboard(req, res, next);
});

export default router;

