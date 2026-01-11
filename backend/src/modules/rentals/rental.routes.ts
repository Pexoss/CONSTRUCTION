import { Router } from 'express';
import { rentalController } from './rental.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Rental routes
router.post('/rentals', rentalController.createRental.bind(rentalController));
router.get('/rentals', rentalController.getRentals.bind(rentalController));
router.get('/rentals/:id', rentalController.getRentalById.bind(rentalController));
router.put('/rentals/:id', rentalController.updateRental.bind(rentalController));
router.patch('/rentals/:id/status', rentalController.updateRentalStatus.bind(rentalController));
router.patch('/rentals/:id/extend', rentalController.extendRental.bind(rentalController));
router.patch('/rentals/:id/checklist/pickup', rentalController.updatePickupChecklist.bind(rentalController));
router.patch('/rentals/:id/checklist/return', rentalController.updateReturnChecklist.bind(rentalController));
router.post('/rentals/check-overdue', rentalController.checkOverdueRentals.bind(rentalController));

export default router;
