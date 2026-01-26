import { Router } from 'express';
import { customerController } from './customer.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Customer routes
router.post('/customers', customerController.createCustomer.bind(customerController));
router.get('/customers', customerController.getCustomers.bind(customerController));
router.get('/customers/:id', customerController.getCustomerById.bind(customerController));
router.put('/customers/:id', customerController.updateCustomer.bind(customerController));
router.delete('/customers/:id', customerController.deleteCustomer.bind(customerController));
router.patch('/customers/:id/block', customerController.toggleBlockCustomer.bind(customerController));

// NOVO: Endereços
router.post('/customers/:id/addresses', customerController.addAddress.bind(customerController));
router.put('/customers/:id/addresses/:addressId', customerController.updateAddress.bind(customerController));
router.delete('/customers/:id/addresses/:addressId', customerController.removeAddressById.bind(customerController));

// NOVO: Obras
router.post('/customers/:id/works', customerController.addWork.bind(customerController));
router.put('/customers/:id/works/:workId', customerController.updateWork.bind(customerController));
router.delete('/customers/:id/works/:workId', customerController.removeWork.bind(customerController));

// NOVO: Validação
router.post('/customers/:id/validate', customerController.updateValidatedData.bind(customerController));

export default router;
