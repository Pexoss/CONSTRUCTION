import { Router } from "express";
import { partnerController } from "./partner.controller";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { tenantMiddleware } from "../../shared/middleware/tenant.middleware";
import { requireRoles } from "../../shared/middleware/role.middleware";
import { UserRole } from "../../shared/constants/roles";

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.post("/partners", partnerController.create.bind(partnerController));
router.get("/partners", partnerController.list.bind(partnerController));
router.get(
  "/partners/loans",
  requireRoles([UserRole.ADMIN, UserRole.SUPERADMIN]),
  partnerController.listLoans.bind(partnerController),
);
router.post(
  "/partners/loans/:id/return",
  requireRoles([UserRole.ADMIN, UserRole.SUPERADMIN]),
  partnerController.returnLoan.bind(partnerController),
);
router.get("/partners/:id", partnerController.getById.bind(partnerController));
router.put("/partners/:id", partnerController.update.bind(partnerController));
router.delete("/partners/:id", partnerController.remove.bind(partnerController));

export default router;
