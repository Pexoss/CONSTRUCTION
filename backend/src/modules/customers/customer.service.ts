import { Customer } from "./customer.model";
import { ICustomer } from "./customer.types";
import mongoose from "mongoose";
import { Billing } from "../billings/billing.model";
import { Charge } from "../charges/charge.model";
import { cpfCnpjService } from "../../shared/services/cpfcnpj.service";
import { Company } from "../companies/company.model";
import {
  isValidCpfCnpj,
  normalizeDocument,
} from "../../shared/utils/document.utils";

class CustomerService {
  /**
   * Create a new customer
   */
  async createCustomer(companyId: string, data: any): Promise<ICustomer> {
    const { validateDocument, ...customerData } = data;

    // 1. Limpar o CPF/CNPJ para garantir que não venha lixo
    const cleanCpfCnpj = normalizeDocument(customerData.cpfCnpj);

    if (cleanCpfCnpj && !isValidCpfCnpj(cleanCpfCnpj)) {
      throw new Error("CPF/CNPJ inválido");
    }

    // 2. SÓ checa duplicidade se o CPF/CNPJ foi preenchido
    if (cleanCpfCnpj) {
      const existingCustomer = await Customer.findOne({
        companyId,
        cpfCnpj: cleanCpfCnpj,
      });

      if (existingCustomer) {
        throw new Error("Já existe um cliente cadastrado com este CPF/CNPJ");
      }
    }

    // 3. SÓ valida se o usuário pediu E se tem um documento para validar
    if (validateDocument && cleanCpfCnpj) {
      const company = await Company.findById(companyId).select(
        "cpfCnpjToken cpfCnpjCpfPackageId cpfCnpjCnpjPackageId",
      );

      const token = company?.cpfCnpjToken?.trim();
      if (!token) {
        const error = new Error(
          "Empresa não configurada para consulta de CPF/CNPJ",
        ) as any;
        error.statusCode = 403;
        throw error;
      }

      const lookup = await cpfCnpjService.lookupName(
        cleanCpfCnpj,
        token,
        {
          cpfPackageId: company?.cpfCnpjCpfPackageId?.trim(),
          cnpjPackageId: company?.cpfCnpjCnpjPackageId?.trim(),
        },
      );

      customerData.name = lookup.name;
      customerData.validated = {
        isValidated: true,
        validatedAt: new Date(),
        cpfName: lookup.name,
        additionalInfo: lookup.raw,
      };
    } else {
      // Se não for validar ou não tiver CPF, garante que o objeto validated não vá lixo
      customerData.validated = { isValidated: false };
    }

    // 4. Se o CPF veio vazio, garante que salve como undefined ou null
    // Isso evita erros de index UNIQUE no MongoDB (string vazia conta como valor)
    if (!cleanCpfCnpj) {
      delete customerData.cpfCnpj;  
    } else {
      customerData.cpfCnpj = cleanCpfCnpj;
    }

    const customer = await Customer.create({
      ...customerData,
      companyId,
    });

    return customer;
  }
  /**
   * Get all customers with filters
   */
  async getCustomers(
    companyId: string,
    filters: {
      search?: string;
      isBlocked?: boolean;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    customers: ICustomer[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query: any = { companyId };

    if (filters.isBlocked !== undefined) {
      query.isBlocked = filters.isBlocked;
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: "i" } },
        { cpfCnpj: { $regex: filters.search, $options: "i" } },
        { email: { $regex: filters.search, $options: "i" } },
        { phone: { $regex: filters.search, $options: "i" } },
      ];
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Customer.countDocuments(query),
    ]);

    return { customers, total, page, limit };
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(
    companyId: string,
    customerId: string,
  ): Promise<ICustomer | null> {
    return Customer.findOne({ _id: customerId, companyId });
  }

  /**
   * Update customer
   */
  async updateCustomer(
    companyId: string,
    customerId: string,
    data: any,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    const normalizedCpfCnpj =
      data.cpfCnpj !== undefined ? normalizeDocument(data.cpfCnpj) : undefined;

    if (data.cpfCnpj !== undefined && normalizedCpfCnpj && !isValidCpfCnpj(normalizedCpfCnpj)) {
      throw new Error("CPF/CNPJ inválido");
    }

    // If CPF/CNPJ is being updated, check for duplicates by normalized digits
    if (normalizedCpfCnpj && normalizedCpfCnpj !== customer.cpfCnpj) {
      const existingCustomer = await Customer.findOne({
        companyId,
        cpfCnpj: normalizedCpfCnpj,
        _id: { $ne: customerId },
      });

      if (existingCustomer) {
        throw new Error("Customer with this CPF/CNPJ already exists");
      }
    }
    if (data.cpfCnpj !== undefined) {
      if (normalizedCpfCnpj) data.cpfCnpj = normalizedCpfCnpj;
      else data.cpfCnpj = undefined;
    }

    Object.assign(customer, data);
    await customer.save();

    return customer;
  }

  /**
   * Delete customer (soft delete by blocking)
   */
  async deleteCustomer(companyId: string, customerId: string): Promise<void> {
    const result = await Customer.deleteOne({
      _id: customerId,
      companyId,
    });

    if (result.deletedCount === 0) {
      throw new Error("Customer not found");
    }
  }

  /**
   * Block/Unblock customer
   */
  async toggleBlockCustomer(
    companyId: string,
    customerId: string,
    isBlocked: boolean,
    blockReason?: string,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    customer.isBlocked = isBlocked;
    if (blockReason) {
      customer.blockReason = blockReason;
    }
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Adicionar endereço ao cliente
   */
  async addAddress(
    companyId: string,
    customerId: string,
    addressData: any,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    // Se não tiver endereços, inicializar array
    if (!customer.addresses) {
      customer.addresses = [];
    }
    addressData.type = addressData.type || "main";

    // Se for o primeiro endereço ou se isDefault for true, marcar como default
    if (customer.addresses.length === 0 || addressData.isDefault) {
      // Remover default de outros endereços
      customer.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
      addressData.isDefault = true;
    }

    customer.addresses.push(addressData);
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Atualizar endereço do cliente
   */
  async updateAddressById(
    companyId: string,
    customerId: string,
    addressId: string,
    addressData: any,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });
    if (!customer) throw new Error("Customer not found");
    if (!customer.addresses || customer.addresses.length === 0)
      throw new Error("No addresses found");

    const addr = customer.addresses.find(
      (a) => a._id?.toString() === addressId,
    );
    if (!addr) throw new Error("Address not found");
    addressData.type = addressData.type || addr.type || "main";

    // Se marcar como default, remove o default de outros
    if (addressData.isDefault) {
      customer.addresses.forEach((a) => {
        a.isDefault = a._id?.toString() === addressId;
      });
    }

    Object.assign(addr, addressData);
    await customer.save();
    return customer;
  }

  /**
   * NOVO: Remover endereço do cliente
   */
  /**
   * Remover endereço do cliente pelo _id do endereço
   */
  async removeAddressById(
    companyId: string,
    customerId: string,
    addressId: string,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.addresses || customer.addresses.length === 0) {
      throw new Error("No addresses found");
    }

    // Converter addressId para string para evitar problemas de tipo
    const addressIdStr = addressId.toString();

    const filteredAddresses = customer.addresses.filter(
      (addr) => addr._id && addr._id.toString() !== addressIdStr,
    );

    if (filteredAddresses.length === customer.addresses.length) {
      throw new Error("Address not found");
    }

    customer.addresses = filteredAddresses;

    // Se não houver endereço padrão, marcar o primeiro como default
    if (
      !customer.addresses.some((addr) => addr.isDefault) &&
      customer.addresses.length > 0
    ) {
      customer.addresses[0].isDefault = true;
    }

    await customer.save();

    return customer;
  }

  /**
   * NOVO: Adicionar obra ao cliente
   */
  async addWork(
    companyId: string,
    customerId: string,
    workData: any,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    // Validar que o addressIndex existe
    if (workData.addressIndex !== undefined) {
      if (
        !customer.addresses ||
        workData.addressIndex < 0 ||
        workData.addressIndex >= customer.addresses.length
      ) {
        throw new Error("Address index not found");
      }
    }

    // Se não tiver obras, inicializar array
    if (!customer.works) {
      customer.works = [];
    }

    // Criar workId se não fornecido
    if (!workData.workId) {
      workData.workId = new mongoose.Types.ObjectId();
    }

    customer.works.push({
      ...workData,
      activeRentals: workData.activeRentals || [],
      status: workData.status || "active",
    });

    await customer.save();

    return customer;
  }

  /**
   * NOVO: Atualizar obra do cliente
   */
  async updateWork(
    companyId: string,
    customerId: string,
    workId: string,
    workData: any,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.works) {
      throw new Error("Work not found");
    }

    const workIndex = customer.works.findIndex(
      (w) => w.workId.toString() === workId,
    );
    if (workIndex === -1) {
      throw new Error("Work not found");
    }

    // Validar addressIndex se fornecido
    if (workData.addressIndex !== undefined) {
      if (
        !customer.addresses ||
        workData.addressIndex < 0 ||
        workData.addressIndex >= customer.addresses.length
      ) {
        throw new Error("Address index not found");
      }
    }

    Object.assign(customer.works[workIndex], workData);
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Remover obra do cliente
   */
  async removeWork(
    companyId: string,
    customerId: string,
    workId: string,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.works) {
      throw new Error("Work not found");
    }

    const workIndex = customer.works.findIndex(
      (w) => w.workId.toString() === workId,
    );
    if (workIndex === -1) {
      throw new Error("Work not found");
    }

    // Verificar se há aluguéis ativos
    if (
      customer.works[workIndex].activeRentals &&
      customer.works[workIndex].activeRentals.length > 0
    ) {
      throw new Error("Cannot remove work with active rentals");
    }

    customer.works.splice(workIndex, 1);
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Adicionar aluguel ativo à obra
   */
  async addRentalToWork(
    companyId: string,
    customerId: string,
    workId: string,
    rentalId: string,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.works) {
      throw new Error("Work not found");
    }

    const work = customer.works.find((w) => w.workId.toString() === workId);
    if (!work) {
      throw new Error("Work not found");
    }

    if (!work.activeRentals) {
      work.activeRentals = [];
    }

    const rentalObjectId = new mongoose.Types.ObjectId(rentalId);
    if (!work.activeRentals.some((r) => r.toString() === rentalId)) {
      work.activeRentals.push(rentalObjectId);
      await customer.save();
    }

    return customer;
  }

  /**
   * NOVO: Remover aluguel ativo da obra
   */
  async removeRentalFromWork(
    companyId: string,
    customerId: string,
    workId: string,
    rentalId: string,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.works) {
      throw new Error("Work not found");
    }

    const work = customer.works.find((w) => w.workId.toString() === workId);
    if (!work) {
      throw new Error("Work not found");
    }

    if (work.activeRentals) {
      work.activeRentals = work.activeRentals.filter(
        (r) => r.toString() !== rentalId,
      );
      await customer.save();
    }

    return customer;
  }

  /**
   * NOVO: Atualizar dados validados pela Receita
   */
  async updateValidatedData(
    companyId: string,
    customerId: string,
    validatedData: any,
  ): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.validated) {
      customer.validated = {
        isValidated: false,
      };
    }

    customer.validated = {
      ...customer.validated,
      ...validatedData,
      isValidated: true,
      validatedAt: new Date(),
    };

    await customer.save();

    return customer;
  }

  /**
   * Resumo de pendências ao criar novo aluguel: cobranças em aberto já vencidas
   * (por data de vencimento da cobrança ou, se ausente, pelo último fim de período dos fechamentos vinculados);
   * fechamentos com período encerrado, sem cobrança nem fatura, ainda em aberto.
   */
  async getFinancialAlertsForNewRental(
    companyId: string,
    customerId: string,
  ): Promise<{
    overdueCharges: { count: number; totalOutstanding: number };
    overdueBillingsWithoutCharge: { count: number; totalOutstanding: number };
  }> {
    const companyOid = new mongoose.Types.ObjectId(companyId);
    const cid = new mongoose.Types.ObjectId(customerId);

    const exists = await Customer.exists({ _id: cid, companyId: companyOid });
    if (!exists) {
      throw new Error("Customer not found");
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const chargeCandidates = await Charge.find({
      companyId: companyOid,
      customerId: cid,
      status: { $in: ["pending", "partial"] },
      outstandingAmount: { $gt: 0.01 },
    })
      .select("dueDate billingIds outstandingAmount")
      .lean();

    const billingIdsForFallbackDue = new Set<string>();
    for (const c of chargeCandidates) {
      const hasDueDate = c.dueDate != null;
      if (!hasDueDate && Array.isArray(c.billingIds) && c.billingIds.length > 0) {
        for (const bid of c.billingIds) {
          if (bid) billingIdsForFallbackDue.add(String(bid));
        }
      }
    }

    const billingPeriodEndById = new Map<string, Date>();
    if (billingIdsForFallbackDue.size > 0) {
      const oidList = [...billingIdsForFallbackDue].filter((id) =>
        mongoose.isValidObjectId(id),
      );
      if (oidList.length > 0) {
        const linkedBillings = await Billing.find({
          companyId: companyOid,
          _id: { $in: oidList.map((id) => new mongoose.Types.ObjectId(id)) },
        })
          .select("periodEnd")
          .lean();
        for (const b of linkedBillings) {
          if (b.periodEnd) {
            billingPeriodEndById.set(String(b._id), new Date(b.periodEnd));
          }
        }
      }
    }

    const isOpenChargeOverdue = (c: (typeof chargeCandidates)[number]): boolean => {
      if (c.dueDate != null && c.dueDate !== undefined) {
        const due = new Date(c.dueDate as Date);
        if (Number.isNaN(due.getTime())) return false;
        const dueDayStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
        return dueDayStart < todayStart;
      }

      const ids = Array.isArray(c.billingIds) ? c.billingIds : [];
      let maxPeriodEnd: Date | null = null;
      for (const bid of ids) {
        if (!bid) continue;
        const pe = billingPeriodEndById.get(String(bid));
        if (!pe || Number.isNaN(pe.getTime())) continue;
        if (!maxPeriodEnd || pe.getTime() > maxPeriodEnd.getTime()) maxPeriodEnd = pe;
      }
      if (!maxPeriodEnd) return false;
      const endDayStart = new Date(
        maxPeriodEnd.getFullYear(),
        maxPeriodEnd.getMonth(),
        maxPeriodEnd.getDate(),
      );
      return endDayStart < todayStart;
    };

    let overdueChargesCount = 0;
    let overdueChargesTotal = 0;
    for (const c of chargeCandidates) {
      if (isOpenChargeOverdue(c)) {
        overdueChargesCount += 1;
        overdueChargesTotal += Number(c.outstandingAmount ?? 0);
      }
    }

    const billingCandidates = await Billing.find({
      companyId: companyOid,
      customerId: cid,
      status: { $nin: ["paid", "cancelled"] },
      periodEnd: { $lt: now },
      $and: [
        { $or: [{ chargeId: null }, { chargeId: { $exists: false } }] },
        { $or: [{ invoiceId: null }, { invoiceId: { $exists: false } }] },
      ],
    })
      .select("outstandingAmount calculation.total")
      .lean();

    let billingsCount = 0;
    let billingsTotal = 0;
    for (const b of billingCandidates) {
      const outstanding = Number(b.outstandingAmount ?? b.calculation?.total ?? 0);
      if (outstanding <= 0.01) continue;
      billingsCount += 1;
      billingsTotal += outstanding;
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      overdueCharges: {
        count: overdueChargesCount,
        totalOutstanding: round2(overdueChargesTotal),
      },
      overdueBillingsWithoutCharge: {
        count: billingsCount,
        totalOutstanding: round2(billingsTotal),
      },
    };
  }
}

export const customerService = new CustomerService();
