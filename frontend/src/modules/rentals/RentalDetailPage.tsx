import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { RentalStatus, ChecklistData } from '../../types/rental.types';
import Layout from '../../components/Layout';

const RentalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistType, setChecklistType] = useState<'pickup' | 'return'>('pickup');
  const [newStatus, setNewStatus] = useState<RentalStatus>('reserved');
  const [serverError, setServerError] = useState<string | null>(null);
  const [newReturnDate, setNewReturnDate] = useState('');
  const [checklistData, setChecklistData] = useState<ChecklistData>({
    photos: [],
    conditions: {},
    notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['rental', id],
    queryFn: () => rentalService.getRentalById(id!),
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: RentalStatus) => rentalService.updateRentalStatus(id!, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental', id] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setServerError(null); // limpa erro se sucesso
      setShowStatusModal(false);
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || "Erro ao atualizar status";
      setServerError(message);
    },
  });

  const extendMutation = useMutation({
    mutationFn: (newReturnDate: string) =>
      rentalService.extendRental(id!, { newReturnDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental', id] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      setServerError(null);
      setShowExtendModal(false);
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || "Erro ao estender período";
      setServerError(message);
    },
  });

  const updateChecklistMutation = useMutation({
    mutationFn: (data: ChecklistData) => {
      if (checklistType === 'pickup') {
        return rentalService.updatePickupChecklist(id!, data);
      } else {
        return rentalService.updateReturnChecklist(id!, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental', id] });
      setServerError(null);
      setShowChecklistModal(false);
    },
    onError: (err: any) => {
      const message = err.response?.data?.message || "Erro ao atualizar checklist";
      setServerError(message);
    },
  });

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
      <Layout title="Detalhes do Aluguel" backTo="/rentals">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando...</div>
        </div>
      </Layout>
    );
  }

  if (!data?.data) {
    return (
      <Layout title="Detalhes do Aluguel" backTo="/rentals">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Aluguel não encontrado</p>
        </div>
      </Layout>
    );
  }

  const rental = data.data;
  const customer = typeof rental.customerId === 'object' ? rental.customerId : null;

  return (
    <Layout title="Detalhes do Aluguel" backTo="/dashboard">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Cabeçalho */}
        <div className="mb-6">
          <Link to="/rentals" className="text-gray-600 hover:text-gray-900 text-sm transition-colors inline-flex items-center">
            <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Voltar para Aluguéis
          </Link>
        </div>

        {/* Card Principal */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{rental.rentalNumber}</h1>
              <span
                className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                  rental.status
                )}`}
              >
                {getStatusLabel(rental.status)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowStatusModal(true);
                  setNewStatus(rental.status);
                }}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
              >
                Alterar Status
              </button>
              {rental.status === 'active' && (
                <button
                  onClick={() => {
                    setShowExtendModal(true);
                    setNewReturnDate(rental.dates.returnScheduled.split('T')[0]);
                  }}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Estender Período
                </button>
              )}
              {serverError && (
                <span className="text-red-500 text-xs mt-1 font-semibold block">
                  {serverError}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Cliente */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h2>
              {customer && (
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Nome</div>
                    <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">CPF/CNPJ</div>
                    <div className="text-sm font-medium text-gray-900">{customer.cpfCnpj}</div>
                  </div>
                  {customer.email && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Email</div>
                      <div className="text-sm font-medium text-gray-900">{customer.email}</div>
                    </div>
                  )}
                  {customer.phone && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Telefone</div>
                      <div className="text-sm font-medium text-gray-900">{customer.phone}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Datas */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Datas</h2>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Reservado em</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(rental.dates.reservedAt).toLocaleString('pt-BR')}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Retirada prevista</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(rental.dates.pickupScheduled).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                {rental.dates.pickupActual && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Retirada real</div>
                    <div className="text-sm font-medium text-gray-900">
                      {new Date(rental.dates.pickupActual).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-600 mb-1">Devolução prevista</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(rental.dates.returnScheduled).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                {rental.dates.returnActual && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Devolução real</div>
                    <div className="text-sm font-medium text-gray-900">
                      {new Date(rental.dates.returnActual).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Itens */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens</h2>
            <div className="space-y-4">
              {rental.items.map((item, index) => {
                const itemData = typeof item.itemId === 'object' ? item.itemId : null;
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">
                          {itemData ? itemData.name : 'Item'}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Quantidade: {item.quantity} • Preço unitário: R$ {item.unitPrice.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">
                          R$ {item.subtotal.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {rental.services && rental.services.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Serviços Adicionais</h3>
                  {rental.services.map((service, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">{service.description}</div>
                          <div className="text-sm text-gray-600 mt-1">
                            Quantidade: {service.quantity} • Preço unitário: R$ {service.price.toFixed(2)} • Categoria: {service.category}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900">R$ {service.subtotal.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {rental.workAddress && rental.workAddress.street && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Endereço de entrega</h3>
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="font-medium text-gray-900">{rental.workAddress.workName}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {rental.workAddress.street}, {rental.workAddress.number} <br />
                      {rental.workAddress.neighborhood} • {rental.workAddress.city} - {rental.workAddress.state} <br />
                      CEP: {rental.workAddress.zipCode}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Valores */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Valores</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Subtotal:</span>
                  <span className="text-sm font-medium text-gray-900">R$ {rental.pricing.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Caução:</span>
                  <span className="text-sm font-medium text-gray-900">R$ {rental.pricing.deposit.toFixed(2)}</span>
                </div>
                {rental.pricing.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Desconto:</span>
                    <span className="text-sm font-medium text-red-600">- R$ {rental.pricing.discount.toFixed(2)}</span>
                  </div>
                )}
                {rental.pricing.lateFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Multa por atraso:</span>
                    <span className="text-sm font-medium text-red-600">R$ {rental.pricing.lateFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-semibold border-t pt-3 mt-3">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-gray-900">R$ {rental.pricing.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Checklists */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Checklists</h2>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setChecklistType('pickup');
                    setChecklistData(rental.checklistPickup || { photos: [], conditions: {}, notes: '' });
                    setShowChecklistModal(true);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                >
                  {rental.checklistPickup ? 'Editar' : 'Adicionar'} Checklist Retirada
                </button>
                <button
                  onClick={() => {
                    setChecklistType('return');
                    setChecklistData(rental.checklistReturn || { photos: [], conditions: {}, notes: '' });
                    setShowChecklistModal(true);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
                >
                  {rental.checklistReturn ? 'Editar' : 'Adicionar'} Checklist Devolução
                </button>
              </div>
            </div>

            {/* Observações */}
            {rental.notes && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Observações</h2>
                <p className="text-sm text-gray-600">{rental.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals - Apenas estilos atualizados */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-gray-500/75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Alterar Status</h2>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as RentalStatus)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            >
              <option value="reserved">Reservado</option>
              <option value="active">Ativo</option>
              <option value="overdue">Atrasado</option>
              <option value="completed">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
            {serverError && (
              <span className="text-red-500 text-xs mt-1 mb-3 font-semibold block">
                {serverError}
              </span>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateStatusMutation.mutate(newStatus)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtendModal && (
        <div className="fixed inset-0 bg-gray-500/75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Estender Período</h2>
            <input
              type="date"
              value={newReturnDate}
              onChange={(e) => setNewReturnDate(e.target.value)}
              min={rental.dates.returnScheduled.split('T')[0]}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => extendMutation.mutate(newReturnDate)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Estender
              </button>
            </div>
          </div>
        </div>
      )}

      {showChecklistModal && (
        <div className="fixed inset-0 bg-gray-500/75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md w-full">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Checklist {checklistType === 'pickup' ? 'Retirada' : 'Devolução'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={checklistData.notes || ''}
                  onChange={(e) => setChecklistData({ ...checklistData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowChecklistModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => updateChecklistMutation.mutate(checklistData)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default RentalDetailPage;
