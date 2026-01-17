import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService } from './maintenance.service';
import { MaintenanceStatus } from '../../types/maintenance.types';
import Layout from '../../components/Layout';

const MaintenanceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<MaintenanceStatus>('scheduled');
  const [statusData, setStatusData] = useState({
    completedDate: '',
    performedBy: '',
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance', id],
    queryFn: () => maintenanceService.getMaintenanceById(id!),
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (data: { status: MaintenanceStatus; completedDate?: string; performedBy?: string; notes?: string }) =>
      maintenanceService.updateMaintenanceStatus(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', id] });
      queryClient.invalidateQueries({ queryKey: ['maintenances'] });
      setShowStatusModal(false);
    },
  });

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

  const getTypeLabel = (type: string) => {
    return type === 'preventive' ? 'Preventiva' : 'Corretiva';
  };

  if (isLoading) {
    return (
      <Layout title="Detalhes da Manutenção" backTo="/maintenance">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando...</div>
        </div>
      </Layout>
    );
  }

  if (!data?.data) {
    return (
      <Layout title="Detalhes da Manutenção" backTo="/maintenance">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Manutenção não encontrada</p>
        </div>
      </Layout>
    );
  }

  const maintenance = data.data;
  const item = typeof maintenance.itemId === 'object' ? maintenance.itemId : null;

  return (
    <Layout title="Detalhes da Manutenção" backTo="/maintenance">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link to="/maintenance" className="text-black hover:text-gray-800 text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Voltar para Manutenções
          </Link>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Detalhes da Manutenção</h1>
              <div className="mt-3 flex items-center gap-3">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                    maintenance.status
                  )}`}
                >
                  {getStatusLabel(maintenance.status)}
                </span>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${maintenance.type === 'preventive'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-orange-100 text-orange-800 border border-orange-200'
                  }`}>
                  {getTypeLabel(maintenance.type)}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setShowStatusModal(true);
                setNewStatus(maintenance.status);
                setStatusData({
                  completedDate: maintenance.completedDate
                    ? new Date(maintenance.completedDate).toISOString()
                    : new Date().toISOString(),
                  performedBy: maintenance.performedBy || '',
                  notes: maintenance.notes || '',
                });
              }}
              className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Alterar Status
            </button>
          </div>

          {/* Informações em Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Informações do Item */}
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 bg-gray-100 rounded-md flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">Informações do Item</h2>
              </div>
              {item && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Nome
                    </label>
                    <p className="font-medium text-gray-900">{item.name}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      SKU
                    </label>
                    <p className="font-medium text-gray-900 font-mono">{item.sku}</p>
                  </div>
                  {maintenance.unitId && (
                    <div>
                      <span className="text-sm text-gray-600">Unidade:</span>{' '}
                      <span className="font-medium">{maintenance.unitId}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Informações da Manutenção */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalhes da Manutenção</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Data Agendada
                  </label>
                  <p className="font-medium text-gray-900">
                    {new Date(maintenance.scheduledDate).toLocaleString('pt-BR')}
                  </p>
                </div>
                {maintenance.completedDate && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Data de Conclusão
                    </label>
                    <p className="font-medium text-gray-900">
                      {new Date(maintenance.completedDate).toLocaleString('pt-BR')}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                    Custo
                  </label>
                  <p className="font-medium text-gray-900">R$ {maintenance.cost.toFixed(2)}</p>
                </div>
                {maintenance.performedBy && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Realizada por
                    </label>
                    <p className="font-medium text-gray-900">{maintenance.performedBy}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Descrição */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Descrição</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-gray-700 whitespace-pre-wrap">{maintenance.description}</p>
            </div>
          </div>

          {/* Observações */}
          {maintenance.notes && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Observações</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-700 whitespace-pre-wrap">{maintenance.notes}</p>
              </div>
            </div>
          )}

          {/* Anexos */}
          {maintenance.attachments && maintenance.attachments.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Anexos</h2>
              <div className="space-y-2">
                {maintenance.attachments.map((attachment, index) => (
                  <a
                    key={index}
                    href={attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-black hover:text-gray-800 hover:bg-gray-50 p-2 rounded-md transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="text-sm font-medium">Anexo {index + 1}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Alterar Status</h2>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as MaintenanceStatus)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                >
                  <option value="scheduled">Agendada</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="completed">Concluída</option>
                </select>
              </div>

              {newStatus === 'completed' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Conclusão
                    </label>
                    <input
                      type="datetime-local"
                      value={statusData.completedDate.slice(0, 16)}
                      onChange={(e) =>
                        setStatusData({ ...statusData, completedDate: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Realizada por
                    </label>
                    <input
                      type="text"
                      value={statusData.performedBy}
                      onChange={(e) => setStatusData({ ...statusData, performedBy: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
                <textarea
                  value={statusData.notes}
                  onChange={(e) => setStatusData({ ...statusData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
                />
              </div>

              <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      status: newStatus,
                      completedDate: statusData.completedDate
                        ? new Date(statusData.completedDate).toISOString()
                        : undefined,
                      performedBy: statusData.performedBy || undefined,
                      notes: statusData.notes || undefined,
                    })
                  }
                  className="px-4 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default MaintenanceDetailPage;
