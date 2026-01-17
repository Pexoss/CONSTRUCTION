import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { RentalFilters, RentalStatus } from '../../types/rental.types';
import BackButton from 'components/BackButton';

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
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando aluguéis...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Erro ao carregar aluguéis. Tente novamente.</p>
      </div>
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setSelectedDate(new Date(year, month - 1, 1))
              }
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              ←
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              Hoje
            </button>
            <button
              onClick={() =>
                setSelectedDate(new Date(year, month + 1, 1))
              }
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              →
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
            <div key={day} className="text-center font-semibold text-gray-700 py-2">
              {day}
            </div>
          ))}
          {days.map((date, index) => {
            if (!date) {
              return <div key={index} className="h-24 border border-gray-200 rounded"></div>;
            }
            const dateStr = date.toDateString();
            const dayRentals = rentalsByDate[dateStr] || [];
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <div
                key={index}
                className={`h-24 border border-gray-200 rounded p-1 ${
                  isToday ? 'bg-blue-50 border-blue-300' : ''
                }`}
              >
                <div className="text-sm font-medium mb-1">{date.getDate()}</div>
                <div className="space-y-1">
                  {dayRentals.slice(0, 2).map((rental) => (
                    <div
                      key={rental._id}
                      className={`text-xs p-1 rounded truncate ${getStatusColor(rental.status)}`}
                      title={rental.rentalNumber}
                    >
                      {rental.rentalNumber}
                    </div>
                  ))}
                  {dayRentals.length > 2 && (
                    <div className="text-xs text-gray-500">+{dayRentals.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <BackButton to="/dashboard" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Aluguéis e Reservas</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Gerenciar aluguéis e reservas</p>
              </div>
            </div>
            <Link
              to="/rentals/new"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              + Novo Aluguel
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex gap-4 items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  viewMode === 'list'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  viewMode === 'calendar'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Calendário
              </button>
            </div>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {viewMode === 'calendar' ? (
          renderCalendarView()
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Itens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Período
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rentals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
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
                      <tr key={rental._id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {rental.rentalNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{customer.name}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {rental.items.length} item(ns)
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {new Date(rental.dates.pickupScheduled).toLocaleDateString('pt-BR')} -{' '}
                            {new Date(rental.dates.returnScheduled).toLocaleDateString('pt-BR')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            R$ {rental.pricing.total.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                              rental.status
                            )}`}
                          >
                            {getStatusLabel(rental.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Link
                            to={`/rentals/${rental._id}`}
                            className="text-indigo-600 hover:text-indigo-900"
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
        )}

        {/* Pagination */}
        {viewMode === 'list' && pagination && pagination.totalPages > 1 && (
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-700">
              Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}{' '}
              aluguéis
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RentalsPage;
