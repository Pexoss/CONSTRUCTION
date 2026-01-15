import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useItem, useDeleteItem, useItemMovements, useAdjustQuantity, useCalculateDepreciation } from '../../hooks/useInventory';
import { adjustQuantitySchema } from '../../utils/inventory.validation';
import { inventoryService } from './inventory.service';

const ItemDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: itemData, isLoading } = useItem(id || '');
  const deleteItem = useDeleteItem();
  const adjustQuantity = useAdjustQuantity();
  const calculateDepreciation = useCalculateDepreciation();
  const { data: movementsData } = useItemMovements(id || '');
  const [operationalStatus, setOperationalStatus] = useState<{
    status: string;
    label: string;
    className: string;
    client?: { id: string; name: string } | null;
    supplierName?: string | null;
    scheduledDate?: string | null;
    cost?: number | null;
  } | null>(null);


  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    type: 'in' as 'in' | 'out' | 'adjustment' | 'damage' | 'repair',
    quantity: 1,
    notes: '',
  });

  const item = itemData?.data;

  useEffect(() => {
    if (!item?._id) return;

    const fetchOperationalStatus = async () => {
      try {
        const response = await inventoryService.getItemOperationalStatus(item._id);
        setOperationalStatus(response);
      } catch (error: any) {
      }
    };

    fetchOperationalStatus();
  }, [item?._id]);


  const handleAdjustQuantity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      adjustQuantitySchema.parse(adjustForm);
      adjustQuantity.mutate(
        { id, data: adjustForm },
        {
          onSuccess: () => {
            setShowAdjustModal(false);
            setAdjustForm({ type: 'in', quantity: 1, notes: '' });
          },
        }
      );
    } catch (error: any) {
      console.error('Validation error:', error);
    }
  };

  const handleDelete = () => {
    if (!id) return;
    if (window.confirm('Tem certeza que deseja deletar este item?')) {
      deleteItem.mutate(id, {
        onSuccess: () => {
          navigate('/inventory/items');
        },
      });
    }
  };

  const handleCalculateDepreciation = () => {
    if (!id) return;
    calculateDepreciation.mutate(id);
    console.log("ID do item", id)
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando item...</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Item não encontrado</p>
        <Link to="/inventory/items" className="text-indigo-600 hover:text-indigo-500 mt-2 inline-block">
          Voltar para lista
        </Link>
      </div>
    );
  }
  const movements = movementsData?.data || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <div className="flex items-center">
                <Link to="/inventory/items" className="text-indigo-600 hover:text-indigo-500 mr-4">
                  ← Voltar
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
                {item.lowStockThreshold && item.quantity.available <= item.lowStockThreshold && (
                  <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Estoque Baixo
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-600">SKU: {item.sku}</p>
            </div>
            <div className="flex space-x-3">
              <Link
                to={`/inventory/items/${id}/edit`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Editar
              </Link>
              <button
                onClick={() => setShowAdjustModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Ajustar Quantidade
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Deletar
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Informações Gerais */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações Gerais</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Nome</dt>
                  <dd className="mt-1 text-sm text-gray-900">{item.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">SKU</dt>
                  <dd className="mt-1 text-sm text-gray-900">{item.sku}</dd>
                </div>
                {item.customId && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">ID Customizado</dt>
                    <dd className="mt-1 text-sm text-gray-900">{item.customId}</dd>
                  </div>
                )}
                {item.barcode && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Código de Barras</dt>
                    <dd className="mt-1 text-sm text-gray-900">{item.barcode}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Categoria</dt>
                  <dd className="mt-1 text-sm text-gray-900">{item.category}</dd>
                </div>
                {item.subcategory && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Subcategoria</dt>
                    <dd className="mt-1 text-sm text-gray-900">{item.subcategory}</dd>
                  </div>
                )}
                {item.location && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Localização</dt>
                    <dd className="mt-1 text-sm text-gray-900">{item.location}</dd>
                  </div>
                )}
                {item.description && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Descrição</dt>
                    <dd className="mt-1 text-sm text-gray-900">{item.description}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Quantidades */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quantidades</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{item.quantity.total}</div>
                  <div className="text-sm text-gray-500 mt-1">Total</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{item.quantity.available}</div>
                  <div className="text-sm text-gray-500 mt-1">Disponível</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{item.quantity.rented}</div>
                  <div className="text-sm text-gray-500 mt-1">Alugada</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{item.quantity.maintenance}</div>
                  <div className="text-sm text-gray-500 mt-1">Manutenção</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{item.quantity.damaged}</div>
                  <div className="text-sm text-gray-500 mt-1">Danificada</div>
                </div>
              </div>
            </div>

            {/* Preços */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preços</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Taxa Diária</dt>
                  <dd className="mt-1 text-sm font-semibold text-gray-900">
                    R$ {item.pricing.dailyRate.toFixed(2)}
                  </dd>
                </div>
                {item.pricing.weeklyRate && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Taxa Semanal</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">
                      R$ {item.pricing.weeklyRate.toFixed(2)}
                    </dd>
                  </div>
                )}
                {item.pricing.monthlyRate && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Taxa Mensal</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">
                      R$ {item.pricing.monthlyRate.toFixed(2)}
                    </dd>
                  </div>
                )}
                {item.pricing.depositAmount && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Valor de Depósito</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">
                      R$ {item.pricing.depositAmount.toFixed(2)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Depreciação */}
            {item.depreciation && item.depreciation.initialValue && (
              <div className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Depreciação</h2>
                  <button
                    onClick={handleCalculateDepreciation}
                    disabled={calculateDepreciation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {calculateDepreciation.isPending ? 'Calculando...' : 'Calcular Depreciação'}
                  </button>
                </div>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Valor Inicial</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      R$ {item.depreciation.initialValue?.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Valor Atual</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">
                      R$ {item.depreciation.currentValue?.toFixed(2) || 'Não calculado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Taxa de Depreciação</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {item.depreciation.depreciationRate || 10}% ao ano
                    </dd>
                  </div>
                  {item.depreciation.purchaseDate && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Data de Compra</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(item.depreciation.purchaseDate).toLocaleDateString('pt-BR')}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            {/* Histórico de Movimentações */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Histórico de Movimentações</h2>
              {movements.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma movimentação registrada</p>
              ) : (
                <div className="flow-root">
                  <ul className="-mb-8">
                    {movements.slice(0, 10).map((movement, idx) => (
                      <li key={movement._id}>
                        <div className="relative pb-8">
                          {idx !== movements.length - 1 && (
                            <span
                              className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                              aria-hidden="true"
                            />
                          )}
                          <div className="relative flex space-x-3">
                            <div>
                              <span
                                className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${movement.type === 'in'
                                  ? 'bg-green-500'
                                  : movement.type === 'out'
                                    ? 'bg-red-500'
                                    : movement.type === 'damage'
                                      ? 'bg-yellow-500'
                                      : 'bg-blue-500'
                                  }`}
                              >
                                <span className="text-white text-xs font-semibold">
                                  {movement.type === 'in' ? '+' : movement.type === 'out' ? '-' : '!'}
                                </span>
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                              <div>
                                <p className="text-sm text-gray-500">
                                  <span className="font-medium text-gray-900 capitalize">
                                    {movement.type.replace('_', ' ')}
                                  </span>
                                  {' - '}
                                  <span className="font-semibold">Quantidade: {movement.quantity}</span>
                                </p>
                                {movement.notes && (
                                  <p className="text-sm text-gray-600 mt-1">{movement.notes}</p>
                                )}
                              </div>
                              <div className="text-right text-sm whitespace-nowrap text-gray-500">
                                {new Date(movement.createdAt || '').toLocaleDateString('pt-BR')}
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Fotos */}
            {item.photos && item.photos.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Fotos</h2>
                <div className="grid grid-cols-1 gap-4">
                  {item.photos.map((photo, idx) => (
                    <img
                      key={idx}
                      src={photo}
                      alt={`${item.name} ${idx + 1}`}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status</h2>

              <div className="space-y-3">
                {/* Status administrativo */}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Cadastro</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${item.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                      }`}
                  >
                    {item.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>

                {/* Quantidades relevantes */}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Disponível</span>
                  <span className="text-sm text-gray-900">{item.quantity.available}</span>
                </div>

                {operationalStatus?.status === 'rented' && operationalStatus.client && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Locado para</span>
                    <span className="text-sm text-gray-900">
                      {operationalStatus.client.name}
                    </span>
                  </div>
                )}

                {operationalStatus?.status === 'maintenance' && (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Em manutenção</span>
                      <span className="text-sm text-gray-900">{operationalStatus.label}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Data prevista</span>
                      <span className="text-sm text-gray-900">
                        {operationalStatus?.scheduledDate ? (
                          <span className="text-sm text-gray-900">
                            {new Date(operationalStatus.scheduledDate).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-900">—</span>
                        )}
                      </span>

                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Valor cobrado</span>
                      <span className="text-sm text-gray-900">R$ {operationalStatus.cost}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Fornecedor</span>
                      <span className="text-sm text-gray-900">{operationalStatus.supplierName}</span>
                    </div>
                  </div>
                )}


                {/* Estoque baixo */}
                {item.lowStockThreshold != null && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Alerta de Estoque Baixo</span>
                    <span className="text-sm text-gray-900">{item.lowStockThreshold}</span>
                  </div>
                )}

                {/* Criado em */}
                {item.createdAt && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Criado em</span>
                    <span className="text-sm text-gray-900">
                      {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Adjust Quantity Modal */}
      {showAdjustModal && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowAdjustModal(false)} />
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <form onSubmit={handleAdjustQuantity}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Ajustar Quantidade
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Tipo de Ajuste</label>
                      <select
                        value={adjustForm.type}
                        onChange={(e) =>
                          setAdjustForm((prev) => ({ ...prev, type: e.target.value as any }))
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      >
                        <option value="in">Entrada</option>
                        <option value="out">Saída</option>
                        <option value="adjustment">Ajuste Manual</option>
                        <option value="damage">Danificar</option>
                        <option value="repair">Reparar</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Quantidade</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={adjustForm.quantity}
                        onChange={(e) =>
                          setAdjustForm((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))
                        }
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Observações</label>
                      <textarea
                        rows={3}
                        value={adjustForm.notes}
                        onChange={(e) => setAdjustForm((prev) => ({ ...prev, notes: e.target.value }))}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={adjustQuantity.isPending}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {adjustQuantity.isPending ? 'Ajustando...' : 'Confirmar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemDetailPage;
