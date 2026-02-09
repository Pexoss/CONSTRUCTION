import { Router } from 'express';
import { rentalController } from './rental.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// NOVO: Dashboard de vencimentos
router.get('/rentals/expiration-dashboard', rentalController.getExpirationDashboard.bind(rentalController));

// Rental routes
router.post('/rentals', rentalController.createRental.bind(rentalController));
router.get('/rentals', rentalController.getRentals.bind(rentalController));
router.get('/rentals/:id', rentalController.getRentalById.bind(rentalController));
router.put('/rentals/:id', rentalController.updateRental.bind(rentalController));
router.patch('/rentals/:id/status', rentalController.updateRentalStatus.bind(rentalController));
router.patch('/rentals/:id/extend', rentalController.extendRental.bind(rentalController));
router.patch('/rentals/:id/checklist/pickup', rentalController.updatePickupChecklist.bind(rentalController));
router.patch('/rentals/:id/checklist/return', rentalController.updateReturnChecklist.bind(rentalController));
router.get('/rentals/:id/close-preview', rentalController.getClosePreview.bind(rentalController));

router.post('/rentals/check-overdue', rentalController.checkOverdueRentals.bind(rentalController));
// NOVO: Sistema de aprovações
router.get('/rentals/pending-approvals', rentalController.getPendingApprovals.bind(rentalController));
router.post('/rentals/:id/request-approval', rentalController.requestApproval.bind(rentalController));
router.post('/rentals/:id/approve/:approvalIndex', rentalController.approveRequest.bind(rentalController));
router.post('/rentals/:id/reject/:approvalIndex', rentalController.rejectRequest.bind(rentalController));
router.post('/rentals/:id/discount', rentalController.applyDiscount.bind(rentalController));
router.post('/rentals/:id/change-rental-type', rentalController.changeRentalType.bind(rentalController));


export default router;
