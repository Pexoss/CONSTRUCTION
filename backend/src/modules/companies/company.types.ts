export interface ICompany {
  _id?: string;
  name: string;
  cnpj: string;
  email: string;
  phone?: string;
  code?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  subscription: {
    plan: 'basic' | 'pro' | 'enterprise';
    status: 'active' | 'suspended' | 'cancelled';
    paymentDueDate?: Date;
    lastPaymentDate?: Date;
  };
  cpfCnpjToken?: string;
  cpfCnpjCpfPackageId?: string;
  cpfCnpjCnpjPackageId?: string;
  settings?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}
