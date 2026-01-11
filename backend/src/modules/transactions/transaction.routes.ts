import { Router } from 'express';
import { transactionController } from './transaction.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Transaction routes
router.post('/transactions', transactionController.createTransaction.bind(transactionController));
router.get('/transactions', transactionController.getTransactions.bind(transactionController));
router.get('/transactions/dashboard', transactionController.getFinancialDashboard.bind(transactionController));
router.get('/transactions/receivable', transactionController.getAccountsReceivable.bind(transactionController));
router.get('/transactions/payable', transactionController.getAccountsPayable.bind(transactionController));
router.get('/transactions/:id', transactionController.getTransactionById.bind(transactionController));
router.put('/transactions/:id', transactionController.updateTransaction.bind(transactionController));
router.delete('/transactions/:id', transactionController.deleteTransaction.bind(transactionController));
router.post('/transactions/check-overdue', transactionController.checkOverdueTransactions.bind(transactionController));

export default router;
