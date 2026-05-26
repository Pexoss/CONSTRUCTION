import { Router } from 'express';
import billingController from './billing.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';
import { requireFinancialManager } from '../../shared/middleware/financial-manager.middleware';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/', billingController.getBillings.bind(billingController));
router.post(
  '/sync-missing-rentals',
  requireFinancialManager,
  billingController.syncMissingRentals.bind(billingController),
);
router.get('/pending-approvals', billingController.getPendingApprovals.bind(billingController));
router.get(
  '/attention-summary',
  billingController.getAttentionSummary.bind(billingController),
);
router.get('/:id', billingController.getBillingById.bind(billingController));
router.get('/:id/pdf', billingController.generateBillingPDF.bind(billingController));
router.get('/:id/refresh-preview', requireFinancialManager, billingController.previewRefreshBilling.bind(billingController));

router.post('/', requireFinancialManager, billingController.createBilling.bind(billingController));
router.post('/:id/approve', requireFinancialManager, billingController.approveBilling.bind(billingController));
router.post('/:id/reject', requireFinancialManager, billingController.rejectBilling.bind(billingController));
router.post('/:id/mark-as-paid', requireFinancialManager, billingController.markAsPaid.bind(billingController));
router.put('/:id', requireFinancialManager, billingController.updateBilling.bind(billingController));
router.post('/:id/cancel', requireFinancialManager, billingController.cancelBilling.bind(billingController));
router.post('/:id/refresh', requireFinancialManager, billingController.refreshBilling.bind(billingController));

export default router;
