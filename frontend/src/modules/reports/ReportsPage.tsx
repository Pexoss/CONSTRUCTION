import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportService } from './report.service';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const ReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<'rentals' | 'financial' | 'maintenance'>('rentals');
  const [startDate, setStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: rentalsReport } = useQuery({
    queryKey: ['rentals-report', startDate, endDate],
    queryFn: () => reportService.getRentalsReport(startDate, endDate),
    enabled: reportType === 'rentals',
  });

  const { data: financialReport } = useQuery({
    queryKey: ['financial-report', startDate, endDate],
    queryFn: () => reportService.getFinancialReport(startDate, endDate),
    enabled: reportType === 'financial',
  });

  const { data: maintenanceReport } = useQuery({
    queryKey: ['maintenance-report', startDate, endDate],
    queryFn: () => reportService.getMaintenanceReport(startDate, endDate),
    enabled: reportType === 'maintenance',
  });

  const { data: mostRentedItems } = useQuery({
    queryKey: ['most-rented-items', startDate, endDate],
    queryFn: () => reportService.getMostRentedItems(startDate, endDate, 10),
  });

  const { data: topCustomers } = useQuery({
    queryKey: ['top-customers', startDate, endDate],
    queryFn: () => reportService.getTopCustomers(startDate, endDate, 10),
  });

  const handleExportRentals = async () => {
    try {
      const blob = await reportService.exportRentalsReport(startDate, endDate);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-alugueis-${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar:', error);
    }
  };

  const handleExportFinancial = async () => {
    try {
      const blob = await reportService.exportFinancialReport(startDate, endDate);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-financeiro-${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao exportar:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="rentals">Aluguéis</option>
              <option value="financial">Financeiro</option>
              <option value="maintenance">Manutenções</option>
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2"
            />
            <div className="flex gap-2">
              {reportType === 'rentals' && (
                <button
                  onClick={handleExportRentals}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                >
                  Exportar Excel
                </button>
              )}
              {reportType === 'financial' && (
                <button
                  onClick={handleExportFinancial}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                >
                  Exportar Excel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Rentals Report */}
        {reportType === 'rentals' && rentalsReport?.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Total de Aluguéis</h3>
                <p className="text-3xl font-bold text-gray-900">{rentalsReport.data.totalRentals}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Receita Total</h3>
                <p className="text-3xl font-bold text-green-600">
                  R$ {rentalsReport.data.totalRevenue.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Aluguéis por Mês</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={rentalsReport.data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="Quantidade" />
                  <Bar dataKey="revenue" fill="#82ca9d" name="Receita (R$)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {mostRentedItems?.data && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Itens Mais Alugados</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aluguéis</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receita</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {mostRentedItems.data.map((item) => (
                        <tr key={item.itemId}>
                          <td className="px-6 py-4 whitespace-nowrap">{item.itemName}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{item.rentalCount}</td>
                          <td className="px-6 py-4 whitespace-nowrap">R$ {item.totalRevenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Financial Report */}
        {reportType === 'financial' && financialReport?.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Receitas</h3>
                <p className="text-3xl font-bold text-green-600">
                  R$ {financialReport.data.totalIncome.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Despesas</h3>
                <p className="text-3xl font-bold text-red-600">
                  R$ {financialReport.data.totalExpenses.toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Lucro</h3>
                <p
                  className={`text-3xl font-bold ${
                    financialReport.data.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  R$ {financialReport.data.profit.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Fluxo Financeiro por Mês</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={financialReport.data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="income" stroke="#8884d8" name="Receitas" />
                  <Line type="monotone" dataKey="expenses" stroke="#82ca9d" name="Despesas" />
                  <Line type="monotone" dataKey="profit" stroke="#ffc658" name="Lucro" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Maintenance Report */}
        {reportType === 'maintenance' && maintenanceReport?.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Total de Manutenções</h3>
                <p className="text-3xl font-bold text-gray-900">{maintenanceReport.data.totalMaintenances}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Custo Total</h3>
                <p className="text-3xl font-bold text-red-600">
                  R$ {maintenanceReport.data.totalCost.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Manutenções por Mês</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={maintenanceReport.data.byMonth}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#8884d8" name="Quantidade" />
                  <Bar dataKey="cost" fill="#82ca9d" name="Custo (R$)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top Customers */}
        {topCustomers?.data && (
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Clientes</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aluguéis</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Gasto</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {topCustomers.data.map((customer) => (
                    <tr key={customer.customerId}>
                      <td className="px-6 py-4 whitespace-nowrap">{customer.customerName}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{customer.rentalCount}</td>
                      <td className="px-6 py-4 whitespace-nowrap">R$ {customer.totalSpent.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
