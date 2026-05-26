import api from '../../config/api';

export interface CompanyInvoiceIssuerRow {
  id: string;
  label: string;
  cnpj: string;
  /** Primeiro número da série para este CNPJ emissor. */
  initialInvoiceNumber: number;
}

/** Fallback tipado para useQuery quando `data` ainda é undefined (evita `= []` como any[]). */
export const EMPTY_COMPANY_INVOICE_ISSUERS: CompanyInvoiceIssuerRow[] = [];

export interface CompanyCpfCnpjSettings {
  tokenConfigured: boolean;
  cpfPackageId: string;
  cnpjPackageId: string;
}

export const companyService = {
  getCpfCnpjSettings: async () => {
    const response = await api.get<{ success: boolean; data: CompanyCpfCnpjSettings }>(
      '/company/settings/cpfcnpj'
    );
    return response.data.data;
  },

  updateCpfCnpjSettings: async (payload: {
    token?: string;
    cpfPackageId?: string;
    cnpjPackageId?: string;
  }) => {
    const response = await api.patch<{ success: boolean; data: CompanyCpfCnpjSettings; message: string }>(
      '/company/settings/cpfcnpj',
      payload
    );
    return response.data;
  },

  getInvoiceIssuers: async (): Promise<CompanyInvoiceIssuerRow[]> => {
    const response = await api.get<{ success: boolean; data: CompanyInvoiceIssuerRow[] }>(
      '/company/invoice-issuers',
    );
    return response.data.data;
  },

  updateInvoiceIssuers: async (payload: {
    issuers: Array<{ id?: string; label: string; cnpj: string; initialInvoiceNumber?: number }>;
  }) => {
    const response = await api.put<{
      success: boolean;
      data: CompanyInvoiceIssuerRow[];
      message: string;
    }>('/company/invoice-issuers', payload);
    return response.data;
  },
};
