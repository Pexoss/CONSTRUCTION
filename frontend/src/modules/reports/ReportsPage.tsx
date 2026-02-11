import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportService } from "./report.service";
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
} from "recharts";
import Layout from "../../components/Layout";

const ReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<
    "rentals" | "financial" | "maintenance"
  >("rentals");
  const [startDate, setStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1))
      .toISOString()
      .split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const { data: rentalsReport } = useQuery({
    queryKey: ["rentals-report", startDate, endDate],
    queryFn: () => reportService.getRentalsReport(startDate, endDate),
    enabled: reportType === "rentals",
  });

  const { data: financialReport } = useQuery({
    queryKey: ["financial-report", startDate, endDate],
    queryFn: () => reportService.getFinancialReport(startDate, endDate),
    enabled: reportType === "financial",
  });

  const { data: maintenanceReport } = useQuery({
    queryKey: ["maintenance-report", startDate, endDate],
    queryFn: () => reportService.getMaintenanceReport(startDate, endDate),
    enabled: reportType === "maintenance",
  });

  const { data: mostRentedItems } = useQuery({
    queryKey: ["most-rented-items", startDate, endDate],
    queryFn: () => reportService.getMostRentedItems(startDate, endDate, 10),
  });

  const { data: topCustomers } = useQuery({
    queryKey: ["top-customers", startDate, endDate],
    queryFn: () => reportService.getTopCustomers(startDate, endDate, 10),
  });

  const handleExportRentals = async () => {
    try {
      const blob = await reportService.exportRentalsReport(startDate, endDate);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-alugueis-${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar:", error);
    }
  };

  const handleExportFinancial = async () => {
    try {
      const blob = await reportService.exportFinancialReport(
        startDate,
        endDate,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-financeiro-${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar:", error);
    }
  };

  return (
    <Layout title="Relatórios" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Relatórios
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Visualize e exporte relatórios do sistema
            </p>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="rentals">Aluguéis</option>
                <option value="financial">Financeiro</option>
                <option value="maintenance">Manutenções</option>
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <div className="flex gap-2">
                {reportType === "rentals" && (
                  <button
                    onClick={handleExportRentals}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2"
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
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    Exportar Excel
                  </button>
                )}
                {reportType === "financial" && (
                  <button
                    onClick={handleExportFinancial}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2"
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
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    Exportar Excel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Rentals Report */}
          {reportType === "rentals" && rentalsReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Total de Aluguéis
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {rentalsReport.data.totalRentals}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Receita Total
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    R$ {rentalsReport.data.totalRevenue.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Aluguéis por Mês
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={rentalsReport.data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="month"
                      stroke="#6B7280"
                      tick={{ fill: "#6B7280" }}
                    />
                    <YAxis stroke="#6B7280" tick={{ fill: "#6B7280" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                        color: "#F9FAFB",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="count" fill="#6B7280" name="Quantidade" />
                    <Bar dataKey="revenue" fill="#10B981" name="Receita (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {mostRentedItems?.data && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Itens Mais Alugados
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Item
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Aluguéis
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Receita
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {mostRentedItems.data.map((item) => (
                          <tr
                            key={item.itemId}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {item.itemName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {item.rentalCount}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                              R$ {item.totalRevenue.toFixed(2)}
                            </td>
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
          {reportType === "financial" && financialReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Receitas
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    R$ {financialReport.data.totalIncome.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Despesas
                  </h3>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                    R$ {financialReport.data.totalExpenses.toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Lucro
                  </h3>
                  <p
                    className={`text-3xl font-bold ${
                      financialReport.data.profit >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    R$ {financialReport.data.profit.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Fluxo Financeiro por Mês
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={financialReport.data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="month"
                      stroke="#6B7280"
                      tick={{ fill: "#6B7280" }}
                    />
                    <YAxis stroke="#6B7280" tick={{ fill: "#6B7280" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                        color: "#F9FAFB",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="income"
                      stroke="#6B7280"
                      name="Receitas"
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#10B981"
                      name="Despesas"
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#F59E0B"
                      name="Lucro"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Maintenance Report */}
          {reportType === "maintenance" && maintenanceReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Total de Manutenções
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {maintenanceReport.data.totalMaintenances}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Custo Total
                  </h3>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                    R$ {maintenanceReport.data.totalCost.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Manutenções por Mês
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={maintenanceReport.data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="month"
                      stroke="#6B7280"
                      tick={{ fill: "#6B7280" }}
                    />
                    <YAxis stroke="#6B7280" tick={{ fill: "#6B7280" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                        color: "#F9FAFB",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="count" fill="#6B7280" name="Quantidade" />
                    <Bar dataKey="cost" fill="#10B981" name="Custo (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Customers */}
          {topCustomers?.data && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top Clientes
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Cliente
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Aluguéis
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Total Gasto
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {topCustomers.data.map((customer) => (
                      <tr
                        key={customer.customerId}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {customer.customerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {customer.rentalCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                          R$ {customer.totalSpent.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ReportsPage;
