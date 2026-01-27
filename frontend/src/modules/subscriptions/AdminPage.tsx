import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionService } from './subscription.service';
import Layout from '../../components/Layout';

type Plan = 'basic' | 'pro' | 'enterprise';

interface PaymentFormData {
  companyId: string;
  amount: number;
  plan: Plan;
  dueDate: string;
}

const AdminPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    companyId: '',
    amount: 0,
    plan: 'basic',
    dueDate: '',
  });

  const { data: companiesData } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: async () => {
      console.log('[QUERY] Buscando empresas...');
      const res = await subscriptionService.getAllCompanies();
      console.log('[QUERY] Empresas response:', res);
      return res;
    },
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['admin-payments', selectedCompany],
    queryFn: async () => {
      console.log('[QUERY] Buscando pagamentos:', selectedCompany);
      const res = await subscriptionService.getCompanyPayments(selectedCompany);
      console.log('[QUERY] Pagamentos response:', res);
      return res;
    },
    enabled: !!selectedCompany,
  });

  const { data: metricsData } = useQuery({
    queryKey: ['company-metrics', selectedCompany],
    queryFn: async () => {
      console.log('[QUERY] Buscando métricas:', selectedCompany);
      const res = await subscriptionService.getCompanyMetrics(selectedCompany);
      console.log('[QUERY] Métricas response:', res);
      return res;
    },
    enabled: !!selectedCompany,
  });

  const { data: upcomingPayments } = useQuery({
    queryKey: ['upcoming-payments'],
    queryFn: async () => {
      console.log('[QUERY] Buscando pagamentos próximos...');
      return subscriptionService.getUpcomingPayments(7);
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      console.log('[MUTATION] Criando pagamento:', data);
      return subscriptionService.createPayment(data);
    },
    onSuccess: () => {
      console.log('[MUTATION] Pagamento criado com sucesso');
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      setShowPaymentModal(false);
    },
    onError: (err) => {
      console.error('[MUTATION] Erro ao criar pagamento:', err);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ paymentId, companyId }: { paymentId: string; companyId: string }) => {
      console.log('[MUTATION] Marcando como pago:', paymentId);
      return subscriptionService.markPaymentAsPaid(paymentId, companyId, {
        paidDate: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
  });

  // sempre que selecionar empresa, sincroniza com o form
  useEffect(() => {
    if (selectedCompany) {
      setPaymentData((prev) => ({
        ...prev,
        companyId: selectedCompany,
      }));
    }
  }, [selectedCompany]);

  // reset ao fechar modal
  useEffect(() => {
    if (!showPaymentModal) {
      setPaymentData({
        companyId: selectedCompany || '',
        amount: 0,
        plan: 'basic',
        dueDate: '',
      });
    }
  }, [showPaymentModal, selectedCompany]);


  const companies = companiesData?.data || [];
  const payments = paymentsData?.data || [];
  const metrics = metricsData?.data;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      suspended: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPlanLabel = (plan: string) => {
    const labels: Record<string, string> = {
      basic: 'Básico',
      pro: 'Pro',
      enterprise: 'Enterprise',
    };
    return labels[plan] || plan;
  };

  const handleCreatePayment = () => {
    if (!paymentData.companyId) {
      console.error('Empresa não selecionada');
      return;
    }

    createPaymentMutation.mutate(paymentData);
  };
  
  const handleDeleteCompany = async (companyId: string) => {
    const confirmed = window.confirm(
      'Tem certeza que deseja excluir esta empresa? Essa ação não pode ser desfeita.'
    );

    if (!confirmed) return;

    try {
      await subscriptionService.deleteCompany(companyId);
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });

      if (selectedCompany === companyId) {
        setSelectedCompany('');
      }
    } catch (error) {
      alert('Erro ao excluir empresa');
    }
  };

  return (
    <Layout title="Administração" backTo="/dashboard">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Administração</h1>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            + Novo Pagamento
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* EMPRESAS */}
          <div className="lg:col-span-2 bg-white rounded shadow p-4">
            {companies.map((company) => (
              <div
                key={company._id}
                onClick={() => setSelectedCompany(company._id)}
                className={`p-3 border rounded cursor-pointer mb-2 transition
        ${selectedCompany === company._id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'hover:bg-gray-50'}
      `}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{company.name}</div>
                    <div className="text-sm text-gray-500">{company.email}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs rounded ${getStatusColor(
                        company.subscription.status
                      )}`}
                    >
                      {company.subscription.status}
                    </span>

                    {/* BOTÃO DE DELETAR */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCompany(company._id);
                      }}
                      className="
              text-red-600
              hover:text-red-800
              text-xs
              font-medium
            "
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="text-sm mt-1">
                  Plano: {getPlanLabel(company.subscription.plan)}
                </div>
              </div>
            ))}
          </div>


          {/* MÉTRICAS */}
          <div className="bg-white rounded shadow p-4">
            {selectedCompany && metrics ? (
              <>
                <h3 className="font-semibold mb-2">Métricas</h3>
                <div className="space-y-2 text-sm">
                  <div>Aluguéis: {metrics.totalRentals}</div>
                  <div>Clientes: {metrics.totalCustomers}</div>
                  <div className="text-green-600">
                    Receita: R$ {metrics.revenue.toFixed(2)}
                  </div>
                  <div className="text-red-600">
                    Despesas: R$ {metrics.expenses.toFixed(2)}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-gray-500">Selecione uma empresa</p>
            )}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-full max-w-md">
            <h2 className="text-lg font-bold mb-4">Novo Pagamento</h2>

            <form onSubmit={handleCreatePayment} className="space-y-4">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="companyId"
                  className="text-sm font-medium text-gray-700"
                >
                  Empresa
                </label>

                <select
                  id="companyId"
                  value={paymentData.companyId}
                  onChange={(e) =>
                    setPaymentData(prev => ({
                      ...prev,
                      companyId: e.target.value,
                    }))
                  }
                  className="
      w-full
      rounded-lg
      border
      border-gray-300
      bg-white
      px-3
      py-2
      text-sm
      text-gray-800
      shadow-sm
      focus:border-indigo-500
      focus:outline-none
      focus:ring-2
      focus:ring-indigo-500/30
    "
                >
                  <option value="" disabled>
                    Selecione uma empresa
                  </option>

                  {companies.map(company => (
                    <option key={company._id} value={company._id}>
                      {company.name} — {company.cnpj}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm">Valor</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, amount: Number(e.target.value) })
                  }
                  className="w-full border px-2 py-1 rounded"
                />
              </div>

              <div>
                <label className="block text-sm">Plano</label>
                <select
                  value={paymentData.plan}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, plan: e.target.value as Plan })
                  }
                  className="w-full border px-2 py-1 rounded"
                >
                  <option value="basic">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-sm">Vencimento</label>
                <input
                  type="date"
                  value={paymentData.dueDate}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, dueDate: e.target.value })
                  }
                  className="w-full border px-2 py-1 rounded"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-3 py-1 border rounded"
                >
                  Cancelar
                </button>
                <button type="submit" className="px-3 py-1 bg-indigo-600 text-white rounded">
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default AdminPage;
