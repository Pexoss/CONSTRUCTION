import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { companyService, CompanyInvoiceIssuerRow } from './company.service';

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

  const issuerQuery = useQuery({
    queryKey: ['company-invoice-issuers-settings'],
    queryFn: () => companyService.getInvoiceIssuers(),
  });

  const [issuerDraft, setIssuerDraft] = useState<
    Array<{ id?: string; label: string; cnpj: string; initialInvoiceNumber: number }>
  >([{ label: '', cnpj: '', initialInvoiceNumber: 1 }]);

  const [issuerSaveFeedback, setIssuerSaveFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const issuerSaveFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (issuerSaveFeedbackTimeoutRef.current) clearTimeout(issuerSaveFeedbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (issuerQuery.data && issuerQuery.data.length > 0) {
      setIssuerDraft(
        issuerQuery.data.map((r: CompanyInvoiceIssuerRow) => ({
          id: r.id,
          label: r.label || '',
          cnpj: r.cnpj || '',
          initialInvoiceNumber:
            typeof r.initialInvoiceNumber === 'number' && Number.isFinite(r.initialInvoiceNumber)
              ? Math.max(1, Math.floor(r.initialInvoiceNumber))
              : 1,
        })),
      );
    }
  }, [issuerQuery.data]);

  const saveIssuersMutation = useMutation({
    mutationFn: () =>
      companyService.updateInvoiceIssuers({
        issuers: issuerDraft
          .filter((row) => row.label.trim() && row.cnpj.replace(/\D/g, '').length === 14)
          .map((row) => ({
            id: row.id,
            label: row.label.trim(),
            cnpj: row.cnpj,
            initialInvoiceNumber: Math.max(1, Math.floor(row.initialInvoiceNumber || 1)),
          })),
      }),
    onMutate: () => {
      if (issuerSaveFeedbackTimeoutRef.current) {
        clearTimeout(issuerSaveFeedbackTimeoutRef.current);
        issuerSaveFeedbackTimeoutRef.current = null;
      }
      setIssuerSaveFeedback(null);
    },
    onSuccess: (res) => {
      const text = res.message?.trim() || 'Emissores salvos com sucesso.';
      setIssuerSaveFeedback({ type: 'success', text });
      issuerQuery.refetch();
      issuerSaveFeedbackTimeoutRef.current = setTimeout(() => {
        setIssuerSaveFeedback(null);
        issuerSaveFeedbackTimeoutRef.current = null;
      }, 5000);
    },
    onError: (error) => {
      const text =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Não foi possível salvar os emissores.';
      setIssuerSaveFeedback({ type: 'error', text });
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

        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Emissores de fatura (CNPJ da locadora)
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Mais de um CNPJ pode ser cadastrado. Ao gerar a fatura você escolhe qual usar; o número sequencial é
            independente para cada um. Defina o número inicial da série por CNPJ abaixo.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          {issuerQuery.isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Carregando emissores...</p>
          ) : (
            <div className="space-y-4">
              {issuerDraft.map((row, idx) => (
                <div key={row.id ?? `new-${idx}`} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Nome (ex.: Matriz — Filial SP)
                    </label>
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => {
                        const v = e.target.value;
                        setIssuerDraft((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, label: v } : r)),
                        );
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                      placeholder="Identificação interna"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      CNPJ (14 dígitos)
                    </label>
                    <input
                      type="text"
                      value={row.cnpj}
                      onChange={(e) => {
                        const v = e.target.value;
                        setIssuerDraft((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, cnpj: v } : r)),
                        );
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                      placeholder="Somente números"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      Nº inicial fatura
                    </label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={row.initialInvoiceNumber}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        const v = Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
                        setIssuerDraft((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, initialInvoiceNumber: v } : r)),
                        );
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
                      placeholder="1000"
                    />
                  </div>
                  <div className="md:col-span-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIssuerDraft((prev) => prev.filter((_, i) => i !== idx))}
                      className="px-3 py-2 text-sm rounded-lg border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      disabled={issuerDraft.length <= 1}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    setIssuerDraft((prev) => [...prev, { label: '', cnpj: '', initialInvoiceNumber: 1 }])
                  }
                  className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600"
                >
                  Adicionar CNPJ
                </button>
                <button
                  type="button"
                  disabled={saveIssuersMutation.isPending}
                  onClick={() => saveIssuersMutation.mutate()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saveIssuersMutation.isPending ? 'Salvando...' : 'Salvar emissores'}
                </button>
              </div>
              {issuerSaveFeedback ? (
                <p
                  role="status"
                  className={
                    issuerSaveFeedback.type === 'success'
                      ? 'text-sm text-green-700 dark:text-green-400'
                      : 'text-sm text-red-600 dark:text-red-400'
                  }
                >
                  {issuerSaveFeedback.text}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CompanySettingsPage;
