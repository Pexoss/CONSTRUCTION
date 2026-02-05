import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { RentalFilters, RentalStatus } from '../../types/rental.types';
import Layout from '../../components/Layout';

const RentalsPage: React.FC = () => {
  const [filters, setFilters] = useState<RentalFilters>({
    page: 1,
    limit: 20,
  });
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { data, isLoading, error } = useQuery({
    queryKey: ['rentals', filters],
    queryFn: () => rentalService.getRentals(filters),
  });

  const handleFilterChange = (key: keyof RentalFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const getStatusColor = (status: RentalStatus) => {
    const colors = {
      reserved: 'bg-blue-100 text-blue-800',
      active: 'bg-green-100 text-green-800',
      overdue: 'bg-red-100 text-red-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-yellow-100 text-yellow-800',
    };
    return colors[status];
  };

  const getStatusLabel = (status: RentalStatus) => {
    const labels = {
      reserved: 'Reservado',
      active: 'Ativo',
      overdue: 'Atrasado',
      completed: 'Finalizado',
      cancelled: 'Cancelado',
    };
    return labels[status];
  };

  if (isLoading) {
    return (
      <Layout title="Aluguéis e Reservas" backTo="/dashboard">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando aluguéis...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Aluguéis e Reservas" backTo="/dashboard">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Erro ao carregar aluguéis. Tente novamente.</p>
        </div>
      </Layout>
    );
  }

  const rentals = data?.data || [];
  const pagination = data?.pagination;

  // Simple calendar view
  const renderCalendarView = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    const rentalsByDate: Record<string, typeof rentals> = {};
    rentals.forEach((rental) => {
      const pickupDate = new Date(rental.dates.pickupScheduled).toDateString();
      const returnDate = new Date(rental.dates.returnScheduled).toDateString();

      if (!rentalsByDate[pickupDate]) rentalsByDate[pickupDate] = [];
      rentalsByDate[pickupDate].push(rental);

      if (pickupDate !== returnDate) {
        if (!rentalsByDate[returnDate]) rentalsByDate[returnDate] = [];
        rentalsByDate[returnDate].push(rental);
      }
    });

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            {selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() =>
                setSelectedDate(new Date(year, month - 1, 1))
              }
              className="flex-1 sm:flex-none px-3 py-1.5 sm:py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              ←
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="flex-1 sm:flex-none px-3 py-1.5 sm:py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Hoje
            </button>
            <button
              onClick={() =>
                setSelectedDate(new Date(year, month + 1, 1))
              }
              className="flex-1 sm:flex-none px-3 py-1.5 sm:py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
            <div key={day} className="text-center text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 py-2">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
            </div>
          ))}
          {days.map((date, index) => {
            if (!date) {
              return <div key={index} className="h-20 sm:h-24 border border-gray-200 dark:border-gray-700 rounded-lg"></div>;
            }
            const dateStr = date.toDateString();
            const dayRentals = rentalsByDate[dateStr] || [];
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <div
                key={index}
                className={`h-20 sm:h-24 border rounded-lg p-1 sm:p-2 ${isToday ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'
                  }`}
              >
                <div className="text-xs sm:text-sm font-medium mb-1">{date.getDate()}</div>
                <div className="space-y-0.5 sm:space-y-1 overflow-hidden">
                  {dayRentals.slice(0, 2).map((rental) => (
                    <div
                      key={rental._id}
                      className={`text-[10px] sm:text-xs p-1 sm:p-1.5 rounded truncate ${getStatusColor(rental.status)}`}
                      title={rental.rentalNumber}
                    >
                      {rental.rentalNumber}
                    </div>
                  ))}
                  {dayRentals.length > 2 && (
                    <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">+{dayRentals.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Layout principal ajustado
  return (
    <Layout title="Aluguéis e Reservas" backTo="/dashboard">
      {/* Header - Corrigido espaçamento */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 lg:py-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Aluguéis e Reservas</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Gerenciar aluguéis e reservas</p>
            </div>
            <Link
              to="/rentals/new"
              className="mt-2 sm:mt-0 w-full sm:w-auto bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-900 text-center active:bg-gray-900 dark:active:bg-gray-500"
            >
              + Novo Aluguel
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 sm:mt-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('list')}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${viewMode === 'list'
                  ? 'bg-gray-800 dark:bg-gray-700 text-white focus:ring-gray-500 dark:focus:ring-gray-400'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-gray-400 dark:focus:ring-gray-500'
                  } active:scale-95`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${viewMode === 'calendar'
                  ? 'bg-gray-800 dark:bg-gray-700 text-white focus:ring-gray-500 dark:focus:ring-gray-400'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:ring-gray-400 dark:focus:ring-gray-500'
                  } active:scale-95`}
              >
                Calendário
              </button>
            </div>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              className="w-full sm:w-auto border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 dark:bg-gray-700 dark:text-white dark:focus:ring-gray-500 dark:focus:border-gray-500"
            >
              <option value="">Todos os status</option>
              <option value="reserved">Reservado</option>
              <option value="active">Ativo</option>
              <option value="overdue">Atrasado</option>
              <option value="completed">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 mt-4 sm:mt-6 pb-6">
        {viewMode === 'calendar' ? (
          renderCalendarView()
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Container com scroll horizontal para mobile */}
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <div className="inline-block min-w-full align-middle px-2 sm:px-0">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Número
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Cliente
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Itens
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Período
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Valor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {rentals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 sm:px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                          Nenhum aluguel encontrado
                        </td>
                      </tr>
                    ) : (
                      rentals.map((rental) => {
                        const customer =
                          typeof rental.customerId === 'object'
                            ? rental.customerId
                            : { name: 'Cliente' };
                        return (
                          <tr key={rental._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {rental.rentalNumber}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900 dark:text-white">{customer.name}</div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-sm text-gray-500 dark:text-gray-300">
                                {rental.items.length} item(ns)
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-600 dark:text-gray-300">
                                {new Date(rental.dates.pickupScheduled).toLocaleDateString('pt-BR')} -{' '}
                                {new Date(rental.dates.returnScheduled).toLocaleDateString('pt-BR')}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                R$ {rental.pricing.total.toFixed(2)}
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span
                                className={`px-3 py-1 inline-flex text-xs leading-5 font-medium rounded-full border ${getStatusColor(
                                  rental.status
                                )}`}
                              >
                                {getStatusLabel(rental.status)}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <Link
                                to={`/rentals/${rental._id}`}
                                className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
                              >
                                Ver Detalhes
                              </Link>
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
        )}

        {/* Pagination */}
        {viewMode === 'list' && pagination && pagination.totalPages > 1 && (
          <div className="mt-4 sm:mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}{' '}
                aluguéis
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:bg-gray-100 dark:active:bg-gray-500"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:bg-gray-100 dark:active:bg-gray-500"
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RentalsPage;
