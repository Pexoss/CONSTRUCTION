import { Router } from 'express';
import { reportController } from './report.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Report routes
router.get('/reports/rentals', reportController.getRentalsReport.bind(reportController));
router.get('/reports/financial', reportController.getFinancialReport.bind(reportController));
router.get('/reports/most-rented-items', reportController.getMostRentedItems.bind(reportController));
router.get('/reports/occupancy-rate', reportController.getOccupancyRate.bind(reportController));
router.get('/reports/top-customers', reportController.getTopCustomers.bind(reportController));
router.get('/reports/maintenance', reportController.getMaintenanceReport.bind(reportController));
router.get('/reports/rentals/export', reportController.exportRentalsReport.bind(reportController));
router.get('/reports/financial/export', reportController.exportFinancialReport.bind(reportController));

export default router;
