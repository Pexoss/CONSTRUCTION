import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { rentalService } from './rental.service';
import Layout from '../../components/Layout';
import Skeleton from '../../components/Skeleton';
import { Rental } from '../../types/rental.types';

const ExpirationDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<
    'all' | 'expired' | 'expiringSoon' | 'expiringToday'
  >('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['expiration-dashboard'],
    queryFn: () => rentalService.getExpirationDashboard(),
  });

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getReturnDate = (rental: Rental): Date | null => {
    if (!rental.dates?.returnScheduled) return null;
    return new Date(rental.dates.returnScheduled);
  };

  const getStatusColor = (rental: Rental) => {
    const returnDate = getReturnDate(rental);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!returnDate) return 'bg-gray-100 text-gray-800 border-gray-300';

    if (returnDate < today)
      return 'bg-red-100 text-red-800 border-red-300';

    const daysUntilReturn = Math.ceil(
      (returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilReturn === 0)
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';

    if (daysUntilReturn <= 3)
      return 'bg-orange-100 text-orange-800 border-orange-300';

    return 'bg-green-100 text-green-800 border-green-300';
  };

  const getStatusLabel = (rental: Rental) => {
    const returnDate = getReturnDate(rental);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!returnDate) return 'Sem vencimento';
    if (returnDate < today) return 'Vencido';

    const daysUntilReturn = Math.ceil(
      (returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilReturn === 0) return 'Vence hoje';
    if (daysUntilReturn <= 3) return `Vence em ${daysUntilReturn} dias`;

    return 'Ativo';
  };

  const getFilteredRentals = (): Rental[] => {
    if (!data?.data) return [];

    switch (filter) {
      case 'expired':
        return data.data.expired;
      case 'expiringSoon':
        return data.data.expiringSoon;
      case 'expiringToday':
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
      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'Todos' },
            { key: 'expired', label: 'Vencidos' },
            { key: 'expiringToday', label: 'Vence Hoje' },
            { key: 'expiringSoon', label: 'Vence em 7 dias' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${filter === item.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left">Contrato</th>
              <th className="px-6 py-3 text-left">Cliente</th>
              <th className="px-6 py-3 text-left">Vencimento</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Valor</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredRentals.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center">
                  Nenhum contrato encontrado
                </td>
              </tr>
            ) : (
              filteredRentals.map((rental) => {
                const customer =
                  typeof rental.customerId === 'object'
                    ? rental.customerId
                    : null;

                return (
                  <tr key={rental._id}>
                    <td className="px-6 py-4">
                      {rental.rentalNumber}
                    </td>
                    <td className="px-6 py-4">
                      {customer?.name || 'Cliente'}
                    </td>
                    <td className="px-6 py-4">
                      {formatDate(rental.dates?.returnScheduled)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 rounded-full border ${getStatusColor(
                          rental
                        )}`}
                      >
                        {getStatusLabel(rental)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      R$ {rental.pricing.total.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => navigate(`/rentals/${rental._id}`)}
                        className="text-indigo-600"
                      >
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
  color: 'red' | 'yellow' | 'orange' | 'green';
}) => (
  <div className={`bg-white rounded-lg shadow p-6 border-l-4 border-${color}-500`}>
    <p className="text-sm text-gray-500">{title}</p>
    <p className={`text-3xl font-bold text-${color}-600`}>
      {value}
    </p>
  </div>
);
