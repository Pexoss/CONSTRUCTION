import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { rentalService } from './rental.service';
import Layout from '../../components/Layout';
import Skeleton from '../../components/Skeleton';
import { Rental } from '../../types/rental.types';

const ExpirationDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'expired' | 'expiringSoon' | 'expiringToday'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['expiration-dashboard'],
    queryFn: () => rentalService.getExpirationDashboard(),
  });

  const getStatusColor = (rental: Rental) => {
    const returnDate = rental.dates.returnScheduled ? new Date(rental.dates.returnScheduled) : null;
    const nextBilling = rental.dates.nextBillingDate ? new Date(rental.dates.nextBillingDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (returnDate && returnDate < today) return 'bg-red-100 text-red-800 border-red-300';
    if (nextBilling && nextBilling < today) return 'bg-red-100 text-red-800 border-red-300';
    
    if (returnDate) {
      const daysUntilReturn = Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilReturn === 0) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      if (daysUntilReturn <= 3) return 'bg-orange-100 text-orange-800 border-orange-300';
    }
    
    if (nextBilling) {
      const daysUntilBilling = Math.ceil((nextBilling.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilBilling === 0) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      if (daysUntilBilling <= 3) return 'bg-orange-100 text-orange-800 border-orange-300';
    }

    return 'bg-green-100 text-green-800 border-green-300';
  };

  const getStatusLabel = (rental: Rental) => {
    const returnDate = rental.dates.returnScheduled ? new Date(rental.dates.returnScheduled) : null;
    const nextBilling = rental.dates.nextBillingDate ? new Date(rental.dates.nextBillingDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (returnDate && returnDate < today) return 'Vencido';
    if (nextBilling && nextBilling < today) return 'Vencido';
    
    if (returnDate) {
      const daysUntilReturn = Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilReturn === 0) return 'Vence hoje';
      if (daysUntilReturn <= 3) return `Vence em ${daysUntilReturn} dias`;
    }
    
    if (nextBilling) {
      const daysUntilBilling = Math.ceil((nextBilling.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilBilling === 0) return 'Vence hoje';
      if (daysUntilBilling <= 3) return `Vence em ${daysUntilBilling} dias`;
    }

    return 'Ativo';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const getFilteredRentals = () => {
    if (!data?.data) return [];
    
    switch (filter) {
      case 'expired':
        return data.data.expired;
      case 'expiringSoon':
        return data.data.expiringSoon;
      case 'expiringToday':
        return data.data.expiringToday;
      default:
        return [...data.data.expired, ...data.data.expiringSoon, ...data.data.expiringToday];
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
    return (
      <Layout title="Dashboard de Vencimentos" backTo="/dashboard">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Erro ao carregar dashboard de vencimentos</p>
        </div>
      </Layout>
    );
  }

  const dashboard = data?.data;
  const filteredRentals = getFilteredRentals();

  return (
    <Layout title="Dashboard de Vencimentos" backTo="/dashboard">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Vencidos</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {dashboard?.summary.totalExpired || 0}
              </p>
            </div>
            <div className="bg-red-100 dark:bg-red-900 rounded-full p-3">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-yellow-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Vence Hoje</p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                {dashboard?.summary.totalExpiringToday || 0}
              </p>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900 rounded-full p-3">
              <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Vence em 7 dias</p>
              <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                {dashboard?.summary.totalExpiringSoon || 0}
              </p>
            </div>
            <div className="bg-orange-100 dark:bg-orange-900 rounded-full p-3">
              <svg className="w-8 h-8 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Contratos Ativos</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {dashboard?.summary.totalActive || 0}
              </p>
            </div>
            <div className="bg-green-100 dark:bg-green-900 rounded-full p-3">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('expired')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'expired'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Vencidos
          </button>
          <button
            onClick={() => setFilter('expiringToday')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'expiringToday'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Vence Hoje
          </button>
          <button
            onClick={() => setFilter('expiringSoon')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filter === 'expiringSoon'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Vence em 7 dias
          </button>
        </div>
      </div>

      {/* Tabela de Contratos */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contrato
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Vencimento
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Valor
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRentals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                    Nenhum contrato encontrado
                  </td>
                </tr>
              ) : (
                filteredRentals.map((rental) => {
                  const customer = typeof rental.customerId === 'object' ? rental.customerId : null;
                  const returnDate = rental.dates.returnScheduled ? new Date(rental.dates.returnScheduled) : null;
                  const nextBilling = rental.dates.nextBillingDate ? new Date(rental.dates.nextBillingDate) : null;
                  const expirationDate = nextBilling || returnDate;

                  return (
                    <tr key={rental._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {rental.rentalNumber}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {rental.status}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {customer?.name || 'Cliente'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {customer?.cpfCnpj || ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {expirationDate ? formatDate(expirationDate.toISOString()) : '-'}
                        </div>
                        {nextBilling && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Próximo fechamento
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getStatusColor(rental)}`}>
                          {getStatusLabel(rental)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        R$ {rental.pricing.total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => navigate(`/rentals/${rental._id}`)}
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            Ver
                          </button>
                          <button
                            onClick={() => navigate(`/rentals/${rental._id}`, { state: { action: 'extend' } })}
                            className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                          >
                            Renovar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default ExpirationDashboardPage;
