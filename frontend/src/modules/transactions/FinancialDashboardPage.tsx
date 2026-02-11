import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { transactionService } from "./transaction.service";
import Layout from "../../components/Layout";

const FinancialDashboardPage: React.FC = () => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["financial-dashboard", startDate, endDate],
    queryFn: () =>
      transactionService.getFinancialDashboard(
        startDate || undefined,
        endDate || undefined,
      ),
  });

  const { data: receivable } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: () => transactionService.getAccountsReceivable(),
  });

  const { data: payable } = useQuery({
    queryKey: ["accounts-payable"],
    queryFn: () => transactionService.getAccountsPayable(),
  });

  if (isLoading) {
    return (
      <Layout title="Dashboard Financeiro" backTo="/dashboard">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando...</div>
        </div>
      </Layout>
    );
  }

  const dashboard = data?.data;

  return (
    <Layout title="Dashboard Financeiro" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard Financeiro
            </h1>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Filtros de Data */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Data inicial"
                className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Data final"
                className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>

          {dashboard && (
            <>
              {/* Cards de Resumo */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Receitas
                  </h3>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    R$ {dashboard.totalIncome.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Despesas
                  </h3>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    R$ {dashboard.totalExpenses.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Lucro
                  </h3>
                  <p
                    className={`text-2xl font-bold ${
                      dashboard.profit >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    R$ {dashboard.profit.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    A Receber
                  </h3>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    R$ {dashboard.accountsReceivable.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Contas a Receber e Pagar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contas a Receber */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Contas a Receber
                  </h3>
                  <div className="space-y-2">
                    {receivable?.data && receivable.data.length > 0 ? (
                      receivable.data.slice(0, 5).map((transaction) => (
                        <div
                          key={transaction._id}
                          className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 last:border-0"
                        >
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {transaction.description}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {transaction.dueDate &&
                                new Date(
                                  transaction.dueDate,
                                ).toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            R$ {transaction.amount.toFixed(2)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-600 dark:text-gray-400 py-2 text-center">
                        Nenhuma conta a receber
                      </p>
                    )}
                  </div>
                </div>

                {/* Contas a Pagar */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Contas a Pagar
                  </h3>
                  <div className="space-y-2">
                    {payable?.data && payable.data.length > 0 ? (
                      payable.data.slice(0, 5).map((transaction) => (
                        <div
                          key={transaction._id}
                          className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-700 last:border-0"
                        >
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {transaction.description}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {transaction.dueDate &&
                                new Date(
                                  transaction.dueDate,
                                ).toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                          <div className="font-semibold text-gray-900 dark:text-white">
                            R$ {transaction.amount.toFixed(2)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-600 dark:text-gray-400 py-2 text-center">
                        Nenhuma conta a pagar
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default FinancialDashboardPage;
