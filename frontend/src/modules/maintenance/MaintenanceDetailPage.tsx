import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceService } from './maintenance.service';
import { MaintenanceStatus } from '../../types/maintenance.types';

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
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Manutenção não encontrada</p>
      </div>
    );
  }

  const maintenance = data.data;
  const item = typeof maintenance.itemId === 'object' ? maintenance.itemId : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link to="/maintenance" className="text-indigo-600 hover:text-indigo-900 text-sm">
            ← Voltar para Manutenções
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Detalhes da Manutenção</h1>
              <span
                className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
                  maintenance.status
                )}`}
              >
                {getStatusLabel(maintenance.status)}
              </span>
            </div>
            <button
              onClick={() => {
                setShowStatusModal(true);
                setNewStatus(maintenance.status);
                setStatusData({
                  completedDate: maintenance.completedDate || '',
                  performedBy: maintenance.performedBy || '',
                  notes: maintenance.notes || '',
                });
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Alterar Status
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações do Item</h2>
              {item && (
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-gray-600">Nome:</span>{' '}
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">SKU:</span>{' '}
                    <span className="font-medium">{item.sku}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações da Manutenção</h2>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-600">Tipo:</span>{' '}
                  <span className="font-medium">{getTypeLabel(maintenance.type)}</span>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Data Agendada:</span>{' '}
                  <span className="font-medium">
                    {new Date(maintenance.scheduledDate).toLocaleString('pt-BR')}
                  </span>
                </div>
                {maintenance.completedDate && (
                  <div>
                    <span className="text-sm text-gray-600">Data de Conclusão:</span>{' '}
                    <span className="font-medium">
                      {new Date(maintenance.completedDate).toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-600">Custo:</span>{' '}
                  <span className="font-medium">R$ {maintenance.cost.toFixed(2)}</span>
                </div>
                {maintenance.performedBy && (
                  <div>
                    <span className="text-sm text-gray-600">Realizada por:</span>{' '}
                    <span className="font-medium">{maintenance.performedBy}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Descrição</h2>
            <p className="text-sm text-gray-600">{maintenance.description}</p>
          </div>

          {maintenance.notes && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Observações</h2>
              <p className="text-sm text-gray-600">{maintenance.notes}</p>
            </div>
          )}

          {maintenance.attachments && maintenance.attachments.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Anexos</h2>
              <div className="space-y-2">
                {maintenance.attachments.map((attachment, index) => (
                  <a
                    key={index}
                    href={attachment}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-indigo-600 hover:text-indigo-900"
                  >
                    Anexo {index + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Alterar Status</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as MaintenanceStatus)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="scheduled">Agendada</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="completed">Concluída</option>
                </select>
              </div>

              {newStatus === 'completed' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Conclusão
                    </label>
                    <input
                      type="datetime-local"
                      value={statusData.completedDate ? new Date(statusData.completedDate).toISOString().slice(0, 16) : ''}
                      onChange={(e) =>
                        setStatusData({ ...statusData, completedDate: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Realizada por
                    </label>
                    <input
                      type="text"
                      value={statusData.performedBy}
                      onChange={(e) => setStatusData({ ...statusData, performedBy: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={statusData.notes}
                  onChange={(e) => setStatusData({ ...statusData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() =>
                    updateStatusMutation.mutate({
                      status: newStatus,
                      completedDate: statusData.completedDate || undefined,
                      performedBy: statusData.performedBy || undefined,
                      notes: statusData.notes || undefined,
                    })
                  }
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceDetailPage;
