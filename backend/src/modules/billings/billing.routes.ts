import { Router } from 'express';
import billingController from './billing.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// Todas as rotas requerem autenticação e tenant
router.use(authMiddleware);
router.use(tenantMiddleware);

// Criar fechamento
router.post('/', billingController.createBilling.bind(billingController));

// Listar fechamentos
router.get('/', billingController.getBillings.bind(billingController));

// Gerar fechamentos em falta para aluguéis sem nenhum fechamento
router.post(
  '/sync-missing-rentals',
  billingController.syncMissingRentals.bind(billingController),
);

// Listar pendentes de aprovação
router.get('/pending-approvals', billingController.getPendingApprovals.bind(billingController));

// Resumo vencidos + período próximo (dashboard)
router.get(
  '/attention-summary',
  billingController.getAttentionSummary.bind(billingController),
);

// Obter fechamento por ID
router.get('/:id', billingController.getBillingById.bind(billingController));

// Gerar PDF do fechamento
router.get('/:id/pdf', billingController.generateBillingPDF.bind(billingController));

// Aprovar fechamento
router.post('/:id/approve', billingController.approveBilling.bind(billingController));

// Rejeitar fechamento
router.post('/:id/reject', billingController.rejectBilling.bind(billingController));

// Marcar como pago
router.post('/:id/mark-as-paid', billingController.markAsPaid.bind(billingController));
router.put('/:id', billingController.updateBilling.bind(billingController));
router.post('/:id/cancel', billingController.cancelBilling.bind(billingController));
router.get('/:id/refresh-preview', billingController.previewRefreshBilling.bind(billingController));
router.post('/:id/refresh', billingController.refreshBilling.bind(billingController));

export default router;
