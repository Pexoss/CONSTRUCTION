import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { companyService } from './company.service';

const CompanySettingsPage: React.FC = () => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['company-cpfcnpj-settings'],
    queryFn: () => companyService.getCpfCnpjSettings(),
  });

  const [cpfPackageId, setCpfPackageId] = useState('');
  const [cnpjPackageId, setCnpjPackageId] = useState('');
  const [token, setToken] = useState('');
  const [tokenTouched, setTokenTouched] = useState(false);

  useEffect(() => {
    if (data) {
      setCpfPackageId(data.cpfPackageId || '');
      setCnpjPackageId(data.cnpjPackageId || '');
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: () =>
      companyService.updateCpfCnpjSettings({
        ...(tokenTouched ? { token } : {}),
        cpfPackageId,
        cnpjPackageId,
      }),
    onSuccess: () => {
      setToken('');
      setTokenTouched(false);
      refetch();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <Layout title="Configurações da Empresa" backTo="/dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            CPF.CNPJ
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure o token e os pacotes usados para validação de CPF/CNPJ.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          {isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Status do token
                </label>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {data?.tokenConfigured ? 'Configurado' : 'Não configurado'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Token CPF.CNPJ
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value);
                    setTokenTouched(true);
                  }}
                  placeholder="Cole o token aqui"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setToken('');
                      setTokenTouched(true);
                    }}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remover token
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Para manter o token atual, deixe o campo vazio e não clique em remover.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Pacote CPF (ID)
                  </label>
                  <input
                    type="text"
                    value={cpfPackageId}
                    onChange={(e) => setCpfPackageId(e.target.value)}
                    placeholder="Ex: 1"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Pacote CNPJ (ID)
                  </label>
                  <input
                    type="text"
                    value={cnpjPackageId}
                    onChange={(e) => setCnpjPackageId(e.target.value)}
                    placeholder="Ex: 4"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              {updateMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {(updateMutation.error as any)?.response?.data?.message ||
                    'Erro ao salvar configurações'}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CompanySettingsPage;
