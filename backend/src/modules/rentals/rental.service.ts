import { Rental } from './rental.model';
import { Item } from '../inventory/item.model';
import { ItemMovement } from '../inventory/itemMovement.model';
import { IRental, RentalStatus, IRentalItem, IRentalPricing, IRentalService, IRentalWorkAddress, IRentalChangeHistory, IRentalPendingApproval, RentalType } from './rental.types';
import mongoose from 'mongoose';

class RentalService {
  /**
   * Calculate rental price based on period and rates
   * NOVO: Suporta biweeklyRate e rentalType
   */
  private calculateRentalPrice(
    dailyRate: number,
    weeklyRate: number | undefined,
    biweeklyRate: number | undefined,
    monthlyRate: number | undefined,
    startDate: Date,
    endDate: Date,
    rentalType?: RentalType
  ): number {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (days <= 0) {
      return 0;
    }

    // Se rentalType for especificado, usar a taxa correspondente
    if (rentalType) {
      switch (rentalType) {
        case 'daily':
          return days * dailyRate;
        case 'weekly':
          if (weeklyRate) {
            const weeks = Math.ceil(days / 7);
            return weeks * weeklyRate;
          }
          return days * dailyRate;
        case 'biweekly':
          if (biweeklyRate) {
            const biweeks = Math.ceil(days / 15);
            return biweeks * biweeklyRate;
          }
          return days * dailyRate;
        case 'monthly':
          if (monthlyRate) {
            const months = Math.ceil(days / 30);
            return months * monthlyRate;
          }
          return days * dailyRate;
      }
    }

    // Lógica antiga para compatibilidade (se rentalType não especificado)
    // If monthly rate exists and rental is >= 30 days, use monthly rate
    if (monthlyRate && days >= 30) {
      const months = Math.floor(days / 30);
      const remainingDays = days % 30;
      return months * monthlyRate + remainingDays * dailyRate;
    }

    // If biweekly rate exists and rental is >= 15 days, use biweekly rate
    if (biweeklyRate && days >= 15) {
      const biweeks = Math.floor(days / 15);
      const remainingDays = days % 15;
      return biweeks * biweeklyRate + remainingDays * dailyRate;
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
    let equipmentSubtotal = 0;
    let totalDeposit = 0;

    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      // NOVO: Verificar se é item unitário e se unitId foi especificado
      if (inventoryItem.trackingType === 'unit' && !item.unitId) {
        throw new Error(`Item ${inventoryItem.name} is unit-based. Please specify unitId.`);
      }

      // NOVO: Usar rentalType do item ou default daily
      const rentalType: RentalType = item.rentalType || 'daily';

      const price = this.calculateRentalPrice(
        inventoryItem.pricing.dailyRate,
        inventoryItem.pricing.weeklyRate,
        inventoryItem.pricing.biweeklyRate,
        inventoryItem.pricing.monthlyRate,
        new Date(data.dates.pickupScheduled),
        new Date(data.dates.returnScheduled),
        rentalType
      );

      const subtotal = price * item.quantity;
      const deposit = (inventoryItem.pricing.depositAmount || 0) * item.quantity;

      itemsWithPricing.push({
        itemId: item.itemId,
        unitId: item.unitId, // NOVO
        quantity: item.quantity,
        unitPrice: price,
        rentalType, // NOVO
        subtotal,
      });

      equipmentSubtotal += subtotal;
      totalDeposit += deposit;
    }

    // NOVO: Calcular subtotal de serviços
    let servicesSubtotal = 0;
    const services: IRentalService[] = (data.services || []).map((service: any) => {
      const quantity = service.quantity || 1;
      const subtotal = service.price * quantity;
      servicesSubtotal += subtotal;
      return {
        description: service.description,
        price: service.price,
        quantity,
        subtotal,
        category: service.category || 'other',
        notes: service.notes,
      };
    });

    const totalSubtotal = equipmentSubtotal + servicesSubtotal;
    const discount = data.pricing?.discount || 0;

    const pricing: IRentalPricing = {
      equipmentSubtotal, // NOVO
      servicesSubtotal, // NOVO
      subtotal: totalSubtotal,
      deposit: totalDeposit,
      discount,
      discountReason: data.pricing?.discountReason, // NOVO
      discountApprovedBy: data.pricing?.discountApprovedBy ? new mongoose.Types.ObjectId(data.pricing.discountApprovedBy) : undefined, // NOVO
      lateFee: 0,
      total: totalSubtotal - discount,
    };

    // NOVO: Preparar endereço da obra se fornecido
    let workAddress: IRentalWorkAddress | undefined;
    if (data.workAddress) {
      workAddress = {
        street: data.workAddress.street,
        number: data.workAddress.number,
        complement: data.workAddress.complement,
        neighborhood: data.workAddress.neighborhood,
        city: data.workAddress.city,
        state: data.workAddress.state,
        zipCode: data.workAddress.zipCode,
        workName: data.workAddress.workName,
        workId: data.workAddress.workId ? new mongoose.Types.ObjectId(data.workAddress.workId) : undefined,
      };
    }

    // NOVO: Preparar ciclo de faturamento
    const billingCycle = data.dates?.billingCycle || itemsWithPricing[0]?.rentalType || 'daily';

    // Create rental
    const rental = await Rental.create({
      companyId,
      customerId: data.customerId,
      items: itemsWithPricing,
      services: services.length > 0 ? services : undefined, // NOVO
      workAddress, // NOVO
      dates: {
        reservedAt: new Date(),
        pickupScheduled: new Date(data.dates.pickupScheduled),
        returnScheduled: new Date(data.dates.returnScheduled),
        billingCycle, // NOVO
        lastBillingDate: data.dates?.lastBillingDate ? new Date(data.dates.lastBillingDate) : undefined, // NOVO
        nextBillingDate: data.dates?.nextBillingDate ? new Date(data.dates.nextBillingDate) : undefined, // NOVO
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
          inventoryItem.pricing.biweeklyRate,
          inventoryItem.pricing.monthlyRate,
          rental.dates.pickupScheduled,
          rental.dates.returnScheduled,
          item.rentalType
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
   * NOVO: Obter dashboard de vencimentos
   */
  async getExpirationDashboard(companyId: string): Promise<{
    expired: IRental[];
    expiringSoon: IRental[]; // Próximos 7 dias
    expiringToday: IRental[];
    active: number;
    summary: {
      totalExpired: number;
      totalExpiringSoon: number;
      totalExpiringToday: number;
      totalActive: number;
    };
  }> {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Contratos vencidos (nextBillingDate < hoje ou returnScheduled < hoje)
    const expiredQuery = {
      companyId,
      status: { $in: ['active', 'reserved'] },
      $or: [
        { 'dates.nextBillingDate': { $lt: now } },
        { 'dates.returnScheduled': { $lt: now } },
      ],
    };

    // Contratos a vencer em 7 dias
    const expiringSoonQuery = {
      companyId,
      status: { $in: ['active', 'reserved'] },
      $or: [
        {
          'dates.nextBillingDate': {
            $gte: now,
            $lte: sevenDaysFromNow,
          },
        },
        {
          'dates.returnScheduled': {
            $gte: now,
            $lte: sevenDaysFromNow,
          },
        },
      ],
    };

    // Contratos que vencem hoje
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const expiringTodayQuery = {
      companyId,
      status: { $in: ['active', 'reserved'] },
      $or: [
        {
          'dates.nextBillingDate': {
            $gte: todayStart,
            $lt: todayEnd,
          },
        },
        {
          'dates.returnScheduled': {
            $gte: todayStart,
            $lt: todayEnd,
          },
        },
      ],
    };

    // Contratos ativos
    const activeQuery = {
      companyId,
      status: 'active',
    };

    const [expired, expiringSoon, expiringToday, activeCount] = await Promise.all([
      Rental.find(expiredQuery)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku')
        .populate('workAddress')
        .sort({ 'dates.nextBillingDate': 1, 'dates.returnScheduled': 1 })
        .limit(50),
      Rental.find(expiringSoonQuery)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku')
        .populate('workAddress')
        .sort({ 'dates.nextBillingDate': 1, 'dates.returnScheduled': 1 })
        .limit(50),
      Rental.find(expiringTodayQuery)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku')
        .populate('workAddress')
        .sort({ 'dates.nextBillingDate': 1, 'dates.returnScheduled': 1 }),
      Rental.countDocuments(activeQuery),
    ]);

    return {
      expired,
      expiringSoon,
      expiringToday,
      active: activeCount,
      summary: {
        totalExpired: expired.length,
        totalExpiringSoon: expiringSoon.length,
        totalExpiringToday: expiringToday.length,
        totalActive: activeCount,
      },
    };
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

  /**
   * NOVO: Solicitar aprovação para alteração no aluguel
   */
  async requestApproval(
    companyId: string,
    rentalId: string,
    requestType: string,
    requestDetails: any,
    userId: string,
    notes?: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (!rental.pendingApprovals) {
      rental.pendingApprovals = [];
    }

    const approval: IRentalPendingApproval = {
      requestedBy: new mongoose.Types.ObjectId(userId),
      requestDate: new Date(),
      requestType,
      requestDetails,
      status: 'pending',
      notes,
    };

    rental.pendingApprovals.push(approval);
    await rental.save();

    return rental;
  }

  /**
   * NOVO: Aprovar solicitação pendente
   */
  async approveRequest(
    companyId: string,
    rentalId: string,
    approvalIndex: number,
    userId: string,
    notes?: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (!rental.pendingApprovals || approvalIndex < 0 || approvalIndex >= rental.pendingApprovals.length) {
      throw new Error('Approval request not found');
    }

    const approval = rental.pendingApprovals[approvalIndex];
    if (approval.status !== 'pending') {
      throw new Error('Approval request is not pending');
    }

    // Aplicar a alteração baseada no tipo de solicitação
    await this.applyApprovalChange(rental, approval, userId);

    // Atualizar status da aprovação
    approval.status = 'approved';
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      approval.requestType,
      approval.requestDetails.previousValue || '',
      approval.requestDetails.newValue || '',
      userId,
      notes
    );

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Rejeitar solicitação pendente
   */
  async rejectRequest(
    companyId: string,
    rentalId: string,
    approvalIndex: number,
    userId: string,
    notes: string
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (!rental.pendingApprovals || approvalIndex < 0 || approvalIndex >= rental.pendingApprovals.length) {
      throw new Error('Approval request not found');
    }

    const approval = rental.pendingApprovals[approvalIndex];
    if (approval.status !== 'pending') {
      throw new Error('Approval request is not pending');
    }

    approval.status = 'rejected';
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Aplicar alteração aprovada
   */
  private async applyApprovalChange(rental: IRental, approval: IRentalPendingApproval, userId: string): Promise<void> {
    const { requestType, requestDetails } = approval;

    switch (requestType) {
      case 'rental_type_change':
        // Alterar tipo de aluguel dos itens
        if (requestDetails.items && Array.isArray(requestDetails.items)) {
          for (const itemChange of requestDetails.items) {
            const item = rental.items.find((i) => i.itemId.toString() === itemChange.itemId);
            if (item) {
              item.rentalType = itemChange.newRentalType;
              // Recalcular preço
              // (seria necessário buscar o item do inventário para recalcular)
            }
          }
        }
        break;

      case 'discount':
        // Aplicar desconto
        rental.pricing.discount = requestDetails.discount || 0;
        rental.pricing.discountReason = requestDetails.reason;
        rental.pricing.discountApprovedBy = new mongoose.Types.ObjectId(userId);
        rental.pricing.total = rental.pricing.subtotal - rental.pricing.discount + rental.pricing.lateFee;
        break;

      case 'extension':
        // Estender período
        if (requestDetails.newReturnDate) {
          rental.dates.returnScheduled = new Date(requestDetails.newReturnDate);
          // Recalcular preços seria necessário aqui
        }
        break;

      case 'service_addition':
        // Adicionar serviço
        if (!rental.services) {
          rental.services = [];
        }
        rental.services.push(requestDetails.service);
        rental.pricing.servicesSubtotal += requestDetails.service.subtotal;
        rental.pricing.subtotal = rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal;
        rental.pricing.total = rental.pricing.subtotal - rental.pricing.discount + rental.pricing.lateFee;
        break;

      default:
        // Outros tipos de alteração podem ser adicionados aqui
        break;
    }
  }

  /**
   * NOVO: Adicionar entrada no histórico de alterações
   */
  private async addChangeHistory(
    rental: IRental,
    changeType: string,
    previousValue: string,
    newValue: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    if (!rental.changeHistory) {
      rental.changeHistory = [];
    }

    const historyEntry: IRentalChangeHistory = {
      date: new Date(),
      changedBy: new mongoose.Types.ObjectId(userId),
      changeType,
      previousValue,
      newValue,
      reason,
      approvedBy: new mongoose.Types.ObjectId(userId),
    };

    rental.changeHistory.push(historyEntry);
  }

  /**
   * NOVO: Listar aprovações pendentes
   */
  async getPendingApprovals(companyId: string): Promise<IRental[]> {
    return Rental.find({
      companyId,
      'pendingApprovals.status': 'pending',
    })
      .populate('customerId', 'name cpfCnpj')
      .populate('pendingApprovals.requestedBy', 'name email')
      .sort({ createdAt: -1 });
  }

  /**
   * NOVO: Aplicar desconto (com aprovação se necessário)
   */
  async applyDiscount(
    companyId: string,
    rentalId: string,
    discount: number,
    discountReason: string,
    userId: string,
    isAdmin: boolean = false
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    const subtotal = rental.pricing.subtotal;
    const discountPercent = (discount / subtotal) * 100;

    // Se desconto > 10% ou não for admin, requer aprovação
    if (discountPercent > 10 && !isAdmin) {
      return this.requestApproval(
        companyId,
        rentalId,
        'discount',
        {
          discount,
          reason: discountReason,
          previousValue: rental.pricing.discount.toString(),
          newValue: discount.toString(),
        },
        userId,
        `Desconto de ${discountPercent.toFixed(2)}% solicitado`
      );
    }

    // Aplicar desconto diretamente se admin ou <= 10%
    rental.pricing.discount = discount;
    rental.pricing.discountReason = discountReason;
    rental.pricing.discountApprovedBy = isAdmin ? new mongoose.Types.ObjectId(userId) : undefined;
    rental.pricing.total = subtotal - discount + rental.pricing.lateFee;

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      'discount',
      rental.pricing.discount.toString(),
      discount.toString(),
      userId,
      discountReason
    );

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Alterar tipo de aluguel (com aprovação se necessário)
   */
  async changeRentalType(
    companyId: string,
    rentalId: string,
    itemIndex: number,
    newRentalType: RentalType,
    userId: string,
    isAdmin: boolean = false
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (itemIndex < 0 || itemIndex >= rental.items.length) {
      throw new Error('Item index out of range');
    }

    const item = rental.items[itemIndex];
    const previousRentalType = item.rentalType || 'daily';

    // Se não for admin, requer aprovação
    if (!isAdmin) {
      return this.requestApproval(
        companyId,
        rentalId,
        'rental_type_change',
        {
          itemIndex,
          itemId: item.itemId.toString(),
          previousRentalType,
          newRentalType,
          previousValue: previousRentalType,
          newValue: newRentalType,
        },
        userId,
        `Alteração de tipo de aluguel de ${previousRentalType} para ${newRentalType}`
      );
    }

    // Aplicar alteração diretamente se admin
    item.rentalType = newRentalType;

    // Recalcular preço do item seria necessário aqui
    // (precisa buscar o item do inventário)

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      'rental_type_change',
      previousRentalType,
      newRentalType,
      userId,
      `Alterado por admin`
    );

    await rental.save();
    return rental;
  }
}

export const rentalService = new RentalService();
