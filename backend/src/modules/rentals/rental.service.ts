import { Rental } from "./rental.model";
import { Item } from "../inventory/item.model";
import { ItemMovement } from "../inventory/itemMovement.model";
import {
  IRental,
  RentalStatus,
  IRentalItem,
  IRentalPricing,
  IRentalService,
  IRentalWorkAddress,
  IRentalChangeHistory,
  IRentalPendingApproval,
  RentalType,
  RentalDetails,
  UpdateRentalStatusResponse,
} from "./rental.types";
import mongoose, { Error } from "mongoose";
import { ICustomer } from "../customers/customer.types";
import { Customer } from "../customers/customer.model";
import { RoleType } from "@/shared/constants/roles";
import {
  canApplyDiscount,
  canUpdateRentalStatus,
} from "../../helpers/UserPermission";
import { notificationService } from "../notification/notification.service";
import { User } from "../users/user.model";
import billingService from "../billings/billing.service";
import { Billing } from "../billings/billing.model";
import { NOTFOUND } from "dns";
import PDFDocument from "pdfkit";
import { Invoice } from "../invoices/invoice.model";
import { invoiceService } from "../invoices/invoice.service";
class RentalService {
  private getPeriodLengthDays(rentalType: RentalType): number {
    const periodDays: Record<RentalType, number> = {
      daily: 1,
      weekly: 7,
      biweekly: 15,
      monthly: 30,
    };

    return periodDays[rentalType];
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  private addMonthsKeepingDay(date: Date, months: number): Date {
    const year = date.getFullYear();
    const month = date.getMonth() + months;
    const day = date.getDate();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const targetDay = Math.min(day, maxDay);
    return new Date(year, month, targetDay);
  }

  private getPricingEndDate(startDate: Date, rentalType: RentalType): Date {
    const normalizedStart = this.normalizeDate(startDate);
    switch (rentalType) {
      case "daily":
        return this.addDays(normalizedStart, 1);
      case "weekly":
        return this.addDays(normalizedStart, 7);
      case "biweekly":
        return this.addDays(normalizedStart, 15);
      case "monthly":
        return this.addMonthsKeepingDay(normalizedStart, 1);
      default:
        return this.addDays(normalizedStart, 1);
    }
  }

  private getPeriodEnd(startDate: Date, rentalType: RentalType): Date {
    const normalizedStart = this.normalizeDate(startDate);
    if (rentalType === "monthly") {
      const nextStart = this.addMonthsKeepingDay(normalizedStart, 1);
      return this.addDays(nextStart, -1);
    }

    return this.addDays(
      normalizedStart,
      this.getPeriodLengthDays(rentalType) - 1,
    );
  }

  private addPeriod(date: Date, rentalType: RentalType): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + this.getPeriodLengthDays(rentalType));
    return next;
  }
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
    rentalType?: RentalType,
  ): number {
    const days = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (days <= 0) return 0;

    if (!rentalType) {
      throw new Error("RentalType é obrigatório para cálculo do aluguel");
    }

    switch (rentalType) {
      case "daily":
        return days * dailyRate;

      case "weekly":
        if (!weeklyRate) {
          throw new Error("WeeklyRate não configurado");
        }
        return Math.ceil(days / 7) * weeklyRate;

      case "biweekly":
        if (!biweeklyRate) {
          throw new Error("BiweeklyRate não configurado");
        }
        return Math.ceil(days / 15) * biweeklyRate;

      case "monthly":
        if (!monthlyRate) {
          throw new Error("MonthlyRate não configurado");
        }
        return Math.ceil(days / 30) * monthlyRate;

      default:
        throw new Error(`RentalType inválido: ${rentalType}`);
    }
  }
  /**
   * Calculate late fee
   */
  private calculateLateFee(
    returnScheduled: Date,
    returnActual: Date,
    dailyRate: number,
    quantity: number,
  ): number {
    if (returnActual <= returnScheduled) {
      return 0;
    }

    const daysLate = Math.ceil(
      (returnActual.getTime() - returnScheduled.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    // Late fee is typically 1.5x the daily rate per day
    return daysLate * dailyRate * 1.5 * quantity;
  }

  /**
   *
   * Create retalNumber
   */
  async generateRentalNumber(companyId: string): Promise<string> {
    const RentalModel = mongoose.model<IRental>("Rental");
    const count = await RentalModel.countDocuments({ companyId });
    const rentalNumber = `ALGUEL-${companyId.toString().slice(-6)}-${String(count + 1).padStart(6, "0")}`; //pega os 6 ulimos dígitos do id da empresa - contador
    return rentalNumber;
  }

  //createRental revisado
  async createRental(
    companyId: string,
    data: any,
    userId: string,
  ): Promise<IRental> {
    const rentalNumber = await this.generateRentalNumber(companyId);
    const user = await User.findById(userId);
    if (!user) throw new Error("Usuário não encontrado");

    if (data.pricing?.discount && !canApplyDiscount(user.role as RoleType)) {
      throw new Error("Somente o admin pode aplicar desconto");
    }

    //Função para pegar tipo pelo item
    const getRentalTypeFromItem = (item: any): RentalType => {
      if (item.pricing?.monthlyRate) return "monthly";
      if (item.pricing?.biweeklyRate) return "biweekly";
      if (item.pricing?.weeklyRate) return "weekly";
      return "daily";
    };

    const calculateRentalPriceCorrect = (
      dailyRate = 0,
      weeklyRate = 0,
      biweeklyRate = 0,
      monthlyRate = 0,
      startDate: Date,
      endDate: Date,
      rentalType: RentalType,
    ) => {
      const diffTime = endDate.getTime() - startDate.getTime();
      if (diffTime <= 0) return 0;

      const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      switch (rentalType) {
        case "daily":
          return dailyRate * days;
        case "weekly": {
          const fullWeeks = Math.floor(days / 7);
          const extraDays = days % 7;
          return fullWeeks * (weeklyRate || dailyRate) + extraDays * dailyRate;
        }
        case "biweekly": {
          const fullWeeks = Math.floor(days / 15);
          const extraDays = days % 15;
          return fullWeeks * (weeklyRate || dailyRate) + extraDays * dailyRate;
        }
        case "monthly": {
          const fullMonths = Math.floor(days / 30);
          const extraDays = days % 30;
          return (
            fullMonths * (monthlyRate || dailyRate) + extraDays * dailyRate
          );
        }
        default:
          return 0;
      }
    };

    // Validar disponibilidade
    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) throw new Error(`Item ${item.itemId} não encontrado`);

      if (inventoryItem.trackingType === "unit") {
        if (!item.unitId)
          throw new Error(`Item ${inventoryItem.name} precisa de unitId`);

        const unit = inventoryItem.units?.find((u) => u.unitId === item.unitId);
        if (!unit || unit.status !== "available")
          throw new Error(`Unidade ${item.unitId} indisponível`);
      } else {
        const available = inventoryItem.quantity.available || 0;
        if (available < item.quantity) throw new Error(`Estoque insuficiente`);
      }
    }

    // 💰 Cálculo de preços
    const itemsWithPricing: IRentalItem[] = [];
    let equipmentSubtotal = 0;
    let totalDeposit = 0;

    const pickupDates: Date[] = [];
    const returnDates: Date[] = [];

    for (const item of data.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) continue;

      const rentalType = getRentalTypeFromItem(inventoryItem);
      const pickupScheduled = new Date(item.pickupScheduled);
      const returnScheduled = item.returnScheduled
        ? new Date(item.returnScheduled)
        : this.getPricingEndDate(pickupScheduled, rentalType);

      pickupDates.push(pickupScheduled);
      returnDates.push(returnScheduled);

      const unitPrice = calculateRentalPriceCorrect(
        inventoryItem.pricing.dailyRate,
        inventoryItem.pricing.weeklyRate,
        inventoryItem.pricing.biweeklyRate,
        inventoryItem.pricing.monthlyRate,
        pickupScheduled,
        returnScheduled,
        rentalType,
      );

      const subtotal = unitPrice * item.quantity;
      const deposit =
        (inventoryItem.pricing.depositAmount || 0) * item.quantity;

      itemsWithPricing.push({
        itemId: item.itemId,
        unitId: item.unitId,
        quantity: item.quantity,
        unitPrice,
        rentalType,
        pickupScheduled,
        returnScheduled,
        subtotal,
      });

      equipmentSubtotal += subtotal;
      totalDeposit += deposit;
    }

    // Serviços
    let servicesSubtotal = 0;
    const services: IRentalService[] = (data.services || []).map(
      (service: any) => {
        const quantity = service.quantity || 1;
        const subtotal = service.price * quantity;
        servicesSubtotal += subtotal;
        return {
          description: service.description,
          price: service.price,
          quantity,
          subtotal,
          category: service.category || "other",
          notes: service.notes,
        };
      },
    );

    const totalSubtotal = equipmentSubtotal + servicesSubtotal;
    const discount = data.pricing?.discount || 0;

    const minPickupDate = new Date(
      Math.min(...pickupDates.map((d) => d.getTime())),
    );
    const maxReturnDate = new Date(
      Math.max(...returnDates.map((d) => d.getTime())),
    );

    const diffTime = maxReturnDate.getTime() - minPickupDate.getTime();
    const contractedDays = Math.max(
      1,
      Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
    );

    const pricing: IRentalPricing = {
      equipmentSubtotal,
      originalEquipmentSubtotal: equipmentSubtotal,
      contractedDays,
      usedDays: 0,
      servicesSubtotal,
      subtotal: totalSubtotal,
      deposit: totalDeposit,
      discount,
      discountReason: data.pricing?.discountReason,
      discountApprovedBy: data.pricing?.discountApprovedBy
        ? new mongoose.Types.ObjectId(data.pricing.discountApprovedBy)
        : undefined,
      lateFee: 0,
      total: totalSubtotal - discount,
    };

    //Criar rental
    const rental = await Rental.create({
      companyId,
      customerId: data.customerId,
      rentalNumber,
      items: itemsWithPricing,
      services: services.length > 0 ? services : undefined,
      dates: {
        reservedAt: new Date(),
        pickupScheduled: minPickupDate,
        returnScheduled: maxReturnDate,
      },
      pricing,
      status: "reserved",
      notes: data.notes,
      createdBy: userId,
    });

    // Reservar unidades
    for (const item of data.items) {
      await this.updateItemQuantityForRental(
        companyId,
        item.itemId,
        item.quantity,
        "reserve",
        userId,
        rental._id,
        item.unitId,
        data.customerId,
      );
    }

    return rental;
  }
  async closeRental(companyId: string, rentalId: string, userId: string) {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    if (rental.status === "completed") {
      throw new Error("Aluguel já finalizado");
    }

    //Datas reais
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;
    const returnDate = new Date();

    rental.dates.returnActual = returnDate;

    //Dias utilizados
    const diffTime = returnDate.getTime() - pickupDate.getTime();

    const usedDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    let equipmentSubtotal = 0;
    let totalDeposit = 0;

    //Calcular por item
    for (const item of rental.items) {
      const inventoryItem = await Item.findById(item.itemId);

      if (!inventoryItem) continue;

      const rentalType = item.rentalType || "daily";

      let unitPrice = 0;

      switch (rentalType) {
        case "daily":
          unitPrice = (inventoryItem.pricing.dailyRate || 0) * usedDays;
          break;

        case "weekly":
          unitPrice =
            (inventoryItem.pricing.weeklyRate || 0) * Math.ceil(usedDays / 7);
          break;

        case "biweekly":
          unitPrice =
            (inventoryItem.pricing.biweeklyRate || 0) *
            Math.ceil(usedDays / 15);
          break;

        case "monthly":
          unitPrice =
            (inventoryItem.pricing.monthlyRate || 0) * Math.ceil(usedDays / 30);
          break;

        default:
          unitPrice = inventoryItem.pricing.dailyRate * usedDays;
      }

      const subtotal = unitPrice * item.quantity;
      const deposit =
        (inventoryItem.pricing.depositAmount || 0) * item.quantity;

      //Atualiza item
      item.unitPrice = unitPrice;
      item.subtotal = subtotal;

      equipmentSubtotal += subtotal;
      totalDeposit += deposit;
    }

    //Serviços
    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;

    const discount = rental.pricing.discount || 0;
    const lateFee = 0;

    //Total final
    const total = equipmentSubtotal + servicesSubtotal - discount + lateFee;

    //Atualiza pricing
    rental.pricing.equipmentSubtotal = equipmentSubtotal;
    rental.pricing.originalEquipmentSubtotal = equipmentSubtotal;
    rental.pricing.servicesSubtotal = servicesSubtotal;
    rental.pricing.subtotal = equipmentSubtotal + servicesSubtotal;
    rental.pricing.deposit = totalDeposit;
    rental.pricing.total = total;
    rental.pricing.usedDays = usedDays;
    rental.pricing.lateFee = lateFee;

    //Status
    await this.applyStatusChangeDirect(
      rental,
      rental.status,
      "completed",
      companyId,
      userId,
    );

    await rental.save();
    return rental;
  }

  async getClosePreview(rentalId: string, companyId: string) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw new Error("Aluguel não encontrado");
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
      const diff =
        new Date(scheduledEnd).getTime() - new Date(scheduledStart).getTime();
      contractedDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    // Tipo de contrato: pega do primeiro item ou do ciclo de faturamento
    const rentalType =
      rental.dates.billingCycle || rental.items[0]?.rentalType || "daily";

    const originalTotal = rental.pricing.total;

    // Calcular valor proporcional de cada item
    let recalculatedEquipment = 0;
    for (const item of rental.items) {
      const { unitPrice, rentalType, quantity } = item;
      let proportional = 0;
      if (rentalType === "weekly") {
        proportional = (unitPrice / 7) * usedDays;
      } else if (rentalType === "biweekly") {
        proportional = (unitPrice / 15) * usedDays;
      } else if (rentalType === "monthly") {
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

  async getClosePreviewItem(
    rentalId: string,
    itemId: string,
    companyId: string,
    unitId?: string,
  ) {
    const rental = await Rental.findOne({
      _id: rentalId,
      companyId,
    }).lean();

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    const targetItem = rental.items.find((item: any) => {
      const matchItem = item.itemId.toString() === itemId;
      if (!matchItem) return false;
      if (unitId) return item.unitId === unitId;
      return true;
    });

    if (!targetItem) {
      throw new Error("Item não encontrado no aluguel");
    }

    const startDate =
      targetItem.pickupScheduled || rental.dates.pickupScheduled;
    const endDate = targetItem.returnActual || new Date();
    const diffInMs = endDate.getTime() - startDate.getTime();
    const usedDays = Math.max(1, Math.ceil(diffInMs / (1000 * 60 * 60 * 24)));

    let contractedDays = 1;
    if (targetItem.returnScheduled) {
      const diff =
        new Date(targetItem.returnScheduled).getTime() -
        new Date(startDate).getTime();
      contractedDays = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    const rentalType = targetItem.rentalType || "daily";
    const originalTotal = targetItem.subtotal || 0;

    let proportional = 0;
    if (rentalType === "weekly") {
      proportional = (targetItem.unitPrice / 7) * usedDays;
    } else if (rentalType === "biweekly") {
      proportional = (targetItem.unitPrice / 15) * usedDays;
    } else if (rentalType === "monthly") {
      proportional = (targetItem.unitPrice / 30) * usedDays;
    } else {
      proportional = (targetItem.unitPrice / 1) * usedDays;
    }

    const recalculatedTotal = proportional * targetItem.quantity;

    return {
      originalTotal,
      recalculatedTotal,
      usedDays,
      contractedDays,
      rentalType,
    };
  }

  async closeRentalItem(
    companyId: string,
    rentalId: string,
    itemId: string,
    userId: string,
    returnDate?: Date,
    unitId?: string,
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    const targetItem = rental.items.find(
      (item) =>
        item.itemId.toString() === itemId &&
        (unitId ? item.unitId === unitId : true),
    );

    if (!targetItem) {
      throw new Error("Item não encontrado no aluguel");
    }

    if (targetItem.returnActual) {
      throw new Error("Item já finalizado");
    }

    // =========================
    // 1. VALIDAR E BUSCAR ITEM DO INVENTÁRIO
    // =========================
    const inventoryItem = await Item.findOne({
      _id: targetItem.itemId,
      companyId,
    });

    if (!inventoryItem) {
      throw new Error(
        `Sistema de aluguel: Item com ID ${targetItem.itemId} não foi encontrado no inventário. O item pode ter sido removido do sistema. Por favor, contate o administrador para verificar a consistência dos dados.`
      );
    }

    // =========================
    // 2. FINALIZA ITEM
    // =========================
    const finalReturnDate = returnDate || new Date();
    targetItem.returnActual = finalReturnDate;

    // Validar antes de fazer a devolução
    if (inventoryItem.trackingType !== "unit") {
      // Para itens quantitativos, validar a quantidade
      if (inventoryItem.quantity.rented < targetItem.quantity) {
        console.error("[ERRO] Inconsistência de quantidade detectada:", {
          itemName: inventoryItem.name,
          itemId: targetItem.itemId,
          esperadoDevolucao: targetItem.quantity,
          alugadaAtualmente: inventoryItem.quantity.rented,
          disponivel: inventoryItem.quantity.available,
          reservada: inventoryItem.quantity.reserved,
          rentalId,
          customerId: rental.customerId,
          rentalStatus: rental.status,
        });

        // Verificar se está em "reserved" ao invés de "rented"
        if (inventoryItem.quantity.reserved >= targetItem.quantity) {
          throw new Error(
            `Item "${inventoryItem.name}" não foi ativado: O item ainda está reservado e não foi confirmado como retirado. Por favor, cancele a reserva ou ative o aluguel antes de fechar o item. Contate o administrador se este erro persistir.`
          );
        }

        throw new Error(
          `Quantidade inconsistente para "${inventoryItem.name}": O sistema registra apenas ${inventoryItem.quantity.rented} unidades alugadas, mas o contrato indica ${targetItem.quantity}. Isto pode indicar uma inconsistência nos dados ou que o item já foi devolvido anteriormente. Por favor, contate o administrador.`
        );
      }
    }

    await this.updateItemQuantityForRental(
      companyId,
      targetItem.itemId as any,
      targetItem.quantity,
      "return",
      userId,
      rental._id,
      targetItem.unitId,
      rental.customerId.toString(),
    );

    // =========================
    // 2. BILLING FINAL DO ITEM
    // =========================
    const periodStart = targetItem.lastBillingDate
      ? this.addDays(targetItem.lastBillingDate, 1)
      : targetItem.pickupScheduled || rental.dates.pickupScheduled;

    const periodEnd = finalReturnDate;

    if (periodEnd > periodStart) {
      const existing = await Billing.findOne({
        companyId,
        rentalId: rental._id,
        "items.itemId": targetItem.itemId,
        periodStart,
        periodEnd,
      }).lean();

      if (!existing) {
        await billingService.createPeriodicBillingForItem(
          companyId,
          rental,
          targetItem,
          periodStart,
          periodEnd,
          userId,
          {
            includeServices: false,
            notes: "Fechamento final do item",
            status: "approved",
          },
        );
      }

      targetItem.lastBillingDate = periodEnd;
      targetItem.nextBillingDate = undefined;
    }

    // =========================
    // 3. RECALCULAR ITEM
    // =========================
    const startDate =
      targetItem.pickupScheduled || rental.dates.pickupScheduled;

    const diffTime = finalReturnDate.getTime() - new Date(startDate).getTime();

    const usedDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    const rentalType = targetItem.rentalType || "daily";

    let proportional = 0;

    if (rentalType === "weekly") {
      proportional = (targetItem.unitPrice / 7) * usedDays;
    } else if (rentalType === "biweekly") {
      proportional = (targetItem.unitPrice / 15) * usedDays;
    } else if (rentalType === "monthly") {
      proportional = (targetItem.unitPrice / 30) * usedDays;
    } else {
      proportional = targetItem.unitPrice * usedDays;
    }

    targetItem.subtotal = proportional * targetItem.quantity;
    targetItem.usedDays = usedDays;

    // =========================
    // 4. RECALCULAR TOTAL DO ALUGUEL
    // =========================
    let equipmentSubtotal = 0;

    for (const item of rental.items) {
      equipmentSubtotal += item.subtotal || 0;
    }

    const servicesSubtotal =
      rental.services?.reduce((acc, s) => acc + s.subtotal, 0) || 0;

    const total =
      equipmentSubtotal +
      servicesSubtotal -
      (rental.pricing.discount || 0) +
      (rental.pricing.lateFee || 0);

    rental.pricing.equipmentSubtotal = equipmentSubtotal;
    rental.pricing.subtotal = equipmentSubtotal + servicesSubtotal;
    rental.pricing.total = total;

    // =========================
    // 5. VERIFICA SE TODOS FORAM DEVOLVIDOS
    // =========================
    const allReturned = rental.items.every((item) => item.returnActual);

    if (allReturned) {
      // pega a maior data de devolução
      const maxReturn = rental.items.reduce<Date | null>((acc, item) => {
        if (!item.returnActual) return acc;
        if (!acc) return item.returnActual;
        return item.returnActual > acc ? item.returnActual : acc;
      }, null);

      if (maxReturn) {
        rental.dates.returnActual = maxReturn;
      }

      // Status muda para ready_to_close quando todos os itens foram devolvidos
      // Aguardando confirmação do usuário para finalizar completamente
      if (rental.status !== "ready_to_close") {
        rental.status = "ready_to_close";
      }
    }

    // =========================
    // 6. SALVA
    // =========================
    await rental.save();

    return rental;
  }

  /**
   * Confirma o fechamento final do aluguel (transição de ready_to_close → completed)
   * Deve ser chamado quando o usuário confirmar o fechamento após todos os itens serem devolvidos
   */
  async confirmRentalClosure(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<IRental> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    if (rental.status !== "ready_to_close") {
      throw new Error(
        `Apenas aluguéis em status "Pronto para fechar" podem ser finalizados. Status atual: ${rental.status}`,
      );
    }

    // Verifica se todos os itens foram realmente devolvidos
    const notReturned = rental.items.filter((item) => !item.returnActual);
    if (notReturned.length > 0) {
      throw new Error(
        `Não é possível finalizar: ${notReturned.length} item(ns) ainda não foi/foram devolvido(s)`,
      );
    }

    // Aplica a transição de status usando o método padrão
    await this.applyStatusChangeDirect(
      rental,
      "ready_to_close",
      "completed",
      companyId,
      userId,
    );

    await rental.save();
    return rental;
  }

  /**
   * Processa fechamentos periódicos para um aluguel ativo
   */
  async processDueBillings(
    companyId: string,
    rentalId: string,
    userId: string,
  ): Promise<number> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Aluguel não encontrado");
    }

    if (rental.status !== "active" && rental.status !== "overdue") {
      return 0;
    }

    const now = this.normalizeDate(new Date());
    let createdCount = 0;
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }
      const cycle: RentalType = item.rentalType || "daily";
      const pickupBase = this.normalizeDate(item.pickupScheduled);
      const itemReturn = item.returnActual || item.returnScheduled;
      const limitDate = itemReturn ? this.normalizeDate(itemReturn) : now;

      const itemFilter: any = {
        companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
      };
      if (item.unitId) {
        itemFilter["items.unitId"] = item.unitId;
      }

      if (cycle === "daily") {
        if (itemReturn && limitDate <= now) {
          const existing = await Billing.findOne({
            ...itemFilter,
            periodStart: pickupBase,
            periodEnd: limitDate,
          }).lean();
          if (!existing) {
            await billingService.createPeriodicBillingForItem(
              companyId,
              rental,
              item,
              pickupBase,
              limitDate,
              userId,
              {
                includeServices: includeServicesAvailable,
                notes: "Fechamento diário",
              },
            );
            includeServicesAvailable = false;
            createdCount += 1;
          }
          item.lastBillingDate = limitDate;
          item.nextBillingDate = undefined;
        }
        continue;
      }

      let lastBillingDate = item.lastBillingDate
        ? this.normalizeDate(item.lastBillingDate)
        : this.addDays(pickupBase, -1);
      let periodStart = this.addDays(lastBillingDate, 1);
      let nextBillingDate = item.nextBillingDate
        ? this.normalizeDate(item.nextBillingDate)
        : this.getPeriodEnd(periodStart, cycle);

      while (nextBillingDate <= now && nextBillingDate <= limitDate) {
        const existing = await Billing.findOne({
          ...itemFilter,
          periodStart: this.normalizeDate(periodStart),
          periodEnd: this.normalizeDate(nextBillingDate),
        }).lean();

        if (!existing) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(nextBillingDate),
            userId,
            {
              includeServices: includeServicesAvailable,
              notes: "Fechamento periódico automático",
            },
          );
          includeServicesAvailable = false;
          createdCount += 1;
        }

        item.lastBillingDate = this.normalizeDate(nextBillingDate);
        periodStart = this.addDays(nextBillingDate, 1);
        item.nextBillingDate = this.getPeriodEnd(periodStart, cycle);
        nextBillingDate = item.nextBillingDate;
      }

      if (
        nextBillingDate > now &&
        (!itemReturn || nextBillingDate <= limitDate)
      ) {
        const existingFuture = await Billing.findOne({
          ...itemFilter,
          periodStart: this.normalizeDate(periodStart),
          periodEnd: this.normalizeDate(nextBillingDate),
        }).lean();

        if (!existingFuture) {
          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(nextBillingDate),
            userId,
            {
              includeServices: false,
              notes: "Fechamento previsto",
              status: "draft",
            },
          );
        }
      }
    }

    await rental.save();
    return createdCount;
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
    } = {},
  ): Promise<{
    rentals: IRental[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query: any = { companyId };

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.customerId) {
      query.customerId = filters.customerId;
    }

    if (filters.startDate || filters.endDate) {
      query.$or = [
        {
          "dates.pickupScheduled": {
            $gte: filters.startDate || new Date(0),
            $lte: filters.endDate || new Date(),
          },
        },
        {
          "dates.returnScheduled": {
            $gte: filters.startDate || new Date(0),
            $lte: filters.endDate || new Date(),
          },
        },
      ];
    }

    if (filters.search) {
      query.$or = [
        { rentalNumber: { $regex: filters.search, $options: "i" } },
        { notes: { $regex: filters.search, $options: "i" } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [rentals, total] = await Promise.all([
      Rental.find(query)
        .populate("customerId", "name cpfCnpj email phone")
        .populate("items.itemId", "name sku pricing")
        .populate("createdBy", "name email")
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
  async getRentalById(
    companyId: string,
    rentalId: string,
  ): Promise<IRental | null> {
    return Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId", "name cpfCnpj email phone addresses")
      .populate("items.itemId", "name sku pricing photos")
      .populate("createdBy", "name email")
      .populate("checklistPickup.completedBy", "name email")
      .populate("checklistReturn.completedBy", "name email");
  }

  async generateRentalPDF(
    companyId: string,
    rentalId: string,
  ): Promise<Buffer> {
    const rental = await Rental.findOne({ _id: rentalId, companyId })
      .populate("customerId")
      .populate("items.itemId")
      .populate("companyId");

    if (!rental) {
      throw new Error("Rental not found");
    }

    const company = rental.companyId as any;
    const customer = rental.customerId as any;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fontSize(20).text("RECIBO DE LOCAÇÃO", { align: "center" });
      doc.moveDown();

      // Company Info
      doc.fontSize(12).text(company?.name || "Empresa", { align: "left" });
      if (company?.cnpj) doc.text(`CNPJ: ${company.cnpj}`);
      if (company?.email) doc.text(`Email: ${company.email}`);
      if (company?.phone) doc.text(`Telefone: ${company.phone}`);
      doc.moveDown();

      // Rental Info
      doc.fontSize(14).text(`Locação Nº: ${rental.rentalNumber}`);
      doc.text(`Data de emissão: ${new Date().toLocaleDateString("pt-BR")}`);
      doc.text(
        `Período geral: ${new Date(rental.dates.pickupScheduled).toLocaleDateString("pt-BR")} até ${new Date(
          rental.dates.returnScheduled,
        ).toLocaleDateString("pt-BR")}`,
      );
      doc.moveDown();

      // Customer Info
      doc.fontSize(12).text("Cliente:", { underline: true });
      doc.text(customer?.name || "Cliente");
      if (customer?.cpfCnpj) doc.text(`CPF/CNPJ: ${customer.cpfCnpj}`);
      if (customer?.email) doc.text(`Email: ${customer.email}`);
      if (customer?.phone) doc.text(`Telefone: ${customer.phone}`);
      const customerAddresses = customer?.addresses || [];
      const preferredAddress =
        customerAddresses.find((addr: any) => addr.type === "billing") ||
        customerAddresses.find((addr: any) => addr.type === "main") ||
        customerAddresses[0];
      if (preferredAddress) {
        const addressLine = [
          preferredAddress.street,
          preferredAddress.number ? `, ${preferredAddress.number}` : "",
        ].join("");
        const complement = preferredAddress.complement
          ? ` - ${preferredAddress.complement}`
          : "";
        const neighborhood = preferredAddress.neighborhood
          ? ` - ${preferredAddress.neighborhood}`
          : "";
        doc.text(`Endereço: ${addressLine}${complement}${neighborhood}`);
        doc.text(
          `${preferredAddress.city || ""}/${preferredAddress.state || ""} - ${preferredAddress.zipCode || ""}`,
        );
      }
      doc.moveDown();

      // Items Table
      doc.fontSize(12).text("Equipamentos:", { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const itemHeight = 20;
      let y = tableTop;

      // Table Header
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text("Descrição", 50, y);
      doc.text("Retirada", 300, y);
      doc.text("Devolução", 400, y);
      doc.text("Qtd", 520, y);
      y += itemHeight;

      // Table Items
      doc.font("Helvetica");
      rental.items.forEach((item: any) => {
        const itemData = item.itemId as any;
        const description =
          itemData && typeof itemData === "object" && "name" in itemData
            ? itemData.name
            : "Item";
        doc.text(description, 50, y, { width: 230 });
        doc.text(
          item.pickupScheduled
            ? new Date(item.pickupScheduled).toLocaleDateString("pt-BR")
            : "-",
          300,
          y,
        );
        doc.text(
          item.returnScheduled
            ? new Date(item.returnScheduled).toLocaleDateString("pt-BR")
            : "-",
          400,
          y,
        );
        doc.text(item.quantity.toString(), 520, y);
        y += itemHeight;
      });

      if (rental.notes) {
        y += itemHeight * 2;
        doc.font("Helvetica").fontSize(10);
        doc.text("Observações:", 50, y);
        doc.text(rental.notes, 50, y + 15, { width: 500 });
      }

      doc.end();
    });
  }

  private calculateFinalPricing(rental: any, returnDateOverride?: Date) {
    const pickupDate =
      rental.dates.pickupActual || rental.dates.pickupScheduled;

    const returnDate = returnDateOverride || new Date();

    const diffMs = returnDate.getTime() - pickupDate.getTime();
    const usedDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // Recalcular o subtotal dos equipamentos baseado nos dias utilizados
    let recalculatedEquipmentSubtotal = 0;
    for (const item of rental.items) {
      const { unitPrice, rentalType, quantity } = item;
      let proportional = 0;

      if (rentalType === "weekly") {
        proportional = (unitPrice / 7) * usedDays;
      } else if (rentalType === "biweekly") {
        proportional = (unitPrice / 15) * usedDays;
      } else if (rentalType === "monthly") {
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
      returnDate,
    };
  }

  private async recalcPricingForRental(
    rental: IRental,
    companyId: string,
  ): Promise<void> {
    let equipmentSubtotal = 0;
    let totalDeposit = 0;

    for (const item of rental.items) {
      const inventoryItem = await Item.findOne({ _id: item.itemId, companyId });
      if (!inventoryItem) {
        throw new Error(`Item ${item.itemId} not found`);
      }

      const pickupScheduled =
        item.pickupScheduled || rental.dates.pickupScheduled;
      const returnScheduled = item.returnScheduled;
      const pricingEndDate =
        returnScheduled ||
        this.getPricingEndDate(pickupScheduled, item.rentalType);

      const price = this.calculateRentalPrice(
        inventoryItem.pricing.dailyRate,
        inventoryItem.pricing.weeklyRate,
        inventoryItem.pricing.biweeklyRate,
        inventoryItem.pricing.monthlyRate,
        pickupScheduled,
        pricingEndDate,
        item.rentalType,
      );
      const subtotal = price * item.quantity;

      item.unitPrice = price;
      item.subtotal = subtotal;

      equipmentSubtotal += subtotal;
      totalDeposit +=
        (inventoryItem.pricing.depositAmount || 0) * item.quantity;
    }

    rental.pricing.equipmentSubtotal = Number(equipmentSubtotal.toFixed(2));
    rental.pricing.originalEquipmentSubtotal = Number(
      equipmentSubtotal.toFixed(2),
    );
    rental.pricing.deposit = Number(totalDeposit.toFixed(2));
    rental.pricing.subtotal = Number(
      (equipmentSubtotal + rental.pricing.servicesSubtotal).toFixed(2),
    );
    rental.pricing.total = Number(
      (
        rental.pricing.subtotal +
        rental.pricing.deposit -
        rental.pricing.discount +
        rental.pricing.lateFee
      ).toFixed(2),
    );
  }

  private async applyStatusChangeDirect(
    rental: IRental,
    oldStatus: RentalStatus,
    newStatus: RentalStatus,
    companyId: string,
    userId: string,
    adjustments?: {
      returnDate?: Date;
      pricingOverride?: {
        equipmentSubtotal?: number;
        servicesSubtotal?: number;
        discount?: number;
        lateFee?: number;
        total?: number;
      };
    },
  ): Promise<void> {
    console.log("[INFO] FLUXO DE STATUS:", oldStatus, "→", newStatus);

    // 🔒 Proteção contra execução duplicada ou inválida
    if (oldStatus === newStatus) {
      console.warn("[AVISO] Tentativa de mudança de status redundante");
      return;
    }

    rental.status = newStatus;

    /**
     * RESERVED → ACTIVE
     */
    if (oldStatus === "reserved" && newStatus === "active") {
      rental.dates.pickupActual = new Date();

      if (!rental.dates.lastBillingDate) {
        const basePickup = this.normalizeDate(rental.dates.pickupScheduled);
        rental.dates.lastBillingDate = this.addDays(basePickup, -1);
      }

      if (
        !rental.dates.nextBillingDate &&
        rental.dates.billingCycle &&
        rental.dates.billingCycle !== "daily"
      ) {
        const basePickup = this.normalizeDate(rental.dates.pickupScheduled);
        rental.dates.nextBillingDate = this.getPeriodEnd(
          basePickup,
          rental.dates.billingCycle,
        );
      }

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.error(
            "[ERRO] Item não encontrado durante ativação do aluguel:",
            { itemId: item.itemId, rentalId: rental._id }
          );
          continue;
        }

        // =========================
        // ITEM UNITÁRIO
        // =========================
        if (itemDoc.trackingType === "unit") {
          const unit = itemDoc.units?.find((u) => u.unitId === item.unitId);

          console.log(
            "[INFO] Ativando unidade:",
            { itemId: item.itemId, unitId: item.unitId, status: unit?.status }
          );

          if (unit?.status === "rented") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} já está alugada`
            );
            continue;
          }

          if (!unit) {
            console.warn(
              `[AVISO] Unidade não encontrada durante ativação: ${item.unitId}`
            );
            continue;
          }

          if (unit.status !== "reserved") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} não está em status "reservada" (status=${unit.status}), pulando ativação`
            );
            continue;
          }

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "activate",
            userId,
            rental._id,
            item.unitId,
            rental.customerId.toString(),
          );
        } else {
          // =========================
          // ITEM QUANTITATIVO
          // =========================
          console.log(
            "[INFO] Ativando item quantitativo:",
            { itemId: item.itemId, quantidade: item.quantity }
          );

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "activate",
            userId,
            rental._id,
            undefined, // sem unitId para quantitativos
            rental.customerId.toString(),
          );
        }
      }
    }

    /**
     * ACTIVE / OVERDUE → COMPLETED
     */
    if (
      (oldStatus === "active" || oldStatus === "overdue") &&
      newStatus === "completed"
    ) {
      const { usedDays, recalculatedEquipmentSubtotal, returnDate } =
        this.calculateFinalPricing(rental, adjustments?.returnDate);

      rental.dates.returnActual = returnDate;

      for (const item of rental.items) {
        if (!item.returnActual) {
          item.returnActual = returnDate;
        }
      }

      rental.pricing.originalEquipmentSubtotal =
        rental.pricing.equipmentSubtotal;

      rental.pricing.equipmentSubtotal = Number(
        recalculatedEquipmentSubtotal.toFixed(2),
      );

      rental.pricing.subtotal = Number(
        (
          rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal
        ).toFixed(2),
      );

      rental.pricing.total = Number(
        (
          rental.pricing.subtotal +
          rental.pricing.deposit -
          rental.pricing.discount +
          rental.pricing.lateFee
        ).toFixed(2),
      );

      rental.pricing.usedDays = usedDays;

      if (adjustments?.pricingOverride) {
        const override = adjustments.pricingOverride;

        if (override.equipmentSubtotal !== undefined) {
          rental.pricing.equipmentSubtotal = override.equipmentSubtotal;
        }

        if (override.servicesSubtotal !== undefined) {
          rental.pricing.servicesSubtotal = override.servicesSubtotal;
        }

        if (override.discount !== undefined) {
          rental.pricing.discount = override.discount;
        }

        if (override.lateFee !== undefined) {
          rental.pricing.lateFee = override.lateFee;
        }

        rental.pricing.subtotal = Number(
          (
            rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal
          ).toFixed(2),
        );

        rental.pricing.total =
          override.total !== undefined
            ? override.total
            : Number(
                (
                  rental.pricing.subtotal +
                  rental.pricing.deposit -
                  rental.pricing.discount +
                  rental.pricing.lateFee
                ).toFixed(2),
              );
      }

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.error(
            "[ERRO] Item não encontrado durante devolução do aluguel:",
            { itemId: item.itemId, rentalId: rental._id }
          );
          continue;
        }

        // =========================
        // ITEM UNITÁRIO
        // =========================
        if (itemDoc.trackingType === "unit") {
          const unit = itemDoc.units?.find((u) => u.unitId === item.unitId);

          console.log(
            "[INFO] Devolvendo unidade:",
            { itemId: item.itemId, unitId: item.unitId, status: unit?.status }
          );

          // 🔒 Proteção contra retorno indevido
          if (unit?.status === "reserved") {
            console.warn(
              `[AVISO] Tentativa de devolução com unidade ainda reservada: ${item.unitId}`
            );
            continue;
          }

          if (!unit) {
            console.warn(
              `[AVISO] Unidade não encontrada durante devolução: ${item.unitId}`
            );
            continue;
          }

          if (unit.status !== "rented") {
            console.warn(
              `[AVISO] Unidade ${item.unitId} não está em status "alugada" (status=${unit.status}), pulando devolução`
            );
            continue;
          }

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "return",
            userId,
            rental._id,
            item.unitId,
            rental.customerId.toString(),
          );
        } else {
          // =========================
          // ITEM QUANTITATIVO
          // =========================
          console.log(
            "[INFO] Devolvendo item quantitativo:",
            { itemId: item.itemId, quantidade: item.quantity }
          );

          await this.updateItemQuantityForRental(
            companyId,
            item.itemId,
            item.quantity,
            "return",
            userId,
            rental._id,
            undefined, // sem unitId para quantitativos
            rental.customerId.toString(),
          );
        }
      }
    }

    /**
     * RESERVED → CANCELLED
     */
    if (oldStatus === "reserved" && newStatus === "cancelled") {
      console.log(
        "[INFO] Cancelando aluguel e liberando itens reservados:",
        { rentalId: rental._id }
      );

      for (const item of rental.items) {
        const itemDoc = await Item.findOne({ _id: item.itemId, companyId });

        if (!itemDoc) {
          console.warn(
            "[AVISO] Item não encontrado durante cancelamento do aluguel:",
            { itemId: item.itemId }
          );
          continue;
        }

        await this.updateItemQuantityForRental(
          companyId,
          item.itemId,
          item.quantity,
          "cancel",
          userId,
          rental._id,
          item.unitId,
          rental.customerId.toString(),
        );
      }
    }

    /**
     * READY_TO_CLOSE → COMPLETED
     * Transição final do aluguel após todos os itens serem devolvidos
     */
    if (oldStatus === "ready_to_close" && newStatus === "completed") {
      // Marca data de conclusão
      rental.dates.returnActual = rental.dates.returnActual || new Date();

      // Garante que todos os itens tenham returnActual
      for (const item of rental.items) {
        if (!item.returnActual) {
          item.returnActual = rental.dates.returnActual;
        }
      }

      // Nota: As unidades já foram retornadas por closeRentalItem
      // apenas confirmamos que o aluguel está finalizado
      console.log("[SUCESSO] Aluguel finalizado com êxito:", rental._id);
    }
  }

  private async createFinalBillingIfNeeded(
    rental: IRental,
    userId: string,
  ): Promise<void> {
    let includeServicesAvailable =
      (await Billing.countDocuments({
        companyId: rental.companyId,
        rentalId: rental._id,
      })) === 0;

    for (const item of rental.items) {
      const itemReturn = item.returnActual || item.returnScheduled;
      if (!itemReturn) {
        continue;
      }
      if (!item.pickupScheduled && rental.dates.pickupScheduled) {
        item.pickupScheduled = rental.dates.pickupScheduled;
      }
      if (!item.pickupScheduled) {
        continue;
      }

      const lastBilling = item.lastBillingDate;
      const periodStart = lastBilling
        ? this.addDays(lastBilling, 1)
        : item.pickupScheduled;
      const periodEnd = itemReturn;

      if (!periodStart || periodEnd <= periodStart) {
        continue;
      }

      const existing = await Billing.findOne({
        companyId: rental.companyId,
        rentalId: rental._id,
        "items.itemId": item.itemId,
        periodStart,
        periodEnd,
      }).lean();

      if (existing) {
        continue;
      }

      await billingService.createPeriodicBillingForItem(
        rental.companyId.toString(),
        rental,
        item,
        periodStart,
        periodEnd,
        userId,
        {
          includeServices: includeServicesAvailable,
          notes: "Fechamento final do aluguel",
        },
      );
      includeServicesAvailable = false;

      item.lastBillingDate = periodEnd;
      item.nextBillingDate = undefined;
    }
  }

  /**
   * Update rental status
   */
  async updateRentalStatus(
    companyId: string,
    rentalId: string,
    status: RentalStatus,
    userId: string,
    adjustments?: {
      returnDate?: Date;
      rentalType?: RentalType;
      pricingOverride?: {
        equipmentSubtotal?: number;
        servicesSubtotal?: number;
        discount?: number;
        lateFee?: number;
        total?: number;
      };
      notes?: string;
    },
  ): Promise<UpdateRentalStatusResponse> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });
    if (!rental) {
      throw new Error("Rental not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const isAdmin = canUpdateRentalStatus(user.role as RoleType);

    if (adjustments && status !== "completed") {
      throw new Error("Ajustes só podem ser enviados no fechamento do aluguel");
    }

    // funcionário → cria solicitação
    if (!isAdmin) {
      if (status === "completed" && adjustments) {
        await this.requestApproval(
          companyId,
          rentalId,
          "close_adjustment",
          {
            previousStatus: rental.status,
            newStatus: status,
            previousValue: rental.status,
            newValue: status,
            adjustments,
          },
          userId,
          adjustments.notes || `Solicitação de fechamento com ajustes`,
        );

        await notificationService.notifyStatusChangeRequest({
          title: "Solicitação de alteração de status",
          message: `O funcionário ${user.name} solicitou fechar o aluguel com ajustes`,
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

      await this.requestApproval(
        companyId,
        rentalId,
        "status_change",
        {
          previousStatus: rental.status,
          newStatus: status,
          previousValue: rental.status,
          newValue: status,
        },
        userId,
        `Solicitação de alteração de status para ${status}`,
      );

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
        data: rental,
      };
    }

    await this.applyStatusChangeDirect(
      rental,
      oldStatus,
      status,
      companyId,
      userId,
      adjustments,
    );

    if (status === "active" && oldStatus !== "active") {
      const existingInvoice = await Invoice.findOne({
        rentalId: rental._id,
        companyId,
      });

      if (!existingInvoice) {
        await invoiceService.createInvoiceFromRental(
          companyId,
          rental._id.toString(),
          userId,
        );
      }
    }

    if (status === "completed") {
      await this.processDueBillings(companyId, rentalId, userId);
    }

    if (status === "completed" && adjustments?.rentalType) {
      for (const item of rental.items) {
        item.rentalType = adjustments.rentalType;
      }
      rental.dates.billingCycle = adjustments.rentalType;
      await this.recalcPricingForRental(rental, companyId);
    }

    if (status === "completed") {
      await this.createFinalBillingIfNeeded(rental, userId);
    }

    await this.addChangeHistory(
      rental,
      "status_change",
      oldStatus,
      status,
      userId,
      adjustments?.notes,
    );

    await rental.save();

    return {
      success: true,
      message: "Status alterado com sucesso",
      data: rental,
    };
  }

  /**
   * Extend rental period
   */
  async extendRental(
    companyId: string,
    rentalId: string,
    newReturnDate: Date,
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (rental.status !== "active" && rental.status !== "reserved") {
      throw new Error("Can only extend active or reserved rentals");
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
          item.rentalType,
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
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
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
    userId: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
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
  async updateRental(
    companyId: string,
    rentalId: string,
    data: any,
    userId: string,
  ): Promise<{ rental: IRental; requiresApproval: boolean }> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    const changes: Record<string, any> = {};
    const dateChanges: Record<string, any> = {};
    const itemChanges: Record<string, any>[] = [];
    const workAddressChanged = data.workAddress !== undefined;
    const itemUpdates = Array.isArray(data.items) ? data.items : [];
    if (itemUpdates.length > 0) {
      for (const itemUpdate of itemUpdates) {
        const existingItem = rental.items.find(
          (i) =>
            i.itemId.toString() === itemUpdate.itemId &&
            (itemUpdate.unitId ? i.unitId === itemUpdate.unitId : !i.unitId),
        );
        itemChanges.push({
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
          isNew: !existingItem,
          previousRentalType: existingItem?.rentalType,
          newRentalType: itemUpdate.rentalType,
          previousPickupScheduled: existingItem?.pickupScheduled,
          newPickupScheduled: itemUpdate.pickupScheduled,
          previousReturnScheduled: existingItem?.returnScheduled,
          newReturnScheduled: itemUpdate.returnScheduled,
          quantity: itemUpdate.quantity,
        });
      }
    }

    if (data.dates?.pickupScheduled) {
      const newPickup = new Date(data.dates.pickupScheduled);
      if (rental.dates.pickupScheduled.getTime() !== newPickup.getTime()) {
        dateChanges.pickupScheduled = {
          previous: rental.dates.pickupScheduled,
          next: newPickup,
        };
      }
    }

    if (data.dates?.returnScheduled) {
      const newReturn = new Date(data.dates.returnScheduled);
      if (rental.dates.returnScheduled.getTime() !== newReturn.getTime()) {
        dateChanges.returnScheduled = {
          previous: rental.dates.returnScheduled,
          next: newReturn,
        };
      }
    }

    // Only allow updates to certain fields
    if (data.notes !== undefined) {
      changes.notes = {
        previous: rental.notes || "",
        next: data.notes || "",
      };
    }

    if (workAddressChanged) {
      rental.workAddress = data.workAddress
        ? {
            street: data.workAddress.street,
            number: data.workAddress.number,
            complement: data.workAddress.complement,
            neighborhood: data.workAddress.neighborhood,
            city: data.workAddress.city,
            state: data.workAddress.state,
            zipCode: data.workAddress.zipCode,
            workName: data.workAddress.workName,
            workId:
              data.workAddress.workId &&
              mongoose.Types.ObjectId.isValid(data.workAddress.workId)
                ? new mongoose.Types.ObjectId(data.workAddress.workId)
                : undefined,
          }
        : undefined;
    }

    const hasChanges = Object.keys(changes).length > 0;
    const hasDateChanges = Object.keys(dateChanges).length > 0;
    const hasItemChanges = itemUpdates.length > 0;

    if (
      !hasChanges &&
      !hasDateChanges &&
      !workAddressChanged &&
      !hasItemChanges
    ) {
      return { rental, requiresApproval: false };
    }

    if (
      !canUpdateRentalStatus(user.role as RoleType) &&
      (hasChanges || hasDateChanges || hasItemChanges)
    ) {
      await this.requestApproval(
        companyId,
        rentalId,
        "rental_update",
        {
          previousNotes: changes.notes?.previous,
          newNotes: changes.notes?.next,
          previousPickupScheduled: dateChanges.pickupScheduled?.previous,
          newPickupScheduled: dateChanges.pickupScheduled?.next,
          previousReturnScheduled: dateChanges.returnScheduled?.previous,
          newReturnScheduled: dateChanges.returnScheduled?.next,
          items: itemChanges,
          previousValue: "rental_update",
          newValue: "rental_update",
        },
        userId,
        "Solicitação de edição do aluguel",
      );

      await rental.save();
      return { rental, requiresApproval: true };
    }

    if (changes.notes) {
      rental.notes = changes.notes.next;
    }

    if (dateChanges.pickupScheduled) {
      rental.dates.pickupScheduled = dateChanges.pickupScheduled.next;
    }

    if (dateChanges.returnScheduled) {
      rental.dates.returnScheduled = dateChanges.returnScheduled.next;
    }

    if (hasItemChanges) {
      const changedItems: Array<{ itemId: string; unitId?: string }> = [];
      for (const itemUpdate of itemUpdates) {
        const inventoryItem = await Item.findOne({
          _id: itemUpdate.itemId,
          companyId,
        });
        if (!inventoryItem) {
          throw new Error(`Item ${itemUpdate.itemId} not found`);
        }

        const isUnit = inventoryItem.trackingType === "unit";
        if (isUnit && !itemUpdate.unitId) {
          throw new Error(
            `Item ${inventoryItem.name} is unit-based. Please specify unitId.`,
          );
        }

        const existingItem = rental.items.find(
          (i) =>
            i.itemId.toString() === itemUpdate.itemId &&
            (itemUpdate.unitId ? i.unitId === itemUpdate.unitId : !i.unitId),
        );

        if (existingItem) {
          if (itemUpdate.rentalType) {
            existingItem.rentalType = itemUpdate.rentalType;
          }
          if (itemUpdate.pickupScheduled) {
            existingItem.pickupScheduled = new Date(itemUpdate.pickupScheduled);
          }
          if (itemUpdate.returnScheduled !== undefined) {
            existingItem.returnScheduled = itemUpdate.returnScheduled
              ? new Date(itemUpdate.returnScheduled)
              : undefined;
          }
        } else {
          const quantity = itemUpdate.quantity || 1;
          if (!isUnit) {
            const available = inventoryItem.quantity.available || 0;
            if (available < quantity) {
              throw new Error(
                `Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${quantity}`,
              );
            }
          } else {
            const unit = inventoryItem.units?.find(
              (u) => u.unitId === itemUpdate.unitId,
            );
            if (!unit || unit.status !== "available") {
              throw new Error(
                `Unit ${itemUpdate.unitId} is not available for rental`,
              );
            }
          }

          const rentalType: RentalType = itemUpdate.rentalType || "daily";
          const pickupScheduled = itemUpdate.pickupScheduled
            ? new Date(itemUpdate.pickupScheduled)
            : rental.dates.pickupScheduled;
          const returnScheduled = itemUpdate.returnScheduled
            ? new Date(itemUpdate.returnScheduled)
            : undefined;
          const pricingEndDate =
            returnScheduled ||
            this.getPricingEndDate(pickupScheduled, rentalType);

          const price = this.calculateRentalPrice(
            inventoryItem.pricing.dailyRate,
            inventoryItem.pricing.weeklyRate,
            inventoryItem.pricing.biweeklyRate,
            inventoryItem.pricing.monthlyRate,
            pickupScheduled,
            pricingEndDate,
            rentalType,
          );

          rental.items.push({
            itemId: itemUpdate.itemId,
            unitId: itemUpdate.unitId,
            quantity,
            unitPrice: price,
            rentalType,
            pickupScheduled,
            returnScheduled,
            subtotal: price * quantity,
          } as any);

          const action =
            rental.status === "active" || rental.status === "overdue"
              ? "activate"
              : "reserve";
          await this.updateItemQuantityForRental(
            companyId,
            itemUpdate.itemId,
            quantity,
            action,
            userId,
            rental._id,
            itemUpdate.unitId,
            rental.customerId.toString(),
          );
        }

        changedItems.push({
          itemId: itemUpdate.itemId,
          unitId: itemUpdate.unitId,
        });
      }

      for (const changed of changedItems) {
        const item = rental.items.find(
          (i) =>
            i.itemId.toString() === changed.itemId &&
            (changed.unitId ? i.unitId === changed.unitId : !i.unitId),
        );
        if (item) {
          item.lastBillingDate = undefined;
          item.nextBillingDate = undefined;
        }
        await Billing.deleteMany({
          companyId: rental.companyId,
          rentalId: rental._id,
          "items.itemId": changed.itemId,
          ...(changed.unitId ? { "items.unitId": changed.unitId } : {}),
          status: "draft",
        });
      }

      await this.recalcPricingForRental(rental, companyId);

      const pickups = rental.items
        .map((i) => i.pickupScheduled)
        .filter(Boolean) as Date[];
      if (pickups.length > 0) {
        rental.dates.pickupScheduled = new Date(
          Math.min(...pickups.map((d) => d.getTime())),
        );
      }
      const returns = rental.items
        .map((i) => i.returnScheduled)
        .filter(Boolean) as Date[];
      if (returns.length > 0) {
        rental.dates.returnScheduled = new Date(
          Math.max(...returns.map((d) => d.getTime())),
        );
      }

      if (rental.status === "reserved") {
        let includeServicesAvailable =
          (await Billing.countDocuments({
            companyId,
            rentalId: rental._id,
          })) === 0;

        for (const changed of changedItems) {
          const item = rental.items.find(
            (i) =>
              i.itemId.toString() === changed.itemId &&
              (changed.unitId ? i.unitId === changed.unitId : !i.unitId),
          );
          if (!item || item.rentalType === "daily") continue;

          const periodStart = this.normalizeDate(item.pickupScheduled);
          let periodEnd = this.getPeriodEnd(periodStart, item.rentalType);
          const itemReturn = item.returnScheduled
            ? this.normalizeDate(item.returnScheduled)
            : undefined;
          if (itemReturn && itemReturn < periodEnd) {
            periodEnd = itemReturn;
          }

          await billingService.createPeriodicBillingForItem(
            companyId,
            rental,
            item,
            this.normalizeDate(periodStart),
            this.normalizeDate(periodEnd),
            userId,
            {
              includeServices: includeServicesAvailable,
              notes: "Fechamento inicial",
              status: "approved",
            },
          );
          includeServicesAvailable = false;

          item.lastBillingDate = periodEnd;
          const nextStart = this.addDays(periodEnd, 1);
          if (!itemReturn || itemReturn >= nextStart) {
            const nextEnd = this.getPeriodEnd(nextStart, item.rentalType);
            item.nextBillingDate = nextEnd;

            await billingService.createPeriodicBillingForItem(
              companyId,
              rental,
              item,
              this.normalizeDate(nextStart),
              this.normalizeDate(nextEnd),
              userId,
              {
                includeServices: false,
                notes: "Fechamento previsto",
                status: "draft",
              },
            );
          }
        }
      } else if (rental.status === "active" || rental.status === "overdue") {
        await this.processDueBillings(companyId, rentalId, userId);
      }
    }

    await this.addChangeHistory(
      rental,
      "rental_update",
      JSON.stringify({ ...changes, ...dateChanges, items: itemChanges }),
      JSON.stringify({ ...changes, ...dateChanges, items: itemChanges }),
      userId,
    );

    await rental.save();
    return { rental, requiresApproval: false };
  }

  /**
   * Check and update overdue rentals
   */
  async checkOverdueRentals(companyId: string): Promise<number> {
    const now = new Date();
    const overdueRentals = await Rental.updateMany(
      {
        companyId,
        status: { $in: ["active", "reserved"] },
        "dates.returnScheduled": { $lt: now },
      },
      {
        $set: { status: "overdue" },
      },
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

    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const sevenDaysFromNow = new Date(todayEnd);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    //Contratos vencidos
    const expiredQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $lt: todayStart,
      },
    };

    //Vencem hoje
    const expiringTodayQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $gte: todayStart,
        $lt: todayEnd,
      },
    };

    //Vencem em até 7 dias
    const expiringSoonQuery = {
      companyId,
      status: { $in: ["active", "reserved"] },
      "dates.returnScheduled": {
        $exists: true,
        $gt: todayEnd,
        $lte: sevenDaysFromNow,
      },
    };

    //Ativos
    const activeQuery = {
      companyId,
      status: "active",
    };

    const [expired, expiringSoon, expiringToday, activeCount] =
      await Promise.all([
        Rental.find(expiredQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 })
          .limit(50),

        Rental.find(expiringSoonQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 })
          .limit(50),

        Rental.find(expiringTodayQuery)
          .populate("customerId", "name cpfCnpj email phone")
          .populate("items.itemId", "name sku")
          .populate("workAddress")
          .sort({ "dates.returnScheduled": 1 }),

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

  private async updateItemQuantityForRental(
    companyId: string,
    itemId: mongoose.Types.ObjectId,
    quantity: number,
    action: "reserve" | "activate" | "return" | "cancel",
    userId: string,
    rentalId: mongoose.Types.ObjectId,
    unitId?: string,
    customerId?: string,
  ): Promise<void> {
    const item = await Item.findOne({ _id: itemId, companyId });

    if (!item) {
      throw new Error("Item not found");
    }

    // =========================
    // ITEM UNITÁRIO
    // =========================
    if (item.trackingType === "unit") {
      if (!unitId) {
        console.warn("[AVISO] Ação de unidade sem unitId", { itemId, rentalId });
        return;
      }

      const unit = item.units?.find((u) => u.unitId === unitId);
      if (!unit) {
        throw new Error("Unidade não encontrada");
      }

      switch (action) {
        case "reserve":
          if (unit.status === "reserved") return; // idempotente

          if (unit.status !== "available") {
            throw new Error(`Unidade ${unit.unitId} não está disponível`);
          }

          unit.status = "reserved";
          unit.currentRental = rentalId;
          unit.currentCustomer = customerId
            ? new mongoose.Types.ObjectId(customerId)
            : undefined;
          break;

        case "activate":
          if (unit.status === "rented") return; // idempotente

          if (unit.status !== "reserved") {
            throw new Error(`Unidade ${unit.unitId} não está reservada`);
          }

          unit.status = "rented";
          break;

        case "return":
          //proteção forte
          if (unit.status === "available") return;

          if (unit.status === "reserved") {
            console.warn(
              `Tentativa de devolução em unidade ainda reservada: ${unit.unitId}`,
            );
            return;
          }

          if (unit.status !== "rented") {
            throw new Error(`Unidade ${unit.unitId} não está alugada`);
          }

          unit.status = "available";
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;
          break;

        case "cancel":
          if (unit.status === "available") return;

          if (unit.status !== "reserved") {
            console.warn(
              `Cancelamento ignorado - unidade não está reservada: ${unit.unitId}`,
            );
            return;
          }

          unit.status = "available";
          unit.currentRental = undefined;
          unit.currentCustomer = undefined;
          break;
      }

      // =========================
      // RECÁLCULO BASEADO NAS UNITS (FONTE DA VERDADE)
      // =========================
      const units = item.units ?? [];

      item.quantity.total = units.length;
      item.quantity.available = units.filter(
        (u) => u.status === "available",
      ).length;
      item.quantity.reserved = units.filter(
        (u) => u.status === "reserved",
      ).length;
      item.quantity.rented = units.filter((u) => u.status === "rented").length;
      item.quantity.maintenance = units.filter(
        (u) => u.status === "maintenance",
      ).length;
      item.quantity.damaged = units.filter(
        (u) => u.status === "damaged",
      ).length;

      await item.save();

      await ItemMovement.create({
        companyId: new mongoose.Types.ObjectId(companyId),
        itemId,
        type: action === "return" ? "return" : "rent",
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
      case "reserve":
        item.quantity.available -= quantity;
        item.quantity.reserved += quantity;
        break;

      case "activate":
        item.quantity.reserved -= quantity;
        item.quantity.rented += quantity;
        break;

      case "return":
        item.quantity.rented -= quantity;
        item.quantity.available += quantity;
        break;

      case "cancel":
        item.quantity.reserved -= quantity;
        item.quantity.available += quantity;
        break;
    }

    if (
      item.quantity.available < 0 ||
      item.quantity.rented < 0 ||
      item.quantity.reserved < 0
    ) {
      console.error("[ERRO] Quantidade negativa após operação:", {
        itemName: item.name,
        itemId: item._id,
        acao: action,
        quantidadeSolicitada: quantity,
        quantidadeAnterior: previousQuantity,
        quantidadeAtual: item.quantity,
        rentalId,
      });

      throw new Error(
        `Operação inválida de quantidade para "${item.name}": Após ${action} de ${quantity} unidades, a quantidade dis${action === "return" ? "ponível" : "reservada"} ficaria negativa. ${action === "return" ? "Isto pode indicar que o item já foi devolvido ou há inconsistência nos dados." : "Verifique a disponibilidade do item."}. Por favor, contate o administrador.`
      );
    }

    await item.save();

    await ItemMovement.create({
      companyId: new mongoose.Types.ObjectId(companyId),
      itemId,
      type: action === "return" ? "return" : "rent",
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
    notes?: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (!rental.pendingApprovals) {
      rental.pendingApprovals = [];
    }

    const approval: IRentalPendingApproval = {
      requestedBy: new mongoose.Types.ObjectId(userId),
      requestDate: new Date(),
      requestType,
      requestDetails,
      status: "pending",
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
    approvalId: string,
    userId: string,
    notes?: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (!rental.pendingApprovals || rental.pendingApprovals.length === 0) {
      throw new Error("Approval request not found");
    }

    const approval = rental.pendingApprovals.find(
      (item) => item._id?.toString() === approvalId,
    );
    if (!approval) {
      throw new Error("Approval request not found");
    }

    if (approval.status !== "pending") {
      throw new Error("Approval request is not pending");
    }

    // Aplicar a alteração baseada no tipo de solicitação
    await this.applyApprovalChange(rental, approval, userId);

    // Atualizar status da aprovação
    approval.status = "approved";
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      approval.requestType,
      approval.requestDetails.previousValue || "",
      approval.requestDetails.newValue || "",
      userId,
      notes,
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
    approvalId: string,
    userId: string,
    notes: string,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (!rental.pendingApprovals || rental.pendingApprovals.length === 0) {
      throw new Error("Approval request not found");
    }

    const approval = rental.pendingApprovals.find(
      (item) => item._id?.toString() === approvalId,
    );
    if (!approval) {
      throw new Error("Approval request not found");
    }

    if (approval.status !== "pending") {
      throw new Error("Approval request is not pending");
    }

    approval.status = "rejected";
    approval.approvedBy = new mongoose.Types.ObjectId(userId);
    approval.approvalDate = new Date();
    approval.notes = notes;

    await rental.save();
    return rental;
  }

  /**
   * NOVO: Aplicar alteração aprovada
   */
  private async applyApprovalChange(
    rental: IRental,
    approval: IRentalPendingApproval,
    userId: string,
  ): Promise<void> {
    const { requestType, requestDetails } = approval;

    switch (requestType) {
      case "rental_type_change":
        // Alterar tipo de aluguel dos itens
        if (requestDetails.items && Array.isArray(requestDetails.items)) {
          for (const itemChange of requestDetails.items) {
            const item = rental.items.find(
              (i) => i.itemId.toString() === itemChange.itemId,
            );
            if (item) {
              item.rentalType = itemChange.newRentalType;
              item.lastBillingDate = undefined;
              item.nextBillingDate = undefined;
              await Billing.deleteMany({
                companyId: rental.companyId,
                rentalId: rental._id,
                "items.itemId": item.itemId,
                status: "draft",
              });
            }
          }
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.itemIndex !== undefined || requestDetails.itemId) {
          const item =
            requestDetails.itemIndex !== undefined
              ? rental.items[requestDetails.itemIndex]
              : rental.items.find(
                  (i) => i.itemId.toString() === requestDetails.itemId,
                );
          if (item && requestDetails.newRentalType) {
            item.rentalType = requestDetails.newRentalType;
            item.lastBillingDate = undefined;
            item.nextBillingDate = undefined;
            await Billing.deleteMany({
              companyId: rental.companyId,
              rentalId: rental._id,
              "items.itemId": item.itemId,
              status: "draft",
            });
            await this.recalcPricingForRental(
              rental,
              rental.companyId.toString(),
            );
          }
        }
        break;

      case "discount":
        // Aplicar desconto
        rental.pricing.discount = requestDetails.discount || 0;
        rental.pricing.discountReason = requestDetails.reason;
        rental.pricing.discountApprovedBy = new mongoose.Types.ObjectId(userId);
        rental.pricing.total =
          rental.pricing.subtotal -
          rental.pricing.discount +
          rental.pricing.lateFee;
        break;

      case "extension":
        // Estender período
        if (requestDetails.newReturnDate) {
          rental.dates.returnScheduled = new Date(requestDetails.newReturnDate);
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        break;

      case "service_addition":
        // Adicionar serviço
        if (!rental.services) {
          rental.services = [];
        }
        rental.services.push(requestDetails.service);
        rental.pricing.servicesSubtotal += requestDetails.service.subtotal;
        rental.pricing.subtotal =
          rental.pricing.equipmentSubtotal + rental.pricing.servicesSubtotal;
        rental.pricing.total =
          rental.pricing.subtotal -
          rental.pricing.discount +
          rental.pricing.lateFee;
        break;

      case "status_change":
        if (requestDetails.newStatus) {
          await this.applyStatusChangeDirect(
            rental,
            rental.status,
            requestDetails.newStatus,
            rental.companyId.toString(),
            userId,
          );
        }
        break;

      case "close_adjustment":
        if (requestDetails?.adjustments?.rentalType) {
          for (const item of rental.items) {
            item.rentalType = requestDetails.adjustments.rentalType;
          }
          rental.dates.billingCycle = requestDetails.adjustments.rentalType;
          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
        if (requestDetails.newStatus) {
          await this.applyStatusChangeDirect(
            rental,
            rental.status,
            requestDetails.newStatus,
            rental.companyId.toString(),
            userId,
            requestDetails.adjustments,
          );
        }
        break;

      case "rental_update":
        if (requestDetails.newNotes !== undefined) {
          rental.notes = requestDetails.newNotes;
        }
        if (requestDetails.newPickupScheduled) {
          rental.dates.pickupScheduled = new Date(
            requestDetails.newPickupScheduled,
          );
        }
        if (requestDetails.newReturnScheduled) {
          rental.dates.returnScheduled = new Date(
            requestDetails.newReturnScheduled,
          );
        }
        if (Array.isArray(requestDetails.items)) {
          const changedItems: Array<{ itemId: string; unitId?: string }> = [];
          for (const itemChange of requestDetails.items) {
            const inventoryItem = await Item.findOne({
              _id: itemChange.itemId,
              companyId: rental.companyId,
            });
            if (!inventoryItem) {
              throw new Error(`Item ${itemChange.itemId} not found`);
            }

            const isUnit = inventoryItem.trackingType === "unit";
            if (isUnit && !itemChange.unitId) {
              throw new Error(
                `Item ${inventoryItem.name} is unit-based. Please specify unitId.`,
              );
            }

            const existingItem = rental.items.find(
              (i) =>
                i.itemId.toString() === itemChange.itemId &&
                (itemChange.unitId
                  ? i.unitId === itemChange.unitId
                  : !i.unitId),
            );

            if (existingItem) {
              if (itemChange.newRentalType) {
                existingItem.rentalType = itemChange.newRentalType;
              }
              if (itemChange.newPickupScheduled) {
                existingItem.pickupScheduled = new Date(
                  itemChange.newPickupScheduled,
                );
              }
              if (itemChange.newReturnScheduled !== undefined) {
                existingItem.returnScheduled = itemChange.newReturnScheduled
                  ? new Date(itemChange.newReturnScheduled)
                  : undefined;
              }
            } else if (itemChange.isNew) {
              const quantity = itemChange.quantity || 1;
              if (!isUnit) {
                const available = inventoryItem.quantity.available || 0;
                if (available < quantity) {
                  throw new Error(
                    `Insufficient quantity for item ${inventoryItem.name}. Available: ${available}, Requested: ${quantity}`,
                  );
                }
              } else {
                const unit = inventoryItem.units?.find(
                  (u) => u.unitId === itemChange.unitId,
                );
                if (!unit || unit.status !== "available") {
                  throw new Error(
                    `Unit ${itemChange.unitId} is not available for rental`,
                  );
                }
              }

              const rentalType: RentalType =
                itemChange.newRentalType || "daily";
              const pickupScheduled = itemChange.newPickupScheduled
                ? new Date(itemChange.newPickupScheduled)
                : rental.dates.pickupScheduled;
              const returnScheduled = itemChange.newReturnScheduled
                ? new Date(itemChange.newReturnScheduled)
                : undefined;
              const pricingEndDate =
                returnScheduled ||
                this.getPricingEndDate(pickupScheduled, rentalType);

              const price = this.calculateRentalPrice(
                inventoryItem.pricing.dailyRate,
                inventoryItem.pricing.weeklyRate,
                inventoryItem.pricing.biweeklyRate,
                inventoryItem.pricing.monthlyRate,
                pickupScheduled,
                pricingEndDate,
                rentalType,
              );

              rental.items.push({
                itemId: itemChange.itemId,
                unitId: itemChange.unitId,
                quantity,
                unitPrice: price,
                rentalType,
                pickupScheduled,
                returnScheduled,
                subtotal: price * quantity,
              } as any);

              const action =
                rental.status === "active" || rental.status === "overdue"
                  ? "activate"
                  : "reserve";
              await this.updateItemQuantityForRental(
                rental.companyId.toString(),
                itemChange.itemId,
                quantity,
                action,
                userId,
                rental._id,
                itemChange.unitId,
                rental.customerId.toString(),
              );
            }

            changedItems.push({
              itemId: itemChange.itemId,
              unitId: itemChange.unitId,
            });
          }

          for (const changed of changedItems) {
            const item = rental.items.find(
              (i) =>
                i.itemId.toString() === changed.itemId &&
                (changed.unitId ? i.unitId === changed.unitId : !i.unitId),
            );
            if (item) {
              item.lastBillingDate = undefined;
              item.nextBillingDate = undefined;
            }
            await Billing.deleteMany({
              companyId: rental.companyId,
              rentalId: rental._id,
              "items.itemId": changed.itemId,
              ...(changed.unitId ? { "items.unitId": changed.unitId } : {}),
              status: "draft",
            });
          }

          await this.recalcPricingForRental(
            rental,
            rental.companyId.toString(),
          );
        }
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
    reason?: string,
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
      "pendingApprovals.status": "pending",
    })
      .populate("customerId", "name cpfCnpj")
      .populate("pendingApprovals.requestedBy", "name email")
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
    isAdmin: boolean = false,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    const subtotal = rental.pricing.subtotal;
    const discountPercent = (discount / subtotal) * 100;

    // Se desconto > 10% ou não for admin, requer aprovação
    if (discountPercent > 10 && !isAdmin) {
      return this.requestApproval(
        companyId,
        rentalId,
        "discount",
        {
          discount,
          reason: discountReason,
          previousValue: rental.pricing.discount.toString(),
          newValue: discount.toString(),
        },
        userId,
        `Desconto de ${discountPercent.toFixed(2)}% solicitado`,
      );
    }

    // Aplicar desconto diretamente se admin ou <= 10%
    rental.pricing.discount = discount;
    rental.pricing.discountReason = discountReason;
    rental.pricing.discountApprovedBy = isAdmin
      ? new mongoose.Types.ObjectId(userId)
      : undefined;
    rental.pricing.total = subtotal - discount + rental.pricing.lateFee;

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      "discount",
      rental.pricing.discount.toString(),
      discount.toString(),
      userId,
      discountReason,
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
    isAdmin: boolean = false,
  ): Promise<IRental | null> {
    const rental = await Rental.findOne({ _id: rentalId, companyId });

    if (!rental) {
      throw new Error("Rental not found");
    }

    if (itemIndex < 0 || itemIndex >= rental.items.length) {
      throw new Error("Item index out of range");
    }

    const item = rental.items[itemIndex];
    const previousRentalType = item.rentalType || "daily";

    // Se não for admin, requer aprovação
    if (!isAdmin) {
      return this.requestApproval(
        companyId,
        rentalId,
        "rental_type_change",
        {
          itemIndex,
          itemId: item.itemId.toString(),
          previousRentalType,
          newRentalType,
          previousValue: previousRentalType,
          newValue: newRentalType,
        },
        userId,
        `Alteração de tipo de aluguel de ${previousRentalType} para ${newRentalType}`,
      );
    }

    // Aplicar alteração diretamente se admin
    item.rentalType = newRentalType;

    // Recalcular preço do item seria necessário aqui
    // (precisa buscar o item do inventário)

    // Registrar no histórico
    await this.addChangeHistory(
      rental,
      "rental_type_change",
      previousRentalType,
      newRentalType,
      userId,
      `Alterado por admin`,
    );

    await rental.save();
    return rental;
  }
}

export const rentalService = new RentalService();
