import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { rentalService } from "./rental.service";
import Layout from "../../components/Layout";
import Skeleton from "../../components/Skeleton";
import { Rental } from "../../types/rental.types";

const ExpirationDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<
    "all" | "expired" | "expiringSoon" | "expiringToday"
  >("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["expiration-dashboard"],
    queryFn: () => rentalService.getExpirationDashboard(),
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  const getReturnDate = (rental: Rental): Date | null => {
    if (!rental.dates?.returnScheduled) return null;
    return new Date(rental.dates.returnScheduled);
  };

  const getStatusColor = (rental: Rental) => {
    const returnDate = getReturnDate(rental);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!returnDate) return "bg-gray-100 text-gray-800 border-gray-300";

    if (returnDate < today) return "bg-red-100 text-red-800 border-red-300";

    const daysUntilReturn = Math.ceil(
      (returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilReturn === 0)
      return "bg-yellow-100 text-yellow-800 border-yellow-300";

    if (daysUntilReturn <= 3)
      return "bg-orange-100 text-orange-800 border-orange-300";

    return "bg-green-100 text-green-800 border-green-300";
  };

  const getStatusLabel = (rental: Rental) => {
    const returnDate = getReturnDate(rental);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!returnDate) return "Sem vencimento";
    if (returnDate < today) return "Vencido";

    const daysUntilReturn = Math.ceil(
      (returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysUntilReturn === 0) return "Vence hoje";
    if (daysUntilReturn <= 3) return `Vence em ${daysUntilReturn} dias`;

    return "Ativo";
  };

  const getFilteredRentals = (): Rental[] => {
    if (!data?.data) return [];

    switch (filter) {
      case "expired":
        return data.data.expired;
      case "expiringSoon":
        return data.data.expiringSoon;
      case "expiringToday":
        return data.data.expiringToday;
      default:
        return [
          ...data.data.expired,
          ...data.data.expiringToday,
          ...data.data.expiringSoon,
        ];
    }
  };

  if (isLoading) {
    return (
      <Layout title="Dashboard de Vencimentos" backTo="/dashboard">
        <Skeleton className="w-full h-64" />
      </Layout>
    );
  }

  if (error) {
    // console.error('Erro real:', error);
    return (
      <Layout title="Dashboard de Vencimentos" backTo="/dashboard">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">
            Erro ao carregar dashboard de vencimentos
          </p>
          <pre className="text-xs text-red-600 mt-2">
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      </Layout>
    );
  }

  const dashboard = data?.data;
  const filteredRentals = getFilteredRentals();

  return (
    <Layout title="Dashboard de Vencimentos" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard de Vencimentos
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Acompanhe os contratos vencidos e a vencer
            </p>
          </div>

          {/* Resumo - Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <SummaryCard
              title="Vencidos"
              value={dashboard?.summary.totalExpired}
              color="red"
            />
            <SummaryCard
              title="Vence Hoje"
              value={dashboard?.summary.totalExpiringToday}
              color="yellow"
            />
            <SummaryCard
              title="Vence em 7 dias"
              value={dashboard?.summary.totalExpiringSoon}
              color="orange"
            />
            <SummaryCard
              title="Contratos Ativos"
              value={dashboard?.summary.totalActive}
              color="green"
            />
          </div>

          {/* Filtros */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6 p-4">
            <div className="flex flex-wrap gap-2">
              {[
                { key: "all", label: "Todos" },
                { key: "expired", label: "Vencidos" },
                { key: "expiringToday", label: "Vence Hoje" },
                { key: "expiringSoon", label: "Vence em 7 dias" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key as any)}
                  className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                  ${
                    filter === item.key
                      ? "bg-gray-900 dark:bg-gray-700 text-white shadow-sm"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent"
                  }
                `}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabela */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Contrato
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredRentals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600 mb-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Nenhum contrato encontrado
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredRentals.map((rental) => {
                      const customer =
                        typeof rental.customerId === "object"
                          ? rental.customerId
                          : null;

                      return (
                        <tr
                          key={rental._id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                              {rental.rentalNumber}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-white">
                              {customer?.name || "Cliente"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm text-gray-900 dark:text-white">
                              {formatDate(rental.dates?.returnScheduled)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full border ${getStatusColor(
                                rental,
                              )}`}
                            >
                              {getStatusLabel(rental)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              R$ {rental.pricing.total.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              onClick={() => navigate(`/rentals/${rental._id}`)}
                              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
                                  d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                />
                              </svg>
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ExpirationDashboardPage;

/* ------------------ */

const SummaryCard = ({
  title,
  value = 0,
  color,
}: {
  title: string;
  value?: number;
  color: "red" | "yellow" | "orange" | "green";
}) => (
  <div
    className={`bg-white rounded-lg shadow p-6 border-l-4 border-${color}-500`}
  >
    <p className="text-sm text-gray-500">{title}</p>
    <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
  </div>
);
