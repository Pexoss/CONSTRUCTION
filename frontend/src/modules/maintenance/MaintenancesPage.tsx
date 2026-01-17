import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService } from './maintenance.service';
import { MaintenanceFilters, MaintenanceType, MaintenanceStatus } from '../../types/maintenance.types';
import Layout from '../../components/Layout';

const MaintenancesPage: React.FC = () => {
  const [filters, setFilters] = useState<MaintenanceFilters>({
    page: 1,
    limit: 20,
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['maintenances', filters],
    queryFn: () => maintenanceService.getMaintenances(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => maintenanceService.deleteMaintenance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
    },
  });

  const handleFilterChange = (key: keyof MaintenanceFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const getStatusColor = (status: MaintenanceStatus) => {
    const colors = {
      scheduled: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
    };
    return colors[status];
  };

  const getStatusLabel = (status: MaintenanceStatus) => {
    const labels = {
      scheduled: 'Agendada',
      in_progress: 'Em Andamento',
      completed: 'Concluída',
    };
    return labels[status];
  };

  const getTypeLabel = (type: MaintenanceType) => {
    return type === 'preventive' ? 'Preventiva' : 'Corretiva';
  };

  if (isLoading) {
    return (
      <Layout title="Manutenções" backTo="/dashboard">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando manutenções...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Manutenções" backTo="/dashboard">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Erro ao carregar manutenções. Tente novamente.</p>
        </div>
      </Layout>
    );
  }

  const maintenances = data?.data || [];
  const pagination = data?.pagination;

  return (
    <Layout title="Manutenções" backTo="/dashboard">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Manutenções</h1>
              <p className="mt-1 text-sm text-gray-600">Gerencie manutenções preventivas e corretivas</p>
            </div>
            <Link
              to="/maintenance/new"
              className="inline-flex items-center bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nova Manutenção
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtrar Manutenções</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Tipo</label>
              <select
                value={filters.type || ''}
                onChange={(e) => handleFilterChange('type', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              >
                <option value="">Todos os tipos</option>
                <option value="preventive">Preventiva</option>
                <option value="corrective">Corretiva</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              >
                <option value="">Todos os status</option>
                <option value="scheduled">Agendada</option>
                <option value="in_progress">Em Andamento</option>
                <option value="completed">Concluída</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Data Inicial</label>
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => handleFilterChange('startDate', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">Data Final</label>
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => handleFilterChange('endDate', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              />
            </div>
          </div>

          {(filters.type || filters.status || filters.startDate || filters.endDate) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => setFilters({ page: 1, limit: 10 })}
                className="text-sm text-black hover:text-gray-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {/* Maintenances List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Lista de Manutenções</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {maintenances.length === 0
                    ? "Nenhuma manutenção encontrada"
                    : `Total: ${maintenances.length} manutenção${maintenances.length !== 1 ? 'ões' : ''}`}
                </p>
              </div>
              {pagination && (
                <div className="text-sm text-gray-600">
                  Página {pagination.page} de {pagination.totalPages}
                </div>
              )}
            </div>
          </div>

          {maintenances.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">Nenhuma manutenção encontrada</h3>
              <p className="mt-2 text-gray-600 max-w-md mx-auto">
                {filters.type || filters.status || filters.startDate || filters.endDate
                  ? "Tente ajustar os filtros de busca."
                  : "Comece criando sua primeira manutenção."}
              </p>
              {(filters.type || filters.status || filters.startDate || filters.endDate) && (
                <button
                  onClick={() => setFilters({ page: 1, limit: 10 })}
                  className="mt-4 px-4 py-2 text-sm font-medium text-black hover:text-gray-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Unidade
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Descrição
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Data Agendada
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Custo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {maintenances.map((maintenance) => {
                      const item = typeof maintenance.itemId === 'object' ? maintenance.itemId : null;
                      return (
                        <tr key={maintenance._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-md flex items-center justify-center">
                                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                </svg>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {item ? item.name : 'Item'}
                                </div>
                                {item && (
                                  <div className="text-xs text-gray-500">{item.sku}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {maintenance.unitId || '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${maintenance.type === 'preventive'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-orange-100 text-orange-800 border border-orange-200'
                              }`}>
                              {getTypeLabel(maintenance.type)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 max-w-xs truncate" title={maintenance.description}>
                              {maintenance.description}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {new Date(maintenance.scheduledDate).toLocaleDateString('pt-BR')}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">
                              R$ {maintenance.cost.toFixed(2)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full border ${getStatusColor(
                                maintenance.status
                              )}`}
                            >
                              {getStatusLabel(maintenance.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <Link
                                to={`/maintenance/${maintenance._id}`}
                                className="text-gray-600 hover:text-black p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                                title="Ver detalhes"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </Link>
                              <Link
                                to={`/maintenance/edit/${maintenance._id}`}
                                className="text-gray-600 hover:text-black p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                                title="Editar manutenção"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </Link>
                              <button
                                onClick={() => {
                                  if (window.confirm('Tem certeza que deseja excluir esta manutenção?')) {
                                    deleteMutation.mutate(maintenance._id);
                                  }
                                }}
                                className="text-red-600 hover:text-red-800 p-1.5 hover:bg-red-50 rounded-md transition-colors"
                                title="Excluir manutenção"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-sm text-gray-700">
                  Mostrando <span className="font-medium">{((pagination.page - 1) * pagination.limit) + 1}</span> a{' '}
                  <span className="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> de{' '}
                  <span className="font-medium">{pagination.total}</span> manutenções
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! - 1 }))}
                    disabled={pagination.page === 1}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Anterior
                  </button>
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page! + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    Próxima
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default MaintenancesPage;
