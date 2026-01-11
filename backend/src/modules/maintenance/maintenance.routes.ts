import { Router } from 'express';
import { maintenanceController } from './maintenance.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Maintenance routes
router.post('/maintenance', maintenanceController.createMaintenance.bind(maintenanceController));
router.get('/maintenance', maintenanceController.getMaintenances.bind(maintenanceController));
router.get('/maintenance/upcoming', maintenanceController.getUpcomingMaintenances.bind(maintenanceController));
router.get('/maintenance/statistics', maintenanceController.getMaintenanceStatistics.bind(maintenanceController));
router.get('/maintenance/item/:itemId', maintenanceController.getItemMaintenanceHistory.bind(maintenanceController));
router.get('/maintenance/:id', maintenanceController.getMaintenanceById.bind(maintenanceController));
router.put('/maintenance/:id', maintenanceController.updateMaintenance.bind(maintenanceController));
router.patch('/maintenance/:id/status', maintenanceController.updateMaintenanceStatus.bind(maintenanceController));
router.delete('/maintenance/:id', maintenanceController.deleteMaintenance.bind(maintenanceController));

export default router;
