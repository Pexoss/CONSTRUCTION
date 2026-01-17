import { Customer } from './customer.model';
import { ICustomer } from './customer.types';
import mongoose from 'mongoose';

class CustomerService {
  /**
   * Create a new customer
   */
  async createCustomer(companyId: string, data: any): Promise<ICustomer> {
    // Check if CPF/CNPJ already exists for this company
    const existingCustomer = await Customer.findOne({
      companyId,
      cpfCnpj: data.cpfCnpj,
    });

    if (existingCustomer) {
      throw new Error('Customer with this CPF/CNPJ already exists');
    }

    const customer = await Customer.create({
      ...data,
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
    } = {}
  ): Promise<{ customers: ICustomer[]; total: number; page: number; limit: number }> {
    const query: any = { companyId };

    if (filters.isBlocked !== undefined) {
      query.isBlocked = filters.isBlocked;
    }

    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { cpfCnpj: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { phone: { $regex: filters.search, $options: 'i' } },
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
  async getCustomerById(companyId: string, customerId: string): Promise<ICustomer | null> {
    return Customer.findOne({ _id: customerId, companyId });
  }

  /**
   * Update customer
   */
  async updateCustomer(companyId: string, customerId: string, data: any): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // If CPF/CNPJ is being updated, check for duplicates
    if (data.cpfCnpj && data.cpfCnpj !== customer.cpfCnpj) {
      const existingCustomer = await Customer.findOne({
        companyId,
        cpfCnpj: data.cpfCnpj,
        _id: { $ne: customerId },
      });

      if (existingCustomer) {
        throw new Error('Customer with this CPF/CNPJ already exists');
      }
    }

    Object.assign(customer, data);
    await customer.save();

    return customer;
  }

  /**
   * Delete customer (soft delete by blocking)
   */
  async deleteCustomer(companyId: string, customerId: string): Promise<boolean> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    customer.isBlocked = true;
    await customer.save();

    return true;
  }

  /**
   * Block/Unblock customer
   */
  async toggleBlockCustomer(companyId: string, customerId: string, isBlocked: boolean, blockReason?: string): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
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
  async addAddress(companyId: string, customerId: string, addressData: any): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Se não tiver endereços, inicializar array
    if (!customer.addresses) {
      customer.addresses = [];
    }

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
  async updateAddress(companyId: string, customerId: string, addressIndex: number, addressData: any): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.addresses || addressIndex < 0 || addressIndex >= customer.addresses.length) {
      throw new Error('Address not found');
    }

    // Se marcar como default, remover default de outros
    if (addressData.isDefault) {
      customer.addresses.forEach((addr, idx) => {
        if (idx !== addressIndex) {
          addr.isDefault = false;
        }
      });
    }

    Object.assign(customer.addresses[addressIndex], addressData);
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Remover endereço do cliente
   */
  async removeAddress(companyId: string, customerId: string, addressIndex: number): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.addresses || addressIndex < 0 || addressIndex >= customer.addresses.length) {
      throw new Error('Address not found');
    }

    customer.addresses.splice(addressIndex, 1);

    // Se o endereço removido era o default, marcar o primeiro como default
    if (customer.addresses.length > 0 && !customer.addresses.some((addr) => addr.isDefault)) {
      customer.addresses[0].isDefault = true;
    }

    await customer.save();

    return customer;
  }

  /**
   * NOVO: Adicionar obra ao cliente
   */
  async addWork(companyId: string, customerId: string, workData: any): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Validar que o addressIndex existe
    if (workData.addressIndex !== undefined) {
      if (!customer.addresses || workData.addressIndex < 0 || workData.addressIndex >= customer.addresses.length) {
        throw new Error('Address index not found');
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
      status: workData.status || 'active',
    });

    await customer.save();

    return customer;
  }

  /**
   * NOVO: Atualizar obra do cliente
   */
  async updateWork(companyId: string, customerId: string, workId: string, workData: any): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.works) {
      throw new Error('Work not found');
    }

    const workIndex = customer.works.findIndex((w) => w.workId.toString() === workId);
    if (workIndex === -1) {
      throw new Error('Work not found');
    }

    // Validar addressIndex se fornecido
    if (workData.addressIndex !== undefined) {
      if (!customer.addresses || workData.addressIndex < 0 || workData.addressIndex >= customer.addresses.length) {
        throw new Error('Address index not found');
      }
    }

    Object.assign(customer.works[workIndex], workData);
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Remover obra do cliente
   */
  async removeWork(companyId: string, customerId: string, workId: string): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.works) {
      throw new Error('Work not found');
    }

    const workIndex = customer.works.findIndex((w) => w.workId.toString() === workId);
    if (workIndex === -1) {
      throw new Error('Work not found');
    }

    // Verificar se há aluguéis ativos
    if (customer.works[workIndex].activeRentals && customer.works[workIndex].activeRentals.length > 0) {
      throw new Error('Cannot remove work with active rentals');
    }

    customer.works.splice(workIndex, 1);
    await customer.save();

    return customer;
  }

  /**
   * NOVO: Adicionar aluguel ativo à obra
   */
  async addRentalToWork(companyId: string, customerId: string, workId: string, rentalId: string): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.works) {
      throw new Error('Work not found');
    }

    const work = customer.works.find((w) => w.workId.toString() === workId);
    if (!work) {
      throw new Error('Work not found');
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
  async removeRentalFromWork(companyId: string, customerId: string, workId: string, rentalId: string): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.works) {
      throw new Error('Work not found');
    }

    const work = customer.works.find((w) => w.workId.toString() === workId);
    if (!work) {
      throw new Error('Work not found');
    }

    if (work.activeRentals) {
      work.activeRentals = work.activeRentals.filter((r) => r.toString() !== rentalId);
      await customer.save();
    }

    return customer;
  }

  /**
   * NOVO: Atualizar dados validados pela Receita
   */
  async updateValidatedData(companyId: string, customerId: string, validatedData: any): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
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
}

export const customerService = new CustomerService();
