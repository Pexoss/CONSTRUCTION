import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionService } from './subscription.service';

const AdminPage: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    companyId: '',
    amount: 0,
    plan: 'basic' as 'basic' | 'pro' | 'enterprise',
    dueDate: '',
  });

  const queryClient = useQueryClient();

  const { data: companiesData } = useQuery({
    queryKey: ['admin-companies'],
    queryFn: () => subscriptionService.getAllCompanies(),
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['admin-payments', selectedCompany],
    queryFn: () => subscriptionService.getCompanyPayments(selectedCompany),
    enabled: !!selectedCompany,
  });

  const { data: metricsData } = useQuery({
    queryKey: ['company-metrics', selectedCompany],
    queryFn: () => subscriptionService.getCompanyMetrics(selectedCompany),
    enabled: !!selectedCompany,
  });

  const { data: upcomingPayments } = useQuery({
    queryKey: ['upcoming-payments'],
    queryFn: () => subscriptionService.getUpcomingPayments(7),
  });

  const createPaymentMutation = useMutation({
    mutationFn: (data: any) => subscriptionService.createPayment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      setShowPaymentModal(false);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ paymentId, companyId }: { paymentId: string; companyId: string }) =>
      subscriptionService.markPaymentAsPaid(paymentId, companyId, { paidDate: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    },
  });

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

  const companies = companiesData?.data || [];
  const payments = paymentsData?.data || [];
  const metrics = metricsData?.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Administração</h1>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              + Novo Pagamento
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upcoming Payments Alert */}
        {upcomingPayments && upcomingPayments.data && upcomingPayments.data.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">
              {upcomingPayments.count} pagamento(s) próximo(s) do vencimento
            </h3>
            <div className="space-y-1">
              {upcomingPayments.data.slice(0, 3).map((payment) => (
                <div key={payment._id} className="text-sm text-yellow-700">
                  {payment.dueDate} - R$ {payment.amount.toFixed(2)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Companies List */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Empresas</h2>
              <div className="space-y-2">
                {companies.map((company) => (
                  <div
                    key={company._id}
                    onClick={() => setSelectedCompany(company._id)}
                    className={`p-4 border rounded-md cursor-pointer hover:bg-gray-50 ${
                      selectedCompany === company._id ? 'border-indigo-500 bg-indigo-50' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">{company.name}</div>
                        <div className="text-sm text-gray-500">{company.email}</div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          company.subscription.status
                        )}`}
                      >
                        {company.subscription.status}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-600">
                      Plano: {getPlanLabel(company.subscription.plan)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Company Details */}
          <div className="bg-white rounded-lg shadow p-6">
            {selectedCompany && metrics ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Métricas</h2>
                <div className="space-y-4">
                  <div>
                    <div className="text-sm text-gray-500">Aluguéis</div>
                    <div className="text-2xl font-bold">{metrics.totalRentals}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Clientes</div>
                    <div className="text-2xl font-bold">{metrics.totalCustomers}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Receitas</div>
                    <div className="text-2xl font-bold text-green-600">R$ {metrics.revenue.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Despesas</div>
                    <div className="text-2xl font-bold text-red-600">R$ {metrics.expenses.toFixed(2)}</div>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Histórico de Pagamentos</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {payments.map((payment) => (
                      <div key={payment._id} className="p-2 border rounded text-sm">
                        <div className="flex justify-between">
                          <span>R$ {payment.amount.toFixed(2)}</span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              payment.status === 'paid'
                                ? 'bg-green-100 text-green-800'
                                : payment.status === 'overdue'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {payment.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(payment.dueDate).toLocaleDateString('pt-BR')}
                        </div>
                        {payment.status !== 'paid' && (
                          <button
                            onClick={() => markPaidMutation.mutate({ paymentId: payment._id, companyId: selectedCompany })}
                            className="mt-1 text-xs text-indigo-600 hover:text-indigo-900"
                          >
                            Marcar como Pago
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-center">Selecione uma empresa</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Novo Pagamento</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPaymentMutation.mutate(paymentData);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                <select
                  required
                  value={paymentData.companyId}
                  onChange={(e) => setPaymentData({ ...paymentData, companyId: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Selecione uma empresa</option>
                  {companies.map((company) => (
                    <option key={company._id} value={company._id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                <select
                  required
                  value={paymentData.plan}
                  onChange={(e) => setPaymentData({ ...paymentData, plan: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="basic">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento</label>
                <input
                  type="date"
                  required
                  value={paymentData.dueDate}
                  onChange={(e) => setPaymentData({ ...paymentData, dueDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;
