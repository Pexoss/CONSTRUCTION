import { Request, Response, NextFunction } from 'express';
import { itemService } from './item.service';
import {
  createItemSchema,
  updateItemSchema,
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
  adjustQuantitySchema,
} from './item.validator';

export class ItemController {
  /**
   * Create a new item
   * POST /api/inventory/items
   */
  async createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const userId = req.user!._id.toString();
      const validatedData = createItemSchema.parse(req.body);
      const item = await itemService.createItem(companyId, validatedData, userId);

      res.status(201).json({
        success: true,
        message: 'Item created successfully',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all items with filters
   * GET /api/inventory/items
   */
  async getItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const filters = {
        category: req.query.category as string,
        subcategory: req.query.subcategory as string,
        search: req.query.search as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        lowStock: req.query.lowStock === 'true',
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await itemService.getItems(companyId, filters);

      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get item by ID
   * GET /api/inventory/items/:id
   */
  async getItemById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.id;
      const item = await itemService.getItemById(companyId, itemId);

      if (!item) {
        res.status(404).json({
          success: false,
          message: 'Item not found',
        });
        return;
      }

      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update item
   * PUT /api/inventory/items/:id
   */
  async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.id;
      const userId = req.user!._id.toString();
      const validatedData = updateItemSchema.parse(req.body);
      const item = await itemService.updateItem(companyId, itemId, validatedData, userId);

      if (!item) {
        res.status(404).json({
          success: false,
          message: 'Item not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Item updated successfully',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete item (soft delete)
   * DELETE /api/inventory/items/:id
   */
  async deleteItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.id;
      await itemService.deleteItem(companyId, itemId);

      res.json({
        success: true,
        message: 'Item deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Adjust item quantity
   * POST /api/inventory/items/:id/adjust-quantity
   */
  async adjustQuantity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.id;
      const userId = req.user!._id.toString();
      const { type, quantity, notes } = adjustQuantitySchema.parse(req.body);

      const item = await itemService.adjustQuantity(companyId, itemId, type, quantity, notes || '', userId);

      res.json({
        success: true,
        message: 'Quantity adjusted successfully',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get item movements history
   * GET /api/inventory/items/:id/movements
   */
  async getItemMovements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.id;
      const filters = {
        type: req.query.type as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };

      const result = await itemService.getItemMovements(companyId, itemId, filters);

      res.json({
        success: true,
        data: result.movements,
        total: result.total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get low stock items
   * GET /api/inventory/items/low-stock
   */
  async getLowStockItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const items = await itemService.getLowStockItems(companyId);

      res.json({
        success: true,
        data: items,
        count: items.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calculate depreciation
   * POST /api/inventory/items/:id/calculate-depreciation
   */
  async calculateDepreciation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const itemId = req.params.id;
      const item = await itemService.calculateDepreciation(itemId, companyId);

      if (!item) {
        res.status(400).json({
          success: false,
          message: 'Item does not have depreciation data configured',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Depreciation calculated successfully',
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Categories endpoints
   */
  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const validatedData = createCategorySchema.parse(req.body);
      const category = await itemService.createCategory(companyId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
      const categories = await itemService.getCategories(companyId, isActive);

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const categoryId = req.params.id;
      const validatedData = updateCategorySchema.parse(req.body);
      const category = await itemService.updateCategory(companyId, categoryId, validatedData);

      res.json({
        success: true,
        message: 'Category updated successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const categoryId = req.params.id;
      await itemService.deleteCategory(companyId, categoryId);

      res.json({
        success: true,
        message: 'Category deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Subcategories endpoints
   */
  async createSubcategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const validatedData = createSubcategorySchema.parse(req.body);
      const subcategory = await itemService.createSubcategory(companyId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Subcategory created successfully',
        data: subcategory,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSubcategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const categoryId = req.query.categoryId as string;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
      const subcategories = await itemService.getSubcategories(companyId, categoryId, isActive);

      res.json({
        success: true,
        data: subcategories,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSubcategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const subcategoryId = req.params.id;
      const validatedData = updateSubcategorySchema.parse(req.body);
      const subcategory = await itemService.updateSubcategory(companyId, subcategoryId, validatedData);

      res.json({
        success: true,
        message: 'Subcategory updated successfully',
        data: subcategory,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSubcategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const subcategoryId = req.params.id;
      await itemService.deleteSubcategory(companyId, subcategoryId);

      res.json({
        success: true,
        message: 'Subcategory deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const itemController = new ItemController();
