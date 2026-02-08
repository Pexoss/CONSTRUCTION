import { Router } from 'express';
import { itemController } from './item.controller';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware';

const router = Router();

// All routes require authentication and tenant identification
router.use(authMiddleware);
router.use(tenantMiddleware);

// Items routes
router.get('/items/summary', itemController.getInformationsItensController.bind(itemController));
router.post('/items', itemController.createItem.bind(itemController));
router.get('/items', itemController.getItems.bind(itemController));
router.get('/items/low-stock', itemController.getLowStockItems.bind(itemController));
router.get('/items/:id', itemController.getItemById.bind(itemController));
router.put('/items/:id', itemController.updateItem.bind(itemController));
router.delete('/items/:id', itemController.deleteItem.bind(itemController));
router.post('/items/:id/adjust-quantity', itemController.adjustQuantity.bind(itemController));
router.get('/items/:id/movements', itemController.getItemMovements.bind(itemController));
router.post('/items/:id/calculate-depreciation', itemController.calculateDepreciation.bind(itemController));// Items routes
router.get('/items/:id/operational-status', itemController.getItemOperationalStatus.bind(itemController));


// Categories routes
router.post('/categories', itemController.createCategory.bind(itemController));
router.get('/categories', itemController.getCategories.bind(itemController));
router.put('/categories/:id', itemController.updateCategory.bind(itemController));
router.delete('/categories/:id', itemController.deleteCategory.bind(itemController));

// Subcategories routes
router.post('/subcategories', itemController.createSubcategory.bind(itemController));
router.get('/subcategories', itemController.getSubcategories.bind(itemController));
router.put('/subcategories/:id', itemController.updateSubcategory.bind(itemController));
router.delete('/subcategories/:id', itemController.deleteSubcategory.bind(itemController));

export default router;
