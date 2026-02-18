import { Router } from 'express';
import { subscriptionController } from './subscription.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';
import { requireSuperAdmin } from '../../shared/middleware/role.middleware';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Admin routes (super admin only)
router.use('/admin', requireSuperAdmin);
router.post('/admin/subscriptions/payments', subscriptionController.createPayment.bind(subscriptionController));
router.get('/admin/subscriptions/payments', subscriptionController.getCompanyPayments.bind(subscriptionController));
router.patch('/admin/subscriptions/payments/:id/paid', subscriptionController.markPaymentAsPaid.bind(subscriptionController));
router.get('/admin/companies', subscriptionController.getAllCompanies.bind(subscriptionController));
router.get('/admin/companies/:id/metrics', subscriptionController.getCompanyMetrics.bind(subscriptionController));
router.post('/admin/subscriptions/check-overdue', subscriptionController.checkOverduePayments.bind(subscriptionController));
router.get('/admin/subscriptions/upcoming', subscriptionController.getUpcomingPayments.bind(subscriptionController));
router.delete('/admin/companies/:id',subscriptionController.delete.bind(subscriptionController));
router.patch('/admin/companies/:id/cpfcnpj-token', subscriptionController.updateCompanyCpfCnpjToken.bind(subscriptionController));
router.get('/admin/companies/:id/cpfcnpj-settings', subscriptionController.getCompanyCpfCnpjSettings.bind(subscriptionController));
// Company routes (tenant middleware required)
router.use(tenantMiddleware);
router.get('/subscriptions/payments', subscriptionController.getCompanyPayments.bind(subscriptionController));

export default router;
