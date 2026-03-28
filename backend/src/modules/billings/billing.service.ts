import { Billing } from './billing.model';
import { Rental } from '../rentals/rental.model';
import { IBilling, IBillingCalculation, IBillingEarlyReturn, RentalType, BillingStatus } from './billing.types';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';

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
  const diffDays = Math.ceil(
    (returnDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysPassed = Math.max(1, diffDays);
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

function getPeriodLengthDays(rentalType: RentalType): number {
  const periodDays: Record<RentalType, number> = {
    daily: 1,
    weekly: 7,
    biweekly: 15,
    monthly: 30,
  };

  return periodDays[rentalType];
}

function addPeriod(date: Date, rentalType: RentalType): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + getPeriodLengthDays(rentalType));
  return next;
}

class BillingService {
  private async buildBillingItems(
    rental: any,
    rentalType: RentalType,
    periodsCharged: number,
    targetEquipmentSubtotal?: number
  ): Promise<{ items: any[]; equipmentSubtotal: number }> {
    const periodLength = getPeriodLengthDays(rentalType);
    const contractedDays = rental.pricing?.contractedDays || periodLength;
    const contractedPeriods = Math.max(1, Math.ceil(contractedDays / periodLength));

    const baseEquipmentSubtotal =
      rental.pricing?.originalEquipmentSubtotal || rental.pricing?.equipmentSubtotal || 0;
    const scaleFactor =
      targetEquipmentSubtotal && baseEquipmentSubtotal > 0
        ? targetEquipmentSubtotal / baseEquipmentSubtotal
        : 1;

    let equipmentSubtotal = 0;
    const billingItems = rental.items.map((item: any) => {
      const unitPricePerPeriod = (item.unitPrice / contractedPeriods) * scaleFactor;
      const subtotal = unitPricePerPeriod * item.quantity * periodsCharged;
      equipmentSubtotal += subtotal;

      return {
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice: Number(unitPricePerPeriod.toFixed(2)),
        periodsCharged,
        subtotal: Number(subtotal.toFixed(2)),
      };
    });

    return { items: billingItems, equipmentSubtotal: Number(equipmentSubtotal.toFixed(2)) };
  }

  private buildBillingServices(rental: any, includeServices: boolean): { services: any[]; servicesSubtotal: number } {
    if (!includeServices) {
      return { services: [], servicesSubtotal: 0 };
    }

    let servicesSubtotal = 0;
    const billingServices = (rental.services || []).map((service: any) => {
      servicesSubtotal += service.subtotal;
      return {
        description: service.description,
        price: service.price,
        quantity: service.quantity,
        subtotal: service.subtotal,
      };
    });

    return { services: billingServices, servicesSubtotal };
  }

  async createPeriodicBilling(
    companyId: string,
    rentalId: string,
    periodStart: Date,
    periodEnd: Date,
    userId: string,
    options?: {
      includeServices?: boolean;
      notes?: string;
      targetEquipmentSubtotal?: number;
      totalOverride?: number;
      discount?: number;
      discountReason?: string;
      status?: BillingStatus;
    }
  ): Promise<IBilling> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate('items.itemId')
      .populate('customerId');

    if (!rental) {
      throw new Error('Rental not found');
    }

    const rentalType: RentalType =
      rental.dates.billingCycle || rental.items[0]?.rentalType || 'daily';

    const periodCalculation = calculateBillingPeriod(periodStart, periodEnd, rentalType);
    const periodsCharged = Math.max(1, periodCalculation.totalPeriods);

    const { items, equipmentSubtotal } = await this.buildBillingItems(
      rental,
      rentalType,
      periodsCharged,
      options?.targetEquipmentSubtotal
    );

    const { services, servicesSubtotal } = this.buildBillingServices(
      rental,
      !!options?.includeServices
    );

    const subtotal = equipmentSubtotal + servicesSubtotal;
    const appliedDiscount = options?.discount ?? 0;
    const total =
      options?.totalOverride !== undefined
        ? options.totalOverride
        : subtotal - appliedDiscount + (rental.pricing?.lateFee || 0);

    const calculation: IBillingCalculation = {
      baseRate: items[0]?.unitPrice || 0,
      periodsCompleted: periodCalculation.periodsCompleted,
      extraDays: periodCalculation.extraDays,
      chargeExtraPeriod: periodCalculation.chargeExtraPeriod,
      baseAmount: equipmentSubtotal,
      servicesAmount: servicesSubtotal,
      subtotal,
      discount: appliedDiscount,
      discountReason: options?.discountReason,
      total,
    };

    const billing = await Billing.create({
      companyId,
      rentalId,
      customerId: rental.customerId,
      billingDate: new Date(),
      periodStart,
      periodEnd,
      rentalType,
      calculation,
      items,
      services,
      status: options?.status || 'approved',
      approvalRequired: false,
      requestedBy: userId,
      notes: options?.notes,
    });

    return billing;
  }

  async createPeriodicBillingForItem(
    companyId: string,
    rental: any,
    item: any,
    periodStart: Date,
    periodEnd: Date,
    userId: string,
    options?: {
      includeServices?: boolean;
      notes?: string;
      discount?: number;
      discountReason?: string;
      status?: BillingStatus;
    }
  ): Promise<IBilling> {
    if (!rental) {
      throw new Error('Rental not found');
    }

    const rentalType: RentalType = item.rentalType || 'daily';
    const periodCalculation = calculateBillingPeriod(periodStart, periodEnd, rentalType);
    const periodsCharged = Math.max(1, periodCalculation.totalPeriods);

    const itemSubtotal = item.unitPrice * item.quantity * periodsCharged;
    const items = [
      {
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        periodsCharged,
        subtotal: Number(itemSubtotal.toFixed(2)),
      },
    ];

    const { services, servicesSubtotal } = this.buildBillingServices(
      rental,
      !!options?.includeServices
    );

    const equipmentSubtotal = Number(itemSubtotal.toFixed(2));
    const subtotal = equipmentSubtotal + servicesSubtotal;
    const appliedDiscount = options?.discount ?? 0;
    const total = subtotal - appliedDiscount + (rental.pricing?.lateFee || 0);

    const calculation: IBillingCalculation = {
      baseRate: item.unitPrice || 0,
      periodsCompleted: periodCalculation.periodsCompleted,
      extraDays: periodCalculation.extraDays,
      chargeExtraPeriod: periodCalculation.chargeExtraPeriod,
      baseAmount: equipmentSubtotal,
      servicesAmount: servicesSubtotal,
      subtotal,
      discount: appliedDiscount,
      discountReason: options?.discountReason,
      total,
    };

    const billing = await Billing.create({
      companyId,
      rentalId: rental._id,
      customerId: rental.customerId,
      billingDate: new Date(),
      periodStart,
      periodEnd,
      rentalType,
      calculation,
      items,
      services,
      status: options?.status || 'approved',
      approvalRequired: false,
      requestedBy: userId,
      notes: options?.notes,
    });

    return billing;
  }

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
    paymentDate?: Date,
    discount?: number,
    discountReason?: string
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

    const appliedDiscount = discount ?? billing.calculation?.discount ?? 0;
    billing.calculation.discount = appliedDiscount;
    billing.calculation.discountReason = discountReason;
    billing.calculation.total = Math.max(
      0,
      billing.calculation.subtotal - appliedDiscount
    );
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
        .populate('items.itemId')
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
   * Generate PDF for billing
   */
  async generateBillingPDF(companyId: string, billingId: string): Promise<Buffer> {
    const billing = await Billing.findOne({ _id: billingId, companyId })
      .populate('customerId')
      .populate('rentalId')
      .populate('companyId')
      .populate('items.itemId');

    if (!billing) {
      throw new Error('Billing not found');
    }

    const company = billing.companyId as any;
    const customer = billing.customerId as any;
    const rental = billing.rentalId as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('FECHAMENTO', { align: 'center' });
      doc.moveDown();

      // Company Info
      doc.fontSize(12).text(company.name || 'Empresa', { align: 'left' });
      if (company.cnpj) doc.text(`CNPJ: ${company.cnpj}`);
      if (company.email) doc.text(`Email: ${company.email}`);
      if (company.phone) doc.text(`Telefone: ${company.phone}`);
      doc.moveDown();

      // Billing Info
      doc.fontSize(14).text(`Fechamento Nº: ${billing.billingNumber}`);
      doc.text(`Data de Emissão: ${new Date(billing.billingDate).toLocaleDateString('pt-BR')}`);
      doc.text(`Período: ${new Date(billing.periodStart).toLocaleDateString('pt-BR')} até ${new Date(billing.periodEnd).toLocaleDateString('pt-BR')}`);
      if (rental?.rentalNumber) {
        doc.text(`Aluguel: ${rental.rentalNumber}`);
      }
      doc.moveDown();

      // Customer Info
      doc.fontSize(12).text('Cliente:', { underline: true });
      doc.text(customer.name || 'Cliente');
      if (customer.cpfCnpj) doc.text(`CPF/CNPJ: ${customer.cpfCnpj}`);
      if (customer.email) doc.text(`Email: ${customer.email}`);
      if (customer.phone) doc.text(`Telefone: ${customer.phone}`);
      const customerAddresses = customer?.addresses || [];
      const preferredAddress =
        customerAddresses.find((addr: any) => addr.type === 'billing') ||
        customerAddresses.find((addr: any) => addr.type === 'main') ||
        customerAddresses[0];
      if (preferredAddress) {
        const addressLine = [
          preferredAddress.street,
          preferredAddress.number ? `, ${preferredAddress.number}` : '',
        ].join('');
        const complement = preferredAddress.complement
          ? ` - ${preferredAddress.complement}`
          : '';
        const neighborhood = preferredAddress.neighborhood
          ? ` - ${preferredAddress.neighborhood}`
          : '';
        doc.text(`Endereço: ${addressLine}${complement}${neighborhood}`);
        doc.text(
          `${preferredAddress.city || ''}/${preferredAddress.state || ''} - ${preferredAddress.zipCode || ''}`
        );
      }
      doc.moveDown();

      // Items Table
      doc.fontSize(12).text('Equipamentos:', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const itemHeight = 20;
      let y = tableTop;

      // Table Header
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Descrição', 50, y);
      doc.text('Qtd', 300, y);
      doc.text('Valor Unit.', 350, y, { width: 80, align: 'right' });
      doc.text('Total', 450, y, { width: 80, align: 'right' });
      y += itemHeight;

      // Table Items
      doc.font('Helvetica');
      billing.items.forEach((item: any) => {
        const itemData = item.itemId as any;
        const description =
          itemData && typeof itemData === 'object' && 'name' in itemData
            ? itemData.name
            : 'Item';
        doc.text(description, 50, y, { width: 240 });
        doc.text(item.quantity.toString(), 300, y);
        doc.text(`R$ ${item.unitPrice.toFixed(2)}`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${item.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      });

      // Services
      if (billing.services && billing.services.length > 0) {
        y += 10;
        doc.font('Helvetica-Bold').fontSize(10).text('Serviços:', 50, y);
        y += itemHeight;
        doc.font('Helvetica');
        billing.services.forEach((service: any) => {
          doc.text(service.description || 'Serviço', 50, y, { width: 240 });
          doc.text(String(service.quantity || 1), 300, y);
          doc.text(`R$ ${service.price.toFixed(2)}`, 350, y, { width: 80, align: 'right' });
          doc.text(`R$ ${service.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
          y += itemHeight;
        });
      }

      // Totals
      y += 10;
      doc.font('Helvetica');
      doc.text(`Subtotal:`, 350, y, { width: 80, align: 'right' });
      doc.text(`R$ ${billing.calculation.subtotal.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
      y += itemHeight;

      if (billing.calculation.discount && billing.calculation.discount > 0) {
        doc.text(`Desconto:`, 350, y, { width: 80, align: 'right' });
        doc.text(`R$ ${billing.calculation.discount.toFixed(2)}`, 450, y, { width: 80, align: 'right' });
        y += itemHeight;
      }

      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total:`, 350, y, { width: 80, align: 'right' });
      doc.text(`R$ ${billing.calculation.total.toFixed(2)}`, 450, y, { width: 80, align: 'right' });

      if (billing.notes) {
        y += itemHeight * 2;
        doc.font('Helvetica').fontSize(10);
        doc.text('Observações:', 50, y);
        doc.text(billing.notes, 50, y + 15, { width: 500 });
      }

      doc.end();
    });
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
