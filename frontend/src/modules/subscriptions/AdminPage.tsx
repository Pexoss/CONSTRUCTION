import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subscriptionService } from "./subscription.service";
import Layout from "../../components/Layout";

type Plan = "basic" | "pro" | "enterprise";

interface PaymentFormData {
  companyId: string;
  amount: number;
  plan: Plan;
  dueDate: string;
}

const AdminPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    companyId: "",
    amount: 0,
    plan: "basic",
    dueDate: "",
  });

  const { data: companiesData } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const res = await subscriptionService.getAllCompanies();
      return res;
    },
  });

  const { data: paymentsData } = useQuery({
    queryKey: ["admin-payments", selectedCompany],
    queryFn: async () => {
      const res = await subscriptionService.getCompanyPayments(selectedCompany);
      return res;
    },
    enabled: !!selectedCompany,
  });

  const { data: metricsData } = useQuery({
    queryKey: ["company-metrics", selectedCompany],
    queryFn: async () => {
      const res = await subscriptionService.getCompanyMetrics(selectedCompany);
      return res;
    },
    enabled: !!selectedCompany,
  });

  const { data: upcomingPayments } = useQuery({
    queryKey: ["upcoming-payments"],
    queryFn: async () => {
      return subscriptionService.getUpcomingPayments(7);
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      return subscriptionService.createPayment(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-payments", selectedCompany],
      });
      setShowPaymentModal(false);
    },
    onError: (err) => {
      return err;
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: ({
      paymentId,
      companyId,
    }: {
      paymentId: string;
      companyId: string;
    }) => {
      return subscriptionService.markPaymentAsPaid(paymentId, companyId, {
        paidDate: new Date().toISOString(),
      });
    },
    onSuccess: ({ payment, company }) => {
      // Atualiza as queries
      queryClient.invalidateQueries({
        queryKey: ["admin-payments", company._id],
      });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({
        queryKey: ["company-metrics", company._id],
      });
    },
    onError: (err: any) => {
      alert(
        err.response?.data?.message ||
          err.message ||
          "Erro ao atualizar pagamento",
      );
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
        companyId: selectedCompany || "",
        amount: 0,
        plan: "basic",
        dueDate: "",
      });
    }
  }, [showPaymentModal, selectedCompany]);

  const companies = companiesData?.data || [];
  const payments = paymentsData?.data || [];
  const metrics = metricsData?.data;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      suspended: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPlanLabel = (plan: string) => {
    const labels: Record<string, string> = {
      basic: "Básico",
      pro: "Pro",
      enterprise: "Enterprise",
    };
    return labels[plan] || plan;
  };

  const handleCreatePayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!paymentData.companyId) {
      return;
    }

    const payload = {
      ...paymentData,
      dueDate: new Date(paymentData.dueDate).toISOString(),
    };

    createPaymentMutation.mutate(payload);
  };

  const handleDeleteCompany = async (companyId: string) => {
    const confirmed = window.confirm(
      "Tem certeza que deseja excluir esta empresa? Essa ação não pode ser desfeita.",
    );
    if (!confirmed) return;

    try {
      await subscriptionService.deleteCompany(companyId);
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });

      if (selectedCompany === companyId) {
        setSelectedCompany("");
      }

      alert("Empresa deletada com sucesso!");
    } catch (error: any) {
      // Captura a mensagem do backend
      const message =
        error.response?.data?.message ||
        error.message ||
        "Erro ao excluir empresa";
      alert(message);
    }
  };
  return (
    <Layout title="Administração" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Administração
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Gerencie empresas e assinaturas
              </p>
            </div>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Novo Pagamento
            </button>
          </div>

          {/* Grid Principal */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* EMPRESAS E PAGAMENTOS */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              {/* LISTA DE EMPRESAS */}
              <div className="space-y-2">
                {companies.map((company) => (
                  <div
                    key={company._id}
                    onClick={() => setSelectedCompany(company._id)}
                    className={`
                    p-4 border rounded-lg cursor-pointer transition-all
                    ${
                      selectedCompany === company._id
                        ? "border-gray-900 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50"
                        : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }
                  `}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {company.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                          {company.email}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full border ${getStatusColor(
                            company.subscription.status,
                          )}`}
                        >
                          {company.subscription.status}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCompany(company._id);
                          }}
                          className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-medium px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                      Plano: {getPlanLabel(company.subscription.plan)}
                    </div>
                  </div>
                ))}
              </div>

              {/* PAGAMENTOS DA EMPRESA SELECIONADA */}
              {selectedCompany && payments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Pagamentos
                  </h3>

                  <div className="space-y-3">
                    {payments.map((payment) => (
                      <div
                        key={payment._id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            Plano: {getPlanLabel(payment.plan)}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Status: {payment.status}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            Vencimento:{" "}
                            {new Date(payment.dueDate).toLocaleDateString(
                              "pt-BR",
                            )}
                          </div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                            Valor: R$ {payment.amount.toFixed(2)}
                          </div>
                        </div>

                        {payment.status !== "paid" && (
                          <button
                            onClick={() =>
                              markPaidMutation.mutate({
                                paymentId: payment._id,
                                companyId: selectedCompany,
                              })
                            }
                            className="inline-flex items-center justify-center px-3 py-1.5 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                          >
                            <svg
                              className="w-4 h-4 mr-1.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Marcar como pago
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCompany && payments.length === 0 && (
                <div className="mt-6 p-8 text-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Nenhum pagamento encontrado para esta empresa.
                  </p>
                </div>
              )}
            </div>

            {/* MÉTRICAS */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              {selectedCompany && metrics ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <svg
                        className="w-5 h-5 text-gray-700 dark:text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Métricas
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Aluguéis
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {metrics.totalRentals}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Clientes
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {metrics.totalCustomers}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800/30">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Receita
                      </span>
                      <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                        R$ {metrics.revenue.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/30">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Despesas
                      </span>
                      <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                        R$ {metrics.expenses.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-12">
                  <svg
                    className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                  <p className="text-center text-gray-600 dark:text-gray-400">
                    Selecione uma empresa para ver as métricas
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* MODAL */}
          {showPaymentModal && (
            <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-md">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Novo Pagamento
                  </h2>
                </div>

                <form onSubmit={handleCreatePayment} className="space-y-4">
                  <div>
                    <label
                      htmlFor="companyId"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Empresa{" "}
                      <span className="text-red-500 dark:text-red-400">*</span>
                    </label>
                    <select
                      id="companyId"
                      value={paymentData.companyId}
                      onChange={(e) =>
                        setPaymentData((prev) => ({
                          ...prev,
                          companyId: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="" disabled>
                        Selecione uma empresa
                      </option>
                      {companies.map((company) => (
                        <option key={company._id} value={company._id}>
                          {company.name} — {company.cnpj}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="amount"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Valor{" "}
                      <span className="text-red-500 dark:text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 dark:text-gray-400 text-sm">
                          R$
                        </span>
                      </div>
                      <input
                        id="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={paymentData.amount}
                        onChange={(e) =>
                          setPaymentData({
                            ...paymentData,
                            amount: Number(e.target.value),
                          })
                        }
                        className="pl-10 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="plan"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Plano{" "}
                      <span className="text-red-500 dark:text-red-400">*</span>
                    </label>
                    <select
                      id="plan"
                      value={paymentData.plan}
                      onChange={(e) =>
                        setPaymentData({
                          ...paymentData,
                          plan: e.target.value as Plan,
                        })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="basic">Básico</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="dueDate"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Vencimento{" "}
                      <span className="text-red-500 dark:text-red-400">*</span>
                    </label>
                    <input
                      id="dueDate"
                      type="date"
                      value={paymentData.dueDate}
                      onChange={(e) =>
                        setPaymentData({
                          ...paymentData,
                          dueDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(false)}
                      className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200"
                    >
                      Criar Pagamento
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AdminPage;
