import api from '../../config/api';

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
};
