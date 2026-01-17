import { Router } from 'express';
import { invoiceController } from './invoice.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Invoice routes
router.post('/invoices/from-rental', invoiceController.createInvoiceFromRental.bind(invoiceController));
router.get('/invoices', invoiceController.getInvoices.bind(invoiceController));
router.get('/invoices/:id', invoiceController.getInvoiceById.bind(invoiceController));
router.get('/invoices/:id/pdf', invoiceController.generateInvoicePDF.bind(invoiceController));
router.put('/invoices/:id', invoiceController.updateInvoice.bind(invoiceController));
router.patch('/invoices/:id/status', invoiceController.updateInvoiceStatus.bind(invoiceController));
router.delete('/invoices/:id', invoiceController.deleteInvoice.bind(invoiceController));

export default router;
