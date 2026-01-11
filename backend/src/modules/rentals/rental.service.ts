import { Rental } from './rental.model';
import { Item } from '../inventory/item.model';
import { ItemMovement } from '../inventory/itemMovement.model';
import { IRental, RentalStatus, IRentalItem, IRentalPricing } from './rental.types';
import mongoose from 'mongoose';

class RentalService {
  /**
   * Calculate rental price based on period and rates
   */
  private calculateRentalPrice(
    dailyRate: number,
    weeklyRate: number | undefined,
    monthlyRate: number | undefined,
    startDate: Date,
    endDate: Date
  ): number {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (days <= 0) {
      return 0;
    }

    // If monthly rate exists and rental is >= 30 days, use monthly rate
    if (monthlyRate && days >= 30) {
      const months = Math.floor(days / 30);
      const remainingDays = days % 30;
      return months * monthlyRate + remainingDays * dailyRate;
    }

    // If weekly rate exists and rental is >= 7 days, use weekly rate
    if (weeklyRate && days >= 7) {
      const weeks = Math.floor(days / 7);
      const remainingDays = days % 7;
      return weeks * weeklyRate + remainingDays * dailyRate;
    }

    // Default to daily rate
    return days * dailyRate;
  }

  /**
   * Calculate late fee
   */
  private calculateLateFee(returnScheduled: Date, returnActual: Date, dailyRate: number, quantity: number): number {
    if (returnActual <= returnScheduled) {
      return 0;
    }

    const daysLate = Math.ceil((returnActual.getTime() - returnScheduled.getTime()) / (1000 * 60 * 60 * 24));
    // Late fee is typically 1.5x the daily rate per day
    return daysLate * dailyRate * 1.5 * quantity;
  }

  /**
   * Create a new rental/reservation
   */
  async createRental(companyId: string, data: any, userId: string): Promise<IRental> {
    // Validate items availability
    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      // Check if enough items are available (considering current reservations)
      const activeRentals = await Rental.countDocuments({
        companyId,
        'items.itemId': item.itemId,
        status: { $in: ['reserved', 'active'] },
      });

      const totalRented = inventoryItem.quantity.rented || 0;
      const available = inventoryItem.quantity.available || 0;

      if (available < item.quantity) {
        throw new Error(`Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${item.quantity}`);
      }
    }

    // Calculate pricing for each item
    const itemsWithPricing: IRentalItem[] = [];
    let totalSubtotal = 0;
    let totalDeposit = 0;

    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      const price = this.calculateRentalPrice(
        inventoryItem.pricing.dailyRate,
        inventoryItem.pricing.weeklyRate,
        inventoryItem.pricing.monthlyRate,
        new Date(data.dates.pickupScheduled),
        new Date(data.dates.returnScheduled)
      );

      const subtotal = price * item.quantity;
      const deposit = (inventoryItem.pricing.depositAmount || 0) * item.quantity;

      itemsWithPricing.push({
        itemId: item.itemId,
        quantity: item.quantity,
        unitPrice: price,
        subtotal,
      });

      totalSubtotal += subtotal;
      totalDeposit += deposit;
    }

    const pricing: IRentalPricing = {
      subtotal: totalSubtotal,
      deposit: totalDeposit,
      discount: data.pricing?.discount || 0,
      lateFee: 0,
      total: totalSubtotal - (data.pricing?.discount || 0),
    };

    // Create rental
    const rental = await Rental.create({
      companyId,
      customerId: data.customerId,
      items: itemsWithPricing,
      dates: {
        reservedAt: new Date(),
        pickupScheduled: new Date(data.dates.pickupScheduled),
        returnScheduled: new Date(data.dates.returnScheduled),
      },
      pricing,
      status: 'reserved',
      notes: data.notes,
      createdBy: userId,
    });

    // Update item quantities (reserve items)
    for (const item of data.items) {
      await this.updateItemQuantityForRental(companyId, item.itemId, item.quantity, 'reserve', userId, rental._id);
    }

    return rental;
  }

  /**
   * Get all rentals with filters
   */
  async getRentals(
    companyId: string,
    filters: {
      status?: RentalStatus;
      customerId?: string;
      startDate?: Date;
      endDate?: Date;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ rentals: IRental[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.startDate || filters.endDate) {
      query.$or = [
        { 'dates.pickupScheduled': { $gte: filters.startDate || new Date(0), $lte: filters.endDate || new Date() } },
        { 'dates.returnScheduled': { $gte: filters.startDate || new Date(0), $lte: filters.endDate || new Date() } },
      ];
    }

    if (filters.search) {
      query.$or = [
        { rentalNumber: { $regex: filters.search, $options: 'i' } },
        { notes: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [rentals, total] = await Promise.all([
      Rental.find(query)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku pricing')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Rental.countDocuments(query),
    ]);

    return { rentals, total, page, limit };
  }

  /**
   * Get rental by ID
   */
  async getRentalById(companyId: string, rentalId: string): Promise<IRental | null> {
    return Rental.findOne({ _id: rentalId, companyId })
      .populate('customerId', 'name cpfCnpj email phone address')
      .populate('items.itemId', 'name sku pricing photos')
      .populate('createdBy', 'name email')
      .populate('checklistPickup.completedBy', 'name email')
      .populate('checklistReturn.completedBy', 'name email');
  }

  /**
   * Update rental status
   */
  async updateRentalStatus(
    companyId: string,
    rentalId: string,
    status: RentalStatus,
    userId: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    const oldStatus = rental.status;
    rental.status = status;

    // Handle status transitions
    if (status === 'active' && oldStatus === 'reserved') {
      // Mark pickup as actual
      rental.dates.pickupActual = new Date();
      
      // Update item quantities (move from reserved to rented)
      for (const item of rental.items) {
        await this.updateItemQuantityForRental(companyId, item.itemId, item.quantity, 'activate', userId, rental._id);
      }
    } else if (status === 'completed' && (oldStatus === 'active' || oldStatus === 'overdue')) {
      // Mark return as actual
      rental.dates.returnActual = new Date();
      
      // Calculate late fee if applicable
      if (rental.dates.returnActual > rental.dates.returnScheduled) {
        let totalLateFee = 0;
        for (const item of rental.items) {
          const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
          if (inventoryItem) {
            const lateFee = this.calculateLateFee(
              rental.dates.returnScheduled,
              rental.dates.returnActual,
              inventoryItem.pricing.dailyRate,
              item.quantity
            );
            totalLateFee += lateFee;
          }
        }
        rental.pricing.lateFee = totalLateFee;
        rental.pricing.total = rental.pricing.subtotal - rental.pricing.discount + totalLateFee;
      }
      
      // Update item quantities (return items)
      for (const item of rental.items) {
        await this.updateItemQuantityForRental(companyId, item.itemId, item.quantity, 'return', userId, rental._id);
      }
    } else if (status === 'cancelled' && oldStatus === 'reserved') {
      // Release reserved items
      for (const item of rental.items) {
        await this.updateItemQuantityForRental(companyId, item.itemId, item.quantity, 'cancel', userId, rental._id);
      }
    }

    await rental.save();
    return rental;
  }

  /**
   * Extend rental period
   */
  async extendRental(
    companyId: string,
    rentalId: string,
    newReturnDate: Date,
    userId: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (rental.status !== 'active' && rental.status !== 'reserved') {
      throw new Error('Can only extend active or reserved rentals');
    }

    const oldReturnDate = rental.dates.returnScheduled;
    rental.dates.returnScheduled = new Date(newReturnDate);

    // Recalculate pricing
    let totalSubtotal = 0;
    for (const item of rental.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (inventoryItem) {
        const price = this.calculateRentalPrice(
          inventoryItem.pricing.dailyRate,
          inventoryItem.pricing.weeklyRate,
          inventoryItem.pricing.monthlyRate,
          rental.dates.pickupScheduled,
          rental.dates.returnScheduled
        );
        const subtotal = price * item.quantity;
        totalSubtotal += subtotal;
      }
    }

    rental.pricing.subtotal = totalSubtotal;
    rental.pricing.total = totalSubtotal - rental.pricing.discount;

    await rental.save();
    return rental;
  }

  /**
   * Update pickup checklist
   */
  async updatePickupChecklist(
    companyId: string,
    rentalId: string,
    checklist: any,
    userId: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    rental.checklistPickup = {
      ...checklist,
      completedAt: new Date(),
      completedBy: userId,
    };

    await rental.save();
    return rental;
  }

  /**
   * Update return checklist
   */
  async updateReturnChecklist(
    companyId: string,
    rentalId: string,
    checklist: any,
    userId: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    rental.checklistReturn = {
      ...checklist,
      completedAt: new Date(),
      completedBy: userId,
    };

    await rental.save();
    return rental;
  }

  /**
   * Update rental (general update)
   */
  async updateRental(companyId: string, rentalId: string, data: any, userId: string): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    // Only allow updates to certain fields
    if (data.notes !== undefined) {
      rental.notes = data.notes;
    }

    if (data.pricing?.discount !== undefined) {
      rental.pricing.discount = data.pricing.discount;
      rental.pricing.total = rental.pricing.subtotal - rental.pricing.discount + rental.pricing.lateFee;
    }

    await rental.save();
    return rental;
  }

  /**
   * Check and update overdue rentals
   */
  async checkOverdueRentals(companyId: string): Promise<number> {
    const now = new Date();
    const overdueRentals = await Rental.updateMany(
      {
        companyId,
        status: { $in: ['active', 'reserved'] },
        'dates.returnScheduled': { $lt: now },
      },
      {
        $set: { status: 'overdue' },
      }
    );

    return overdueRentals.modifiedCount;
  }

  /**
   * Helper method to update item quantities based on rental actions
   */
  private async updateItemQuantityForRental(
    companyId: string,
    itemId: mongoose.Types.ObjectId,
    quantity: number,
    action: 'reserve' | 'activate' | 'return' | 'cancel',
    userId: string,
    rentalId: mongoose.Types.ObjectId
  ): Promise<void> {
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

    switch (action) {
      case 'reserve':
        // Reserve items: reduce available
        item.quantity.available -= quantity;
        break;
      case 'activate':
        // Activate: move from reserved to rented (available already reduced)
        item.quantity.rented += quantity;
        break;
      case 'return':
        // Return: increase available, decrease rented
        item.quantity.rented -= quantity;
        item.quantity.available += quantity;
        break;
      case 'cancel':
        // Cancel: restore available
        item.quantity.available += quantity;
        break;
    }

    if (item.quantity.available < 0 || item.quantity.rented < 0) {
      throw new Error('Invalid quantity operation');
    }

    await item.save();

    // Register movement
    await ItemMovement.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId,
      type: action === 'reserve' ? 'rent' : action === 'return' ? 'return' : 'adjustment',
      quantity,
      previousQuantity,
      newQuantity: {
        total: item.quantity.total,
        available: item.quantity.available,
        rented: item.quantity.rented,
        maintenance: item.quantity.maintenance,
        damaged: item.quantity.damaged,
      },
      referenceId: rentalId,
      notes: `Rental ${action}: ${quantity} units`,
      createdBy: new mongoose.Types.ObjectId(userId),
    });
  }
}

export const rentalService = new RentalService();
