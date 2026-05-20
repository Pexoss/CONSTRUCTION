import { Router } from 'express';
import { companyController } from './company.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';
import { requireRoles } from '../../shared/middleware/role.middleware';
import { UserRole } from '../../shared/constants/roles';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);
router.use(requireRoles([UserRole.ADMIN, UserRole.SUPERADMIN]));

router.get('/settings/cpfcnpj', companyController.getCpfCnpjSettings.bind(companyController));
router.patch('/settings/cpfcnpj', companyController.updateCpfCnpjSettings.bind(companyController));

router.get('/invoice-issuers', companyController.getInvoiceIssuers.bind(companyController));
router.put('/invoice-issuers', companyController.updateInvoiceIssuers.bind(companyController));

export default router;
