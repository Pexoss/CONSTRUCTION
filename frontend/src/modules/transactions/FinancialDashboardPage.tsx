import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { transactionService } from './transaction.service';

const FinancialDashboardPage: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['financial-dashboard', startDate, endDate],
    queryFn: () => transactionService.getFinancialDashboard(startDate || undefined, endDate || undefined),
  });

  const { data: receivable } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: () => transactionService.getAccountsReceivable(),
  });

  const { data: payable } = useQuery({
    queryKey: ['accounts-payable'],
    queryFn: () => transactionService.getAccountsPayable(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  const dashboard = data?.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Data inicial"
              className="border border-gray-300 rounded-md px-3 py-2"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="Data final"
              className="border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>

        {dashboard && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Receitas</h3>
                <p className="text-2xl font-bold text-green-600">R$ {dashboard.totalIncome.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Despesas</h3>
                <p className="text-2xl font-bold text-red-600">R$ {dashboard.totalExpenses.toFixed(2)}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Lucro</h3>
                <p className={`text-2xl font-bold ${dashboard.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  R$ {dashboard.profit.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">A Receber</h3>
                <p className="text-2xl font-bold text-blue-600">R$ {dashboard.accountsReceivable.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Contas a Receber</h3>
                <div className="space-y-2">
                  {receivable?.data && receivable.data.length > 0 ? (
                    receivable.data.slice(0, 5).map((transaction) => (
                      <div key={transaction._id} className="flex justify-between items-center p-2 border-b">
                        <div>
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-sm text-gray-500">
                            {transaction.dueDate && new Date(transaction.dueDate).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="font-semibold">R$ {transaction.amount.toFixed(2)}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">Nenhuma conta a receber</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Contas a Pagar</h3>
                <div className="space-y-2">
                  {payable?.data && payable.data.length > 0 ? (
                    payable.data.slice(0, 5).map((transaction) => (
                      <div key={transaction._id} className="flex justify-between items-center p-2 border-b">
                        <div>
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-sm text-gray-500">
                            {transaction.dueDate && new Date(transaction.dueDate).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="font-semibold">R$ {transaction.amount.toFixed(2)}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">Nenhuma conta a pagar</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FinancialDashboardPage;
