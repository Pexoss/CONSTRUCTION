import { Item } from './item.model';
import { ItemMovement } from './itemMovement.model';
import { Category } from './category.model';
import { Subcategory } from './subcategory.model';
import { IItem, IItemMovement } from './item.types';
import mongoose from 'mongoose';

class ItemService {
  /**
   * Create a new item
   */
  async createItem(companyId: string, data: any, userId: string): Promise<IItem> {
    // Set initial available quantity based on total if not provided
    if (!data.quantity.available && data.quantity.total) {
      data.quantity.available = data.quantity.total;
    }

    // Calculate initial available = total - (rented + maintenance + damaged)
    data.quantity.available =
      data.quantity.total -
      (data.quantity.rented || 0) -
      (data.quantity.maintenance || 0) -
      (data.quantity.damaged || 0);

    // Validate that available quantity is not negative
    if (data.quantity.available < 0) {
      throw new Error('Available quantity cannot be negative');
    }

    const item = await Item.create({
      ...data,
      companyId,
      quantity: {
        total: data.quantity.total,
        available: data.quantity.available,
        rented: data.quantity.rented || 0,
        maintenance: data.quantity.maintenance || 0,
        damaged: data.quantity.damaged || 0,
      },
    });

    // Register initial movement
    await this.registerMovement({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId: item._id as mongoose.Types.ObjectId,
      type: 'in',
      quantity: data.quantity.total,
      previousQuantity: {
        total: 0,
        available: 0,
        rented: 0,
        maintenance: 0,
        damaged: 0,
      },
      newQuantity: item.quantity,
      notes: 'Item criado',
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    return item;
  }

  /**
   * Get all items with filters
   */
  async getItems(
    companyId: string,
    filters: {
      category?: string;
      subcategory?: string;
      search?: string;
      isActive?: boolean;
      lowStock?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ items: IItem[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.category) {
      query.category = filters.category;
    }

    if (filters.subcategory) {
      query.subcategory = filters.subcategory;
    }

    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    if (filters.lowStock) {
      query.$expr = {
        $lte: [
          '$quantity.available',
          { $ifNull: ['$lowStockThreshold', Number.MAX_SAFE_INTEGER] },
        ],
      };
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { sku: { $regex: filters.search, $options: 'i' } },
        { barcode: { $regex: filters.search, $options: 'i' } },
        { customId: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Item.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Item.countDocuments(query),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Get item by ID
   */
  async getItemById(companyId: string, itemId: string): Promise<IItem | null> {
    return Item.findOne({ _id: itemId, companyId });
  }

  /**
   * Update item
   */
  async updateItem(companyId: string, itemId: string, data: any, userId: string): Promise<IItem | null> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw new Error('Item not found');
    }

    // If quantity is being updated, recalculate available
    if (data.quantity) {
      const previousQuantity = {
        total: item.quantity.total,
        available: item.quantity.available,
        rented: item.quantity.rented,
        maintenance: item.quantity.maintenance,
        damaged: item.quantity.damaged,
      };

      // Update quantities
      if (data.quantity.total !== undefined) item.quantity.total = data.quantity.total;
      if (data.quantity.rented !== undefined) item.quantity.rented = data.quantity.rented;
      if (data.quantity.maintenance !== undefined) item.quantity.maintenance = data.quantity.maintenance;
      if (data.quantity.damaged !== undefined) item.quantity.damaged = data.quantity.damaged;

      // Recalculate available
      item.quantity.available =
        item.quantity.total - item.quantity.rented - item.quantity.maintenance - item.quantity.damaged;

      if (item.quantity.available < 0) {
        throw new Error('Available quantity cannot be negative');
      }

      // Register quantity change movement
      await this.registerMovement({
        companyId: new mongoose.Types.ObjectId(companyId),
        itemId: item._id as mongoose.Types.ObjectId,
        type: 'adjustment',
        quantity: item.quantity.total - previousQuantity.total,
        previousQuantity,
        newQuantity: {
        total: item.quantity.total,
        available: item.quantity.available,
        rented: item.quantity.rented,
        maintenance: item.quantity.maintenance,
        damaged: item.quantity.damaged,
      },
        notes: 'Quantidade ajustada manualmente',
        createdBy: new mongoose.Types.ObjectId(userId),
      });

      data.quantity = item.quantity;
    }

    // Update other fields
    Object.assign(item, data);
    await item.save();

    return item;
  }

  /**
   * Delete item (soft delete)
   */
  async deleteItem(companyId: string, itemId: string): Promise<boolean> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw new Error('Item not found');
    }

    // Soft delete
    item.isActive = false;
    await item.save();

    return true;
  }

  /**
   * Adjust quantity manually
   */
  async adjustQuantity(
    companyId: string,
    itemId: string,
    type: 'in' | 'out' | 'adjustment' | 'damage' | 'repair',
    quantity: number,
    notes: string,
    userId: string
  ): Promise<IItem> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw new Error('Item not found');
    }

    const previousQuantity = {
      total: item.quantity.total,
      available: item.quantity.available,
      rented: item.quantity.rented,
      maintenance: item.quantity.maintenance,
      damaged: item.quantity.damaged,
    };

    switch (type) {
      case 'in':
        item.quantity.total += quantity;
        item.quantity.available += quantity;
        break;
      case 'out':
        if (item.quantity.available < quantity) {
          throw new Error('Insufficient available quantity');
        }
        item.quantity.total -= quantity;
        item.quantity.available -= quantity;
        break;
      case 'damage':
        if (item.quantity.available < quantity) {
          throw new Error('Insufficient available quantity');
        }
        item.quantity.available -= quantity;
        item.quantity.damaged += quantity;
        break;
      case 'repair':
        if (item.quantity.damaged < quantity) {
          throw new Error('Insufficient damaged quantity');
        }
        item.quantity.damaged -= quantity;
        item.quantity.available += quantity;
        break;
      case 'adjustment':
        // Manual adjustment - quantity can be positive or negative
        item.quantity.available += quantity;
        item.quantity.total += quantity;
        break;
    }

    if (item.quantity.available < 0 || item.quantity.total < 0) {
      throw new Error('Quantity cannot be negative');
    }

    await item.save();

    // Register movement
    await this.registerMovement({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId: item._id as mongoose.Types.ObjectId,
      type,
      quantity: Math.abs(quantity),
      previousQuantity,
      newQuantity: {
        total: item.quantity.total,
        available: item.quantity.available,
        rented: item.quantity.rented,
        maintenance: item.quantity.maintenance,
        damaged: item.quantity.damaged,
      },
      notes,
      createdBy: new mongoose.Types.ObjectId(userId),
    });

    return item;
  }

  /**
   * Get item movements history
   */
  async getItemMovements(
    companyId: string,
    itemId?: string,
    filters: { type?: string; startDate?: Date; endDate?: Date; page?: number; limit?: number } = {}
  ): Promise<{ movements: any[]; total: number }> {
    const query: any = { companyId };

    if (itemId) {
      query.itemId = itemId;
    }

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [movements, total] = await Promise.all([
      ItemMovement.find(query)
        .populate('itemId', 'name sku')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ItemMovement.countDocuments(query),
    ]);

    return { movements, total };
  }

  /**
   * Get low stock items
   */
  async getLowStockItems(companyId: string): Promise<IItem[]> {
    return Item.find({
      companyId,
      isActive: true,
      $expr: {
        $lte: ['$quantity.available', { $ifNull: ['$lowStockThreshold', Number.MAX_SAFE_INTEGER] }],
      },
    }).sort({ 'quantity.available': 1 });
  }

  /**
   * Calculate depreciation for an item
   */
  async calculateDepreciation(itemId: string, companyId: string): Promise<IItem | null> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item || !item.depreciation || !item.depreciation.initialValue || !item.depreciation.purchaseDate) {
      return null;
    }

    const depreciation = item.depreciation;
    if (!depreciation?.purchaseDate || !depreciation?.initialValue) {
      return null;
    }
    const purchaseDate = new Date(depreciation.purchaseDate);
    const now = new Date();
    const yearsSincePurchase = (now.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365);

    if (yearsSincePurchase <= 0) {
      return item;
    }

    const depreciationRate = depreciation.depreciationRate || 10; // 10% per year default
    const totalDepreciation = (depreciation.initialValue! * depreciationRate * yearsSincePurchase) / 100;
    depreciation.currentValue = Math.max(0, depreciation.initialValue! - totalDepreciation);
    depreciation.lastDepreciationDate = now;

    await item.save();
    return item;
  }

  /**
   * Register movement in history
   */
  private async registerMovement(movementData: Partial<IItemMovement>): Promise<void> {
    await ItemMovement.create({
      companyId: movementData.companyId!,
      itemId: movementData.itemId!,
      type: movementData.type!,
      quantity: movementData.quantity!,
      previousQuantity: movementData.previousQuantity!,
      newQuantity: movementData.newQuantity!,
      referenceId: movementData.referenceId,
      notes: movementData.notes,
      createdBy: movementData.createdBy!,
    });
  }

  /**
   * Categories CRUD
   */
  async createCategory(companyId: string, data: any): Promise<any> {
    return Category.create({ ...data, companyId });
  }

  async getCategories(companyId: string, isActive?: boolean): Promise<any[]> {
    const query: any = { companyId };
    if (isActive !== undefined) {
      query.isActive = isActive;
    }
    return Category.find(query).sort({ name: 1 });
  }

  async updateCategory(companyId: string, categoryId: string, data: any): Promise<any> {
    const category = await Category.findOne({ _id: categoryId, companyId });
    if (!category) {
      throw new Error('Category not found');
    }
    Object.assign(category, data);
    return category.save();
  }

  async deleteCategory(companyId: string, categoryId: string): Promise<boolean> {
    const category = await Category.findOne({ _id: categoryId, companyId });
    if (!category) {
      throw new Error('Category not found');
    }
    category.isActive = false;
    await category.save();
    return true;
  }

  /**
   * Subcategories CRUD
   */
  async createSubcategory(companyId: string, data: any): Promise<any> {
    return Subcategory.create({ ...data, companyId });
  }

  async getSubcategories(companyId: string, categoryId?: string, isActive?: boolean): Promise<any[]> {
    const query: any = { companyId };
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (isActive !== undefined) {
      query.isActive = isActive;
    }
    return Subcategory.find(query).populate('categoryId', 'name').sort({ name: 1 });
  }

  async updateSubcategory(companyId: string, subcategoryId: string, data: any): Promise<any> {
    const subcategory = await Subcategory.findOne({ _id: subcategoryId, companyId });
    if (!subcategory) {
      throw new Error('Subcategory not found');
    }
    Object.assign(subcategory, data);
    return subcategory.save();
  }

  async deleteSubcategory(companyId: string, subcategoryId: string): Promise<boolean> {
    const subcategory = await Subcategory.findOne({ _id: subcategoryId, companyId });
    if (!subcategory) {
      throw new Error('Subcategory not found');
    }
    subcategory.isActive = false;
    await subcategory.save();
    return true;
  }
}

export const itemService = new ItemService();
