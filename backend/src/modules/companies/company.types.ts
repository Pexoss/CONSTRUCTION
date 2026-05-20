export interface CompanyInvoiceIssuer {
  _id?: string;
  label: string;
  /** Apenas dígitos (14) */
  cnpj: string;
  /** Início da numeração para este emissor (ex.: 1000); próximo = max(configurado, maior já usado + 1). */
  initialInvoiceNumber?: number;
}

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
  /** Emitentes cadastrados para numeração e PDF das faturas (CNPJ da empresa locadora). */
  invoiceIssuers?: CompanyInvoiceIssuer[];
  createdAt?: Date;
  updatedAt?: Date;
}
