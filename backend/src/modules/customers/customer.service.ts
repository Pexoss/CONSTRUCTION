import { Customer } from './customer.model';
import { ICustomer } from './customer.types';

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
  async toggleBlockCustomer(companyId: string, customerId: string, isBlocked: boolean): Promise<ICustomer | null> {
    const customer = await Customer.findOne({ _id: customerId, companyId });

    if (!customer) {
      throw new Error('Customer not found');
    }

    customer.isBlocked = isBlocked;
    await customer.save();

    return customer;
  }
}

export const customerService = new CustomerService();
