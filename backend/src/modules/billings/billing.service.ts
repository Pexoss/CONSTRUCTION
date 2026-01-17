import { Billing } from './billing.model';
import { Rental } from '../rentals/rental.model';
import { IBilling, IBillingCalculation, IBillingEarlyReturn, RentalType } from './billing.types';
import mongoose from 'mongoose';

/**
 * Calcula os períodos de aluguel baseado nas datas
 * @param pickupDate Data de retirada
 * @param returnDate Data de devolução
 * @param rentalType Tipo de aluguel (daily, weekly, biweekly, monthly)
 * @returns Objeto com períodos completos, dias extras e se deve cobrar período extra
 */
export function calculateBillingPeriod(
  pickupDate: Date,
  returnDate: Date,
  rentalType: RentalType
): {
  periodsCompleted: number;
  extraDays: number;
  totalPeriods: number;
  chargeExtraPeriod: boolean;
} {
  const periodDays: Record<RentalType, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
  };

  const periodLength = periodDays[rentalType];
  const daysPassed = Math.ceil((returnDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24));
  const periodsCompleted = Math.floor(daysPassed / periodLength);
  const extraDays = daysPassed % periodLength;

  // Se tem dias extras, cobra mais um período completo
  const chargeExtraPeriod = extraDays > 0;
  const totalPeriods = chargeExtraPeriod ? periodsCompleted + 1 : periodsCompleted;

  return {
    periodsCompleted,
    extraDays,
    totalPeriods,
    chargeExtraPeriod,
  };
}

class BillingService {
  /**
   * Cria um fechamento de aluguel
   */
  async createBilling(
    companyId: string,
    rentalId: string,
    returnDate: Date,
    userId: string,
    discount?: number,
    discountReason?: string
  ): Promise<IBilling> {
    // Buscar o aluguel
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    })
      .populate('items.itemId')
      .populate('customerId');

    if (!rental) {
      throw new Error('Rental not found');
    }

    if (rental.status === 'completed' || rental.status === 'cancelled') {
      throw new Error('Rental is already completed or cancelled');
    }

    // Determinar tipo de aluguel (usar o primeiro item como referência, ou default daily)
    const rentalType: RentalType = rental.items[0]?.rentalType || 'daily';

    // Calcular período
    const pickupDate = rental.dates.pickupActual || rental.dates.pickupScheduled;
    const periodCalculation = calculateBillingPeriod(pickupDate, returnDate, rentalType);

    // Calcular valores dos equipamentos
    let equipmentSubtotal = 0;
    const billingItems = rental.items.map((item) => {
      const itemData = item.itemId as any;
      const periodsCharged = periodCalculation.totalPeriods;
      const subtotal = item.unitPrice * item.quantity * periodsCharged;
      equipmentSubtotal += subtotal;

      return {
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        periodsCharged,
        subtotal,
      };
    });

    // Calcular valores dos serviços
    let servicesSubtotal = 0;
    const billingServices = (rental.services || []).map((service) => {
      servicesSubtotal += service.subtotal;
      return {
        description: service.description,
        price: service.price,
        quantity: service.quantity,
        subtotal: service.subtotal,
      };
    });

    // Calcular desconto
    const appliedDiscount = discount || 0;
    const subtotal = equipmentSubtotal + servicesSubtotal;
    const total = subtotal - appliedDiscount + (rental.pricing.lateFee || 0);

    // Verificar se houve entrega antecipada
    const scheduledReturn = rental.dates.returnScheduled;
    const isEarly = returnDate < scheduledReturn;
    let earlyReturn: IBillingEarlyReturn | undefined;
    if (isEarly) {
      const daysSaved = Math.ceil((scheduledReturn.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24));
      // Desconto de 10% por dia economizado (máximo 30%)
      const discountPercent = Math.min(daysSaved * 0.1, 0.3);
      const earlyDiscount = subtotal * discountPercent;
      earlyReturn = {
        isEarly: true,
        daysSaved,
        discountApplied: earlyDiscount,
      };
      // Aplicar desconto adicional de entrega antecipada
      // (será aprovado por admin se necessário)
    }

    // Criar cálculo
    const calculation: IBillingCalculation = {
      baseRate: rental.items[0]?.unitPrice || 0,
      periodsCompleted: periodCalculation.periodsCompleted,
      extraDays: periodCalculation.extraDays,
      chargeExtraPeriod: periodCalculation.chargeExtraPeriod,
      baseAmount: equipmentSubtotal,
      servicesAmount: servicesSubtotal,
      subtotal,
      discount: appliedDiscount,
      discountReason,
      total,
    };

    // Verificar se precisa de aprovação (desconto > 10% ou entrega antecipada)
    const approvalRequired = appliedDiscount > subtotal * 0.1 || (isEarly && earlyReturn ? earlyReturn.discountApplied > 0 : false);

    // Criar fechamento
    const billing = await Billing.create({
      companyId,
      rentalId,
      customerId: rental.customerId,
      billingDate: new Date(),
      periodStart: pickupDate,
      periodEnd: returnDate,
      rentalType,
      calculation,
      earlyReturn,
      items: billingItems,
      services: billingServices,
      status: approvalRequired ? 'pending_approval' : 'approved',
      approvalRequired,
      requestedBy: userId,
      notes: rental.notes,
    });

    return billing;
  }

  /**
   * Aprova um fechamento pendente
   */
  async approveBilling(
    companyId: string,
    billingId: string,
    userId: string,
    notes?: string
  ): Promise<IBilling> {
    const billing = await Billing.findOne({
      _id: billingId,
      companyId,
    });

    if (!billing) {
      throw new Error('Billing not found');
    }

    if (billing.status !== 'pending_approval') {
      throw new Error('Billing is not pending approval');
    }

    billing.status = 'approved';
    billing.approvedBy = new mongoose.Types.ObjectId(userId);
    billing.approvalDate = new Date();
    billing.approvalNotes = notes;

    await billing.save();

    return billing;
  }

  /**
   * Rejeita um fechamento pendente
   */
  async rejectBilling(
    companyId: string,
    billingId: string,
    userId: string,
    notes: string
  ): Promise<IBilling> {
    const billing = await Billing.findOne({
      _id: billingId,
      companyId,
    });

    if (!billing) {
      throw new Error('Billing not found');
    }

    if (billing.status !== 'pending_approval') {
      throw new Error('Billing is not pending approval');
    }

    billing.status = 'cancelled';
    billing.approvedBy = new mongoose.Types.ObjectId(userId);
    billing.approvalDate = new Date();
    billing.approvalNotes = notes;

    await billing.save();

    return billing;
  }

  /**
   * Marca fechamento como pago
   */
  async markAsPaid(
    companyId: string,
    billingId: string,
    paymentMethod: string,
    paymentDate?: Date
  ): Promise<IBilling> {
    const billing = await Billing.findOne({
      _id: billingId,
      companyId,
    });

    if (!billing) {
      throw new Error('Billing not found');
    }

    if (billing.status !== 'approved') {
      throw new Error('Billing must be approved before marking as paid');
    }

    billing.status = 'paid';
    billing.paymentMethod = paymentMethod;
    billing.paymentDate = paymentDate || new Date();

    await billing.save();

    return billing;
  }

  /**
   * Lista fechamentos com filtros
   */
  async getBillings(
    companyId: string,
    filters: {
      rentalId?: string;
      customerId?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ billings: IBilling[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.rentalId) {
      query.rentalId = filters.rentalId;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      query.billingDate = {};
      if (filters.startDate) {
        query.billingDate.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.billingDate.$lte = filters.endDate;
      }
    }

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const [billings, total] = await Promise.all([
      Billing.find(query)
        .populate('rentalId')
        .populate('customerId')
        .populate('requestedBy')
        .populate('approvedBy')
        .sort({ billingDate: -1 })
        .skip(skip)
        .limit(limit),
      Billing.countDocuments(query),
    ]);

    return {
      billings,
      total,
      page,
      limit,
    };
  }

  /**
   * Obtém um fechamento por ID
   */
  async getBillingById(companyId: string, billingId: string): Promise<IBilling | null> {
    return Billing.findOne({
      _id: billingId,
      companyId,
    })
      .populate('rentalId')
      .populate('customerId')
      .populate('requestedBy')
      .populate('approvedBy');
  }

  /**
   * Lista fechamentos pendentes de aprovação
   */
  async getPendingApprovals(companyId: string): Promise<IBilling[]> {
    return Billing.find({
      companyId,
      status: 'pending_approval',
    })
      .populate('rentalId')
      .populate('customerId')
      .populate('requestedBy')
      .sort({ billingDate: -1 });
  }
}

export default new BillingService();
