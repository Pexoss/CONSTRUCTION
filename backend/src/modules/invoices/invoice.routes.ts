import { Router } from 'express';
import { invoiceController } from './invoice.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';
import { requireFinancialManager } from '../../shared/middleware/financial-manager.middleware';

const router = Router();

router.use(authMiddleware);
router.use(tenantMiddleware);

router.get('/invoices', invoiceController.getInvoices.bind(invoiceController));
router.get('/invoices/:id', invoiceController.getInvoiceById.bind(invoiceController));
router.get('/invoices/:id/pdf', invoiceController.generateInvoicePDF.bind(invoiceController));

router.post(
  '/invoices/from-rental',
  requireFinancialManager,
  invoiceController.createInvoiceFromRental.bind(invoiceController),
);
router.post(
  '/invoices/from-billings',
  requireFinancialManager,
  invoiceController.createInvoiceFromBillings.bind(invoiceController),
);
router.put('/invoices/:id', requireFinancialManager, invoiceController.updateInvoice.bind(invoiceController));
router.patch(
  '/invoices/:id/status',
  requireFinancialManager,
  invoiceController.updateInvoiceStatus.bind(invoiceController),
);
router.delete('/invoices/:id', requireFinancialManager, invoiceController.deleteInvoice.bind(invoiceController));

export default router;
