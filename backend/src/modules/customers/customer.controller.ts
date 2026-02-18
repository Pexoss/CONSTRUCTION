import { Request, Response, NextFunction } from 'express';
import { customerService } from './customer.service';
import { createCustomerSchema, updateCustomerSchema, validateCustomerDocumentSchema } from './customer.validator';
import { cpfCnpjService } from '../../shared/services/cpfcnpj.service';

export class CustomerController {
  /**
   * Create a new customer
   * POST /api/customers
   */
  async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const validatedData = createCustomerSchema.parse(req.body);
      const customer = await customerService.createCustomer(companyId, validatedData);

      res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all customers with filters
   * GET /api/customers
   */
  async getCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const filters = {
        search: req.query.search as string,
        isBlocked: req.query.isBlocked === 'true' ? true : req.query.isBlocked === 'false' ? false : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await customerService.getCustomers(companyId, filters);

      res.json({
        success: true,
        data: result.customers,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get customer by ID
   * GET /api/customers/:id
   */
  async getCustomerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const customer = await customerService.getCustomerById(companyId, customerId);

      if (!customer) {
        res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
        return;
      }

      res.json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update customer
   * PUT /api/customers/:id
   */
  async updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const validatedData = updateCustomerSchema.parse(req.body);
      const customer = await customerService.updateCustomer(companyId, customerId, validatedData);

      if (!customer) {
        res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Customer updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete customer (soft delete by blocking)
   * DELETE /api/customers/:id
   */
  async deleteCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;

      await customerService.deleteCustomer(companyId, customerId);

      res.json({
        success: true,
        message: 'Customer deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Block/Unblock customer
   * PATCH /api/customers/:id/block
   */
  async toggleBlockCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const { isBlocked } = req.body;

      if (typeof isBlocked !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'isBlocked must be a boolean',
        });
        return;
      }

      const customer = await customerService.toggleBlockCustomer(companyId, customerId, isBlocked);

      if (!customer) {
        res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
        return;
      }

      res.json({
        success: true,
        message: `Customer ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Adicionar endereço ao cliente
   * POST /api/customers/:id/addresses
   */
  async addAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const customer = await customerService.addAddress(companyId, customerId, req.body);

      res.status(201).json({
        success: true,
        message: 'Address added successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Atualizar endereço do cliente
   * PUT /api/customers/:id/addresses/:index
   */
  async updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const addressId = req.params.addressId; // antes era req.params.index
      const customer = await customerService.updateAddressById(companyId, customerId, addressId, req.body);

      res.json({
        success: true,
        message: 'Address updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remover endereço do cliente
   */
  async removeAddressById(req: Request, res: Response) {
    try {
      const { id: customerId, addressId } = req.params;
      const companyId = req.companyId!; // ou como você pega o tenant

      const customer = await customerService.removeAddressById(companyId, customerId, addressId);

      res.json({ success: true, customer });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * NOVO: Adicionar obra ao cliente
   * POST /api/customers/:id/works
   */
  async addWork(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const customer = await customerService.addWork(companyId, customerId, req.body);

      res.status(201).json({
        success: true,
        message: 'Work added successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Atualizar obra do cliente
   * PUT /api/customers/:id/works/:workId
   */
  async updateWork(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const workId = req.params.workId;
      const customer = await customerService.updateWork(companyId, customerId, workId, req.body);

      res.json({
        success: true,
        message: 'Work updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Remover obra do cliente
   * DELETE /api/customers/:id/works/:workId
   */
  async removeWork(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const workId = req.params.workId;
      const customer = await customerService.removeWork(companyId, customerId, workId);

      res.json({
        success: true,
        message: 'Work removed successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Atualizar dados validados pela Receita
   * POST /api/customers/:id/validate
   */
  async updateValidatedData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.companyId!;
      const customerId = req.params.id;
      const customer = await customerService.updateValidatedData(companyId, customerId, req.body);

      res.json({
        success: true,
        message: 'Validated data updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Validar CPF/CNPJ e retornar nome
   * POST /api/customers/validate-document
   */
  async validateDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cpfCnpj } = validateCustomerDocumentSchema.parse(req.body);
      const result = await cpfCnpjService.lookupName(cpfCnpj);

      res.json({
        success: true,
        data: {
          cpfCnpj: result.cpfCnpj,
          documentType: result.documentType,
          name: result.name,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * NOVO: Consultar saldo do pacote CPF/CNPJ
   * GET /api/customers/validate-document/balance?cpfCnpj=...
   */
  async getDocumentBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cpfCnpj = String(req.query.cpfCnpj || '');
      if (!cpfCnpj) {
        res.status(400).json({
          success: false,
          message: 'cpfCnpj is required',
        });
        return;
      }

      const result = await cpfCnpjService.getBalanceByDocument(cpfCnpj);

      res.json({
        success: true,
        data: {
          documentType: result.documentType,
          packageId: result.packageId,
          balance: result.balance,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const customerController = new CustomerController();
