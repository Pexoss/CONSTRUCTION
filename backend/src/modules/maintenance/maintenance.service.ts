import { Maintenance } from './maintenance.model';
import { Item } from '../inventory/item.model';
import { ItemMovement } from '../inventory/itemMovement.model';
import { IMaintenance, MaintenanceType, MaintenanceStatus } from './maintenance.types';
import mongoose from 'mongoose';

class MaintenanceService {
  /**
   * Create a new maintenance record
   */
  async createMaintenance(companyId: string, data: any, userId: string): Promise<IMaintenance> {
    // Verify item exists
    const item = await Item.findOne({ _id: data.itemId, companyId });
    if (!item) {
      throw new Error('Item not found');
    }

    const maintenance = await Maintenance.create({
      ...data,
      companyId,
    });

    // If maintenance is starting, update item status
    if (data.status === 'in_progress') {
      await this.updateItemMaintenanceStatus(companyId, data.itemId, 'start', userId, maintenance._id);
    }

    return maintenance;
  }

  /**
   * Get all maintenance records with filters
   */
  async getMaintenances(
    companyId: string,
    filters: {
      itemId?: string;
      type?: MaintenanceType;
      status?: MaintenanceStatus;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ maintenances: IMaintenance[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.itemId) {
      query.itemId = filters.itemId;
    }

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      query.scheduledDate = {};
      if (filters.startDate) query.scheduledDate.$gte = filters.startDate;
      if (filters.endDate) query.scheduledDate.$lte = filters.endDate;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [maintenances, total] = await Promise.all([
      Maintenance.find(query)
        .populate('itemId', 'name sku')
        .sort({ scheduledDate: -1 })
        .skip(skip)
        .limit(limit),
      Maintenance.countDocuments(query),
    ]);

    return { maintenances, total, page, limit };
  }

  /**
   * Get maintenance by ID
   */
  async getMaintenanceById(companyId: string, maintenanceId: string): Promise<IMaintenance | null> {
    return Maintenance.findOne({ _id: maintenanceId, companyId })
      .populate('itemId', 'name sku photos specifications');
  }

  /**
   * Get maintenance history for an item
   */
  async getItemMaintenanceHistory(
    companyId: string,
    itemId: string,
    filters: {
      type?: MaintenanceType;
      status?: MaintenanceStatus;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ maintenances: IMaintenance[]; total: number }> {
    const query: any = { companyId, itemId };

    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [maintenances, total] = await Promise.all([
      Maintenance.find(query)
        .sort({ scheduledDate: -1 })
        .skip(skip)
        .limit(limit),
      Maintenance.countDocuments(query),
    ]);

    return { maintenances, total };
  }

  /**
   * Update maintenance status
   */
  async updateMaintenanceStatus(
    companyId: string,
    maintenanceId: string,
    status: MaintenanceStatus,
    userId: string,
    data?: { completedDate?: Date; performedBy?: string; notes?: string }

  ): Promise<IMaintenance | null> {

    console.log('[updateMaintenanceStatus] data recebida:', data);
    console.log('[completedDate type]', typeof data?.completedDate);
    console.log('[completedDate instanceof Date]', data?.completedDate instanceof Date);
    const maintenance = await Maintenance.findOne({ _id: maintenanceId, companyId });

    if (!maintenance) {
      throw new Error('Maintenance not found');
    }

    const oldStatus = maintenance.status;
    maintenance.status = status; // sempre atualiza

    if (status === 'in_progress') {
      await this.updateItemMaintenanceStatus(
        companyId,
        maintenance.itemId.toString(),
        'start',
        userId,
        maintenance._id
      );
    } else if (status === 'completed') {
      maintenance.completedDate = data?.completedDate ? new Date(data.completedDate) : new Date();
      if (data?.performedBy) maintenance.performedBy = data.performedBy;
      if (data?.notes) maintenance.notes = data.notes;

      await this.updateItemMaintenanceStatus(
        companyId,
        maintenance.itemId.toString(),
        'end',
        userId,
        maintenance._id
      );
    }

    console.log('[maintenance before save]', {
      status: maintenance.status,
      completedDate: maintenance.completedDate,
    });

    maintenance.status = status;
    console.log('[ANTES DO SAVE] status:', maintenance.status);
    await maintenance.save();
    console.log('[DEPOIS DO SAVE] status:', maintenance.status);
    return maintenance;
  }

  /**
   * Update maintenance
   */
  async updateMaintenance(
    companyId: string,
    maintenanceId: string,
    data: any,
    userId: string
  ): Promise<IMaintenance | null> {
    const maintenance = await Maintenance.findOne({ _id: maintenanceId, companyId });

    if (!maintenance) {
      throw new Error('Maintenance not found');
    }

    // If status is being changed, handle transitions
    if (data.status && data.status !== maintenance.status) {
      return this.updateMaintenanceStatus(companyId, maintenanceId, data.status, userId, data);
    }

    // Update other fields
    Object.assign(maintenance, data);
    await maintenance.save();

    return maintenance;
  }

  /**
   * Delete maintenance
   */
  async deleteMaintenance(companyId: string, maintenanceId: string, userId: string): Promise<boolean> {
    const maintenance = await Maintenance.findOne({ _id: maintenanceId, companyId });

    if (!maintenance) {
      throw new Error('Maintenance not found');
    }

    // If maintenance is in progress, return item to available
    if (maintenance.status === 'in_progress') {
      await this.updateItemMaintenanceStatus(
        companyId,
        maintenance.itemId.toString(),
        'end',
        userId,
        maintenance._id
      );
    }

    await Maintenance.deleteOne({ _id: maintenanceId, companyId });
    return true;
  }

  /**
   * Get upcoming scheduled maintenances
   */
  async getUpcomingMaintenances(companyId: string, days: number = 30): Promise<IMaintenance[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);

    return Maintenance.find({
      companyId,
      status: 'scheduled',
      scheduledDate: {
        $gte: today,
        $lte: futureDate,
      },
    })
      .populate('itemId', 'name sku')
      .sort({ scheduledDate: 1 });
  }

  /**
   * Get maintenance statistics
   */
  async getMaintenanceStatistics(companyId: string, itemId?: string): Promise<{
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
    totalCost: number;
    byType: { preventive: number; corrective: number };
  }> {
    const query: any = { companyId };
    if (itemId) {
      query.itemId = itemId;
    }

    const [total, scheduled, inProgress, completed, allMaintenances] = await Promise.all([
      Maintenance.countDocuments(query),
      Maintenance.countDocuments({ ...query, status: 'scheduled' }),
      Maintenance.countDocuments({ ...query, status: 'in_progress' }),
      Maintenance.countDocuments({ ...query, status: 'completed' }),
      Maintenance.find(query).select('type cost'),
    ]);

    const totalCost = allMaintenances.reduce((sum, m) => sum + (m.cost || 0), 0);
    const byType = {
      preventive: allMaintenances.filter((m) => m.type === 'preventive').length,
      corrective: allMaintenances.filter((m) => m.type === 'corrective').length,
    };

    return {
      total,
      scheduled,
      inProgress,
      completed,
      totalCost,
      byType,
    };
  }

  /**
   * Helper method to update item maintenance status
   */
  private async updateItemMaintenanceStatus(
    companyId: string,
    itemId: mongoose.Types.ObjectId | string,
    action: 'start' | 'end',
    userId: string,
    maintenanceId: mongoose.Types.ObjectId
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

    if (action === 'start') {
      // Move item to maintenance (reduce available, increase maintenance)
      if (item.quantity.available > 0) {
        item.quantity.available -= 1;
        item.quantity.maintenance = (item.quantity.maintenance || 0) + 1;
      } else {
        throw new Error('No available items to put in maintenance');
      }
    } else if (action === 'end') {
      // Return item from maintenance (reduce maintenance, increase available)
      if (item.quantity.maintenance > 0) {
        item.quantity.maintenance -= 1;
        item.quantity.available = (item.quantity.available || 0) + 1;
      }
    }

    if (item.quantity.available < 0 || item.quantity.maintenance < 0) {
      throw new Error('Invalid quantity operation');
    }

    await item.save();

    // Register movement
    await ItemMovement.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId: new mongoose.Types.ObjectId(itemId.toString()),
      type: action === 'start' ? 'maintenance_start' : 'maintenance_end',
      quantity: 1,
      previousQuantity,
      newQuantity: {
        total: item.quantity.total,
        available: item.quantity.available,
        rented: item.quantity.rented,
        maintenance: item.quantity.maintenance,
        damaged: item.quantity.damaged,
      },
      referenceId: maintenanceId,
      notes: `Maintenance ${action}: ${action === 'start' ? 'Started' : 'Completed'}`,
      createdBy: new mongoose.Types.ObjectId(userId),
    });
  }
}

export const maintenanceService = new MaintenanceService();
