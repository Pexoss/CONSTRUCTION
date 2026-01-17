import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { RentalStatus, ChecklistData } from '../../types/rental.types';

const RentalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistType, setChecklistType] = useState<'pickup' | 'return'>('pickup');
  const [newStatus, setNewStatus] = useState<RentalStatus>('reserved');
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
      setShowStatusModal(false);
    },
  });

  const extendMutation = useMutation({
    mutationFn: (newReturnDate: string) =>
      rentalService.extendRental(id!, { newReturnDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental', id] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
      setShowExtendModal(false);
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
      setShowChecklistModal(false);
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
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando...</div>
      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Aluguel não encontrado</p>
      </div>
    );
  }

  const rental = data.data;
  const customer = typeof rental.customerId === 'object' ? rental.customerId : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link to="/rentals" className="text-indigo-600 hover:text-indigo-900 text-sm">
            ← Voltar para Aluguéis
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{rental.rentalNumber}</h1>
              <span
                className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(
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
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Alterar Status
              </button>
              {rental.status === 'active' && (
                <button
                  onClick={() => {
                    setShowExtendModal(true);
                    setNewReturnDate(rental.dates.returnScheduled.split('T')[0]);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium"
                >
                  Estender Período
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cliente</h2>
              {customer && (
                <div className="space-y-2">
                  <div>
                    <span className="text-sm text-gray-600">Nome:</span>{' '}
                    <span className="font-medium">{customer.name}</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">CPF/CNPJ:</span>{' '}
                    <span className="font-medium">{customer.cpfCnpj}</span>
                  </div>
                  {customer.email && (
                    <div>
                      <span className="text-sm text-gray-600">Email:</span>{' '}
                      <span className="font-medium">{customer.email}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div>
                      <span className="text-sm text-gray-600">Telefone:</span>{' '}
                      <span className="font-medium">{customer.phone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Datas</h2>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-600">Reservado em:</span>{' '}
                  <span className="font-medium">
                    {new Date(rental.dates.reservedAt).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Retirada prevista:</span>{' '}
                  <span className="font-medium">
                    {new Date(rental.dates.pickupScheduled).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {rental.dates.pickupActual && (
                  <div>
                    <span className="text-sm text-gray-600">Retirada real:</span>{' '}
                    <span className="font-medium">
                      {new Date(rental.dates.pickupActual).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-600">Devolução prevista:</span>{' '}
                  <span className="font-medium">
                    {new Date(rental.dates.returnScheduled).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                {rental.dates.returnActual && (
                  <div>
                    <span className="text-sm text-gray-600">Devolução real:</span>{' '}
                    <span className="font-medium">
                      {new Date(rental.dates.returnActual).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens</h2>
            <div className="space-y-4">
              {rental.items.map((item, index) => {
                const itemData = typeof item.itemId === 'object' ? item.itemId : null;
                return (
                  <div key={index} className="border border-gray-200 rounded-md p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">
                          {itemData ? itemData.name : 'Item'}
                        </div>
                        <div className="text-sm text-gray-500">
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
                    <div key={index} className="border border-gray-200 rounded-md p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900">{service.description}</div>
                          <div className="text-sm text-gray-500">
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
                  <div className="border border-gray-200 rounded-md p-4 bg-gray-50">
                    <div className="font-medium text-gray-900">{rental.workAddress.workName}</div>
                    <div className="text-sm text-gray-500">
                      {rental.workAddress.street}, {rental.workAddress.number} <br />
                      {rental.workAddress.neighborhood} • {rental.workAddress.city} - {rental.workAddress.state} <br />
                      CEP: {rental.workAddress.zipCode}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Pricing & Checklists */}
          <div className="space-y-6">
            {/* Pricing */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Valores</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">R$ {rental.pricing.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Caução:</span>
                  <span className="font-medium">R$ {rental.pricing.deposit.toFixed(2)}</span>
                </div>
                {rental.pricing.discount > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Desconto:</span>
                    <span>- R$ {rental.pricing.discount.toFixed(2)}</span>
                  </div>
                )}
                {rental.pricing.lateFee > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Multa por atraso:</span>
                    <span>R$ {rental.pricing.lateFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>R$ {rental.pricing.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Checklists */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Checklists</h2>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setChecklistType('pickup');
                    setChecklistData(rental.checklistPickup || { photos: [], conditions: {}, notes: '' });
                    setShowChecklistModal(true);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  {rental.checklistPickup ? 'Editar' : 'Adicionar'} Checklist Retirada
                </button>
                <button
                  onClick={() => {
                    setChecklistType('return');
                    setChecklistData(rental.checklistReturn || { photos: [], conditions: {}, notes: '' });
                    setShowChecklistModal(true);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  {rental.checklistReturn ? 'Editar' : 'Adicionar'} Checklist Devolução
                </button>
              </div>
            </div>

            {/* Notes */}
            {rental.notes && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Observações</h2>
                <p className="text-sm text-gray-600">{rental.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Alterar Status</h2>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as RentalStatus)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4"
            >
              <option value="reserved">Reservado</option>
              <option value="active">Ativo</option>
              <option value="overdue">Atrasado</option>
              <option value="completed">Finalizado</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => updateStatusMutation.mutate(newStatus)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Estender Período</h2>
            <input
              type="date"
              value={newReturnDate}
              onChange={(e) => setNewReturnDate(e.target.value)}
              min={rental.dates.returnScheduled.split('T')[0]}
              className="w-full border border-gray-300 rounded-md px-3 py-2 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => extendMutation.mutate(newReturnDate)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm"
              >
                Estender
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checklist Modal */}
      {showChecklistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Checklist {checklistType === 'pickup' ? 'Retirada' : 'Devolução'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={checklistData.notes || ''}
                  onChange={(e) => setChecklistData({ ...checklistData, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowChecklistModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => updateChecklistMutation.mutate(checklistData)}
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

export default RentalDetailPage;
