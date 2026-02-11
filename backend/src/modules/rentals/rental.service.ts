import { Rental } from './rental.model';
import { Item } from '../inventory/item.model';
import { ItemMovement } from '../inventory/itemMovement.model';
import { IRental, RentalStatus, IRentalItem, IRentalPricing, IRentalService, IRentalWorkAddress, IRentalChangeHistory, IRentalPendingApproval, RentalType, RentalDetails, UpdateRentalStatusResponse } from './rental.types';
import mongoose, { Error } from 'mongoose';
import { ICustomer } from '../customers/customer.types';
import { Customer } from '../customers/customer.model';
import { RoleType } from '@/shared/constants/roles';
import { canApplyDiscount, canUpdateRentalStatus } from '../../helpers/UserPermission';
import { notificationService } from '../notification/notification.service'
import { User } from '../users/user.model';
import { NOTFOUND } from 'dns';
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
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (days <= 0) return 0;

    if (!rentalType) {
      throw new Error('RentalType é obrigatório para cálculo do aluguel');
    }

    switch (rentalType) {
      case 'daily':
        return days * dailyRate;

      case 'weekly':
        if (!weeklyRate) {
          throw new Error('WeeklyRate não configurado');
        }
        return Math.ceil(days / 7) * weeklyRate;

      case 'biweekly':
        if (!biweeklyRate) {
          throw new Error('BiweeklyRate não configurado');
        }
        return Math.ceil(days / 15) * biweeklyRate;

      case 'monthly':
        if (!monthlyRate) {
          throw new Error('MonthlyRate não configurado');
        }
        return Math.ceil(days / 30) * monthlyRate;

      default:
        throw new Error(`RentalType inválido: ${rentalType}`);
    }
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
   * 
   * Create retalNumber
   */
  async generateRentalNumber(companyId: string): Promise<string> {
    const RentalModel = mongoose.model<IRental>('Rental');
    const count = await RentalModel.countDocuments({ companyId });
    const rentalNumber = `ALGUEL-${companyId.toString().slice(-6)}-${String(count + 1).padStart(6, '0')}`; //pega os 6 ulimos dígitos do id da empresa - contador
    return rentalNumber;
  }

  /**
   * Create a new rental/reservation
   */
  async createRental(companyId: string, data: any, userId: string): Promise<IRental> {
    //rentailNumber gera automaticamente ao registrar aluguel
    const rentalNumber = await this.generateRentalNumber(companyId);
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('Usuário não encontrado');
    }
    //verifica se o usuário um superadmin ou admin
    if (data.pricing?.discount && !canApplyDiscount(user.role as RoleType)) {
      throw new Error('Somente o admin pode aplicar desconto');
    }

    // Validate items availability
    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      if (inventoryItem.trackingType === 'unit') {
        if (!item.unitId) {
          throw new Error(`Item ${inventoryItem.name} is unit-based. Please specify unitId.`);
        }

        if (item.quantity && item.quantity !== 1) {
          throw new Error(`Unit-based item ${inventoryItem.name} must have quantity 1`);
        }

        const unit = inventoryItem.units?.find((u) => u.unitId === item.unitId);
        if (!unit) {
          throw new Error(`Unit ${item.unitId} not found for item ${inventoryItem.name}`);
        }

        if (unit.status !== 'available') {
          throw new Error(`Unit ${item.unitId} is not available for rental`);
        }
      } else {
        // Quantity-based: check available stock
        const available = inventoryItem.quantity.available || 0;

        if (available < item.quantity) {
          throw new Error(`Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${item.quantity}`);
        }
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

    const lateFee = 0;

    const pickupDate = new Date(data.dates.pickupScheduled);
    const returnDate = new Date(data.dates.returnScheduled);

    const diffTime = returnDate.getTime() - pickupDate.getTime();

    const contractedDays = Math.max(
      1,
      Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    );

    const pricing: IRentalPricing = {
      equipmentSubtotal,
      originalEquipmentSubtotal: equipmentSubtotal,
      contractedDays,
      servicesSubtotal,

      subtotal: totalSubtotal,
      deposit: totalDeposit,
      discount,
      discountReason: data.pricing?.discountReason,
      discountApprovedBy: data.pricing?.discountApprovedBy
        ? new mongoose.Types.ObjectId(data.pricing.discountApprovedBy)
        : undefined,
      lateFee,
      total: totalSubtotal + totalDeposit - discount + lateFee,
      usedDays: 0,
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
      rentalNumber,
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
      await this.updateItemQuantityForRental(
        companyId,
        item.itemId,
        item.quantity,
        'reserve',
        userId,
        rental._id,
        item.unitId,
        data.customerId
      );
    }

    return rental;
  }

  async getClosePreview(rentalId: string, companyId: string) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw new Error('Aluguel não encontrado');
    }

    const startDate = rental.dates.pickupActual ?? rental.dates.pickupScheduled;
    const endDate = rental.dates.returnActual ?? new Date();
    const diffInMs = endDate.getTime() - startDate.getTime();
    const usedDays = Math.max(1, Math.ceil(diffInMs / (1000 * 60 * 60 * 24)));

    // Dias contratados e tipo de contrato
    let contractedDays = rental.pricing.contractedDays;
    if (!contractedDays) {
      // fallback: calcula diferença entre datas agendadas
      const scheduledStart = rental.dates.pickupScheduled;
      const scheduledEnd = rental.dates.returnScheduled;
      const diff = new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime();
      contractedDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    // Tipo de contrato: pega do primeiro item ou do ciclo de faturamento
    const rentalType = rental.dates.billingCycle || rental.items[0]?.rentalType || 'daily';

    const originalTotal = rental.pricing.total;

    // Calcular valor proporcional de cada item
    let recalculatedEquipment = 0;
    for (const item of rental.items) {
      const { unitPrice, rentalType, quantity } = item;
      let proportional = 0;
      if (rentalType === 'weekly') {
        proportional = (unitPrice / 7) * usedDays;
      } else if (rentalType === 'biweekly') {
        proportional = (unitPrice / 15) * usedDays;
      } else if (rentalType === 'monthly') {
        proportional = (unitPrice / 30) * usedDays;
      } else {
        proportional = (unitPrice / 1) * usedDays; // diária
      }
      recalculatedEquipment += proportional * quantity;
    }

    const recalculatedTotal =
      recalculatedEquipment +
      (rental.pricing.servicesSubtotal || 0) +
      (rental.pricing.deposit || 0) -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    return {
      originalTotal,
      recalculatedTotal,
      usedDays,
      contractedDays,
      rentalType,
    };
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

  private calculateFinalPricing(rental: any) {
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;

    const returnDate = new Date();

    const diffMs = returnDate.getTime() - pickupDate.getTime();
    const usedDays = Math.max(
      1,
      Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    );

    // Recalcular o subtotal dos equipamentos baseado nos dias utilizados
    let recalculatedEquipmentSubtotal = 0;
    for (const item of rental.items) {
      const { unitPrice, rentalType, quantity } = item;
      let proportional = 0;
      
      if (rentalType === 'weekly') {
        proportional = (unitPrice / 7) * usedDays;
      } else if (rentalType === 'biweekly') {
        proportional = (unitPrice / 15) * usedDays;
      } else if (rentalType === 'monthly') {
        proportional = (unitPrice / 30) * usedDays;
      } else {
        // daily - sem divisão necessária
        proportional = unitPrice * usedDays;
      }
      
      recalculatedEquipmentSubtotal += proportional * quantity;
    }

    const recalculatedTotal =
      recalculatedEquipmentSubtotal +
      (rental.pricing.servicesSubtotal || 0) +
      (rental.pricing.deposit || 0) -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    return {
      usedDays,
      recalculatedEquipmentSubtotal,
      recalculatedTotal,
      returnDate
    };
  }

  /**
   * Update rental status
   */
  async updateRentalStatus(
    companyId: string,
    rentalId: string,
    status: RentalStatus,
    userId: string
  ): Promise<UpdateRentalStatusResponse> {

    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error('Rental not found');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    // funcionário → cria solicitação
    if (!canUpdateRentalStatus(user.role as RoleType)) {
      await notificationService.notifyStatusChangeRequest({
        title: "Solicitação de alteração de status",
        message: `O funcionário ${user.name} solicitou alterar o status do aluguel para ${status}`,
        companyId,
        createdByUserId: userId,
        referenceId: rentalId,
        requestedStatus: status,
      });

      return {
        success: true,
        message: "Solicitação enviada para aprovação",
        data: rental,
        requiresApproval: true,
      };
    }
    const oldStatus = rental.status;

    // trava mudança inválida
    if (oldStatus === status) {
      return {
        success: true,
        message: "Status já estava definido",
        data: rental
      };
    }

    rental.status = status;

    /**
     * RESERVED → ACTIVE
     */
    if (oldStatus === 'reserved' && status === 'active') {
      rental.dates.pickupActual = new Date();

      for (const item of rental.items) {
        await this.updateItemQuantityForRental(
          companyId,
          item.itemId,
          item.quantity,
          'activate',
          userId,
          rental._id,
          item.unitId,
          rental.customerId.toString()
        );
      }
    }

    /**
     * ACTIVE / OVERDUE → COMPLETED
     */
    if (
      (oldStatus === 'active' || oldStatus === 'overdue') &&
      status === 'completed'
    ) {
      const {
        usedDays,
        recalculatedEquipmentSubtotal,
        recalculatedTotal,
        returnDate
      } = this.calculateFinalPricing(rental);

      rental.dates.returnActual = returnDate;

      // guarda histórico financeiro
      rental.pricing.originalEquipmentSubtotal = rental.pricing.equipmentSubtotal;
      rental.pricing.equipmentSubtotal = Number(recalculatedEquipmentSubtotal.toFixed(2));
      rental.pricing.subtotal = Number((rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal).toFixed(2));
      rental.pricing.total = Number((rental.pricing.subtotal + rental.pricing.deposit - rental.pricing.discount + rental.pricing.lateFee).toFixed(2));

      rental.pricing.usedDays = usedDays;

      for (const item of rental.items) {
        await this.updateItemQuantityForRental(
          companyId,
          item.itemId,
          item.quantity,
          'return',
          userId,
          rental._id,
          item.unitId,
          rental.customerId.toString()
        );
      }
    }

    /**
     * RESERVED → CANCELLED
     */
    if (oldStatus === 'reserved' && status === 'cancelled') {
      for (const item of rental.items) {
        await this.updateItemQuantityForRental(
          companyId,
          item.itemId,
          item.quantity,
          'cancel',
          userId,
          rental._id,
          item.unitId,
          rental.customerId.toString()
        );
      }
    }

    await rental.save();

    return {
      success: true,
      message: "Status alterado com sucesso",
      data: rental
    };
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
    expiringSoon: IRental[];
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

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const sevenDaysFromNow = new Date(todayEnd);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // 🔴 Contratos vencidos
    const expiredQuery = {
      companyId,
      status: { $in: ['active', 'reserved'] },
      'dates.returnScheduled': {
        $exists: true,
        $lt: todayStart,
      },
    };

    // 🟡 Vencem hoje
    const expiringTodayQuery = {
      companyId,
      status: { $in: ['active', 'reserved'] },
      'dates.returnScheduled': {
        $exists: true,
        $gte: todayStart,
        $lt: todayEnd,
      },
    };

    // 🟠 Vencem em até 7 dias
    const expiringSoonQuery = {
      companyId,
      status: { $in: ['active', 'reserved'] },
      'dates.returnScheduled': {
        $exists: true,
        $gt: todayEnd,
        $lte: sevenDaysFromNow,
      },
    };

    // 🟢 Ativos
    const activeQuery = {
      companyId,
      status: 'active',
    };

    const [expired, expiringSoon, expiringToday, activeCount] = await Promise.all([
      Rental.find(expiredQuery)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku')
        .populate('workAddress')
        .sort({ 'dates.returnScheduled': 1 })
        .limit(50),

      Rental.find(expiringSoonQuery)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku')
        .populate('workAddress')
        .sort({ 'dates.returnScheduled': 1 })
        .limit(50),

      Rental.find(expiringTodayQuery)
        .populate('customerId', 'name cpfCnpj email phone')
        .populate('items.itemId', 'name sku')
        .populate('workAddress')
        .sort({ 'dates.returnScheduled': 1 }),

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
    rentalId: mongoose.Types.ObjectId,
    unitId?: string,
    customerId?: string
  ): Promise<void> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw new Error('Item not found');
    }

    // =========================
    // ITEM UNITÁRIO
    // =========================
    if (item.trackingType === 'unit') {
      if (!unitId) {
        console.warn('Unit action without unitId', { itemId, rentalId });
        return;
      }

      const unit = item.units?.find(u => u.unitId === unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      switch (action) {
        case 'reserve':
          if (unit.status !== 'available') {
            throw new Error(`Unit ${unit.unitId} is not available`);
          }
          unit.status = 'reserved';
          unit.currentRental = rentalId;
          unit.currentCustomer = customerId ? new mongoose.Types.ObjectId(customerId) : undefined;

          // Atualiza quantity também
          item.quantity.available -= 1;
          item.quantity.reserved += 1;
          break;

        case 'activate':
          if (unit.status !== 'reserved') {
            throw new Error(`Unit ${unit.unitId} is not reserved`);
          }
          unit.status = 'rented';

          item.quantity.reserved -= 1;
          item.quantity.rented += 1;
          break;

        case 'return':
          unit.status = 'available';
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;

          item.quantity.rented -= 1;
          item.quantity.available += 1;
          break;

        case 'cancel':
          unit.status = 'available';
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;

          item.quantity.reserved -= 1;
          item.quantity.available += 1;
          break;
      }

      // RECALCULA ESTOQUE PELOS STATUS DAS UNITS
      const units = item.units ?? [];

      item.quantity.total = units.length;
      item.quantity.available = units.filter(u => u.status === 'available').length;
      item.quantity.reserved = units.filter(u => u.status === 'reserved').length; // <-- aqui
      item.quantity.rented = units.filter(u => u.status === 'rented').length;
      item.quantity.maintenance = units.filter(u => u.status === 'maintenance').length;
      item.quantity.damaged = units.filter(u => u.status === 'damaged').length;

      await item.save();

      await ItemMovement.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        itemId,
        type: action === 'return' ? 'return' : 'rent',
        quantity: 1,
        referenceId: rentalId,
        notes: `Unit ${unit.unitId} ${action}`,
        createdBy: new mongoose.Types.ObjectId(userId),
      });

      return;
    }

    // =========================
    // ITEM QUANTITATIVO
    // =========================
    const previousQuantity = { ...item.quantity };

    switch (action) {
      case 'reserve':
        item.quantity.available -= quantity;
        item.quantity.reserved += quantity;
        break;

      case 'activate':
        item.quantity.reserved -= quantity;
        item.quantity.rented += quantity;
        break;

      case 'return':
        item.quantity.rented -= quantity;
        item.quantity.available += quantity;
        break;

      case 'cancel':
        break;
    }

    if (item.quantity.available < 0 || item.quantity.rented < 0) {
      throw new Error('Invalid quantity operation');
    }

    await item.save();

    await ItemMovement.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId,
      type: action === 'return' ? 'return' : 'rent',
      quantity,
      previousQuantity,
      newQuantity: item.quantity,
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