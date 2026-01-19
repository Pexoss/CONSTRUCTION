import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useItem, useDeleteItem, useItemMovements, useAdjustQuantity, useCalculateDepreciation } from '../../hooks/useInventory';
import { adjustQuantitySchema } from '../../utils/inventory.validation';
import { inventoryService } from './inventory.service';
import Layout from '../../components/Layout';

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
      <Layout title="Detalhes do Item" backTo="/inventory/items">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando item...</div>
        </div>
      </Layout>
    );
  }

  if (!item) {
    return (
      <Layout title="Detalhes do Item" backTo="/inventory/items">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Item não encontrado</p>
        </div>
      </Layout>
    );
  }
  const movements = movementsData?.data || [];

  return (
    <Layout title="Detalhes do Item" backTo="/inventory/items">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/inventory/items"
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
          >
            ← Voltar para o Inventário
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-lg mb-6 border border-gray-100">
          <div className="px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              {/* Cabeçalho com título */}
              <div className="flex items-start">
                <div className="flex-1">
                  {/* Título e status */}
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>

                    {/* Badge de Estoque Baixo */}
                    {item.lowStockThreshold && item.quantity.available <= item.lowStockThreshold && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                        <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Estoque Baixo
                      </span>
                    )}

                    {/* Badge de Status Ativo/Inativo */}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${item.isActive
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-red-100 text-red-800 border border-red-200'}`}>
                      <div className={`w-2 h-2 rounded-full mr-1.5 ${item.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      {item.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  {/* SKU e ID */}
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-md text-sm bg-blue-50 text-blue-700 border border-blue-100">
                      <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                      </svg>
                      SKU: {item.sku}
                    </span>

                    {item.customId && (
                      <span className="inline-flex items-center px-3 py-1 rounded-md text-sm bg-gray-100 text-gray-700 border border-gray-200">
                        <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                        ID: {item.customId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-3">
                <Link
                  to={`/inventory/items/${id}/edit`}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 min-w-[100px]"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Editar
                </Link>

                <button
                  onClick={() => setShowAdjustModal && setShowAdjustModal(true)}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 min-w-[100px]"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Ajustar
                </button>
              </div>

              <button
                onClick={handleDelete}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 min-w-[100px]"
              >
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Deletar
              </button>
            </div>
          </div>
        </div>
        {/* Grid Principal Aprimorado */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Conteúdo Principal - 2/3 da largura */}
          <div className="lg:col-span-2 space-y-8">
            {/* Informações Gerais - Card Aprimorado */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl mr-4">
                  <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Informações Gerais</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: "Nome", value: item.name },
                  { label: "SKU", value: item.sku },
                  { label: "ID Customizado", value: item.customId },
                  { label: "Código de Barras", value: item.barcode },
                  { label: "Categoria", value: item.category },
                  { label: "Subcategoria", value: item.subcategory },
                  { label: "Localização", value: item.location },
                ].map((info, idx) => (
                  info.value && (
                    <div key={idx} className="space-y-1">
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{info.label}</dt>
                      <dd className="text-sm font-medium text-gray-900 dark:text-white">{info.value}</dd>
                    </div>
                  )
                ))}

                {item.description && (
                  <div className="md:col-span-2 space-y-1">
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Descrição</dt>
                    <dd className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                      {item.description}
                    </dd>
                  </div>
                )}
              </div>
            </div>

            {/* Quantidades - Card Aprimorado */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl mr-4">
                  <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Quantidades</h2>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  {
                    label: "Total",
                    value: item.quantity.total,
                    bgColor: "bg-gray-50 dark:bg-gray-900/50",
                    textColor: "text-gray-900 dark:text-white",
                    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  },
                  {
                    label: "Disponível",
                    value: item.quantity.available,
                    bgColor: "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/20",
                    textColor: "text-green-700 dark:text-emerald-300",
                    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  },
                  {
                    label: "Alugada",
                    value: item.quantity.rented,
                    bgColor: "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20",
                    textColor: "text-blue-700 dark:text-blue-300",
                    icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  },
                  {
                    label: "Manutenção",
                    value: item.quantity.maintenance,
                    bgColor: "bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/20",
                    textColor: "text-amber-700 dark:text-amber-300",
                    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  },
                  {
                    label: "Danificada",
                    value: item.quantity.damaged,
                    bgColor: "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/20",
                    textColor: "text-red-700 dark:text-red-300",
                    icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.342 16.5c-.77.833.192 2.5 1.732 2.5z"
                  },
                ].map((stat, idx) => (
                  <div key={idx} className={`${stat.bgColor} p-5 rounded-2xl text-center border border-opacity-20 border-gray-200 dark:border-gray-700`}>
                    <div className="flex items-center justify-center mb-2">
                      <svg className={`h-5 w-5 ${stat.textColor} mr-1.5`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stat.icon} />
                      </svg>
                      <div className={`text-2xl font-bold ${stat.textColor}`}>{stat.value}</div>
                    </div>
                    <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Preços - Card Aprimorado */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl mr-4">
                  <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Preços e Valores</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Diário</p>
                      <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">R$ {item.pricing.dailyRate.toFixed(2)}</p>
                    </div>
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-800/50 rounded-lg">
                      <svg className="h-6 w-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>

                  {item.pricing.weeklyRate && (
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Semanal</p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-300">R$ {item.pricing.weeklyRate.toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-blue-100 dark:bg-blue-800/50 rounded-lg">
                        <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {item.pricing.monthlyRate && (
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl border border-purple-100 dark:border-purple-800/50">
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Mensal</p>
                        <p className="text-lg font-bold text-purple-700 dark:text-purple-300">R$ {item.pricing.monthlyRate.toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-purple-100 dark:bg-purple-800/50 rounded-lg">
                        <svg className="h-6 w-6 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>
                    </div>
                  )}

                  {item.pricing.depositAmount && (
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Depósito</p>
                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">R$ {item.pricing.depositAmount.toFixed(2)}</p>
                      </div>
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-800/50 rounded-lg">
                        <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {item.depreciation && item.depreciation.initialValue && (
              <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                  <div className="flex items-center">
                    <div className="p-3 bg-cyan-50 rounded-lg mr-4">
                      <svg className="h-6 w-6 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Depreciação</h2>
                  </div>

                  <button
                    onClick={handleCalculateDepreciation}
                    disabled={calculateDepreciation.isPending}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    {calculateDepreciation.isPending ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Calculando...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                        </svg>
                        Calcular Depreciação
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p className="text-sm font-medium text-gray-600 mb-1">Valor Inicial</p>
                    <p className="text-sm font-medium text-gray-900">
                      R$ {item.depreciation.initialValue?.toFixed(2)}
                    </p>
                  </div>

                  <div className="p-4 bg-cyan-50 rounded-xl border border-cyan-200">
                    <p className="text-sm font-medium text-gray-600 mb-1">Valor Atual</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {item.depreciation.currentValue
                        ? `R$ ${item.depreciation.currentValue.toFixed(2)}`
                        : <span className="text-gray-400">Não calculado</span>
                      }
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-sm font-medium text-gray-600 mb-1">Taxa de Depreciação</p>
                    <p className="text-sm font-medium text-gray-900">
                      {item.depreciation.depreciationRate || 10}% ao ano
                    </p>
                  </div>

                  {item.depreciation.purchaseDate && (
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                      <p className="text-sm font-medium text-gray-600 mb-1">Data de Compra</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(item.depreciation.purchaseDate).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - 1/3 da largura */}
          <div className="space-y-8">
            {/* Fotos - Card Aprimorado */}
            {item.photos && item.photos.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-pink-50 dark:bg-pink-900/30 rounded-xl mr-4">
                    <svg className="h-6 w-6 text-pink-600 dark:text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Fotos</h2>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {item.photos.map((photo, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={photo}
                        alt={`${item.name} ${idx + 1}`}
                        className="w-full h-56 object-cover rounded-xl shadow-md group-hover:shadow-xl transition-all duration-300"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-xl transition-all duration-300 flex items-center justify-center">
                        <button className="opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 p-2 bg-white rounded-full shadow-lg">
                          <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status - Card Aprimorado */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
              <div className="flex items-center mb-6">
                <div className="p-3 bg-cyan-50 dark:bg-cyan-900/30 rounded-xl mr-4">
                  <svg className="h-6 w-6 text-cyan-600 dark:text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Status</h2>
              </div>

              <div className="space-y-4">
                {/* Status Principal */}
                <div className="bg-gradient-to-r from-gray-50 to-white dark:from-gray-900/50 dark:to-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${operationalStatus?.status === 'rented'
                      ? 'bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/40 dark:to-indigo-900/40 text-blue-800 dark:text-blue-300'
                      : operationalStatus?.status === 'maintenance'
                        ? 'bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/40 dark:to-yellow-900/40 text-amber-800 dark:text-amber-300'
                        : 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 text-green-800 dark:text-green-300'
                      }`}>
                      {operationalStatus?.status === 'rented' ? 'Locado' :
                        operationalStatus?.status === 'maintenance' ? 'Manutenção' : 'Disponível'}
                    </span>
                  </div>
                </div>

                {/* Informações Específicas */}
                {operationalStatus?.status === 'rented' && operationalStatus.client && (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</span>
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{operationalStatus.client.name}</span>
                      </div>
                    </div>
                  </div>
                )}

                {operationalStatus?.status === 'maintenance' && (
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800/50">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Fornecedor</span>
                        <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{operationalStatus.supplierName}</span>
                      </div>

                      {operationalStatus?.scheduledDate && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Previsão</span>
                          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                            {new Date(operationalStatus.scheduledDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      )}

                      {operationalStatus.cost && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Custo</span>
                          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">R$ {operationalStatus.cost}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Informações Gerais do Item */}
                <div className="space-y-3">
                  {item.lowStockThreshold != null && (
                    <div className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg transition-colors">
                      <div className="flex items-center">
                        <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg mr-3">
                          <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Alerta Estoque</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{item.lowStockThreshold}</span>
                    </div>
                  )}

                  {item.createdAt && (
                    <div className="flex justify-between items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 rounded-lg transition-colors">
                      <div className="flex items-center">
                        <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg mr-3">
                          <svg className="h-4 w-4 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cadastrado em</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Adjust Quantity Modal */}
      {showAdjustModal && (
        <div className="fixed z-50 inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            {/* Overlay clean */}
            <div
              className="fixed inset-0 bg-gray-500/75 transition-opacity"
              onClick={() => setShowAdjustModal(false)}
            />

            {/* Container do Modal */}
            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">

              {/* Header do Modal clean */}
              <div className="bg-white border-b border-gray-200 px-6 py-5">
                <div className="flex items-center">
                  <div className="p-2 bg-gray-100 rounded-lg mr-4">
                    <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Ajustar Quantidade
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {item.name} • SKU: {item.sku}
                    </p>
                  </div>
                </div>
              </div>

              {/* Formulário */}
              <form onSubmit={handleAdjustQuantity}>
                <div className="px-6 py-6 space-y-4">
                  {/* Tipo de Ajuste */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Ajuste
                    </label>
                    <select
                      value={adjustForm.type}
                      onChange={(e) =>
                        setAdjustForm((prev) => ({ ...prev, type: e.target.value as any }))
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                    >
                      <option value="in" className="py-2">Entrada (Adicionar estoque)</option>
                      <option value="out" className="py-2">Saída (Remover estoque)</option>
                      <option value="adjustment" className="py-2">Ajuste Manual</option>
                      <option value="damage" className="py-2">Danificar</option>
                      <option value="repair" className="py-2">Reparar</option>
                    </select>
                  </div>

                  {/* Quantidade */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quantidade
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        required
                        value={adjustForm.quantity}
                        onChange={(e) =>
                          setAdjustForm((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                        placeholder="Ex: 5"
                      />
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Estoque atual disponível: <span className="font-medium text-gray-700">{item.quantity.available}</span> unidades
                    </p>
                  </div>

                  {/* Observações */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observações (Opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={adjustForm.notes}
                      onChange={(e) => setAdjustForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                      placeholder="Descreva o motivo do ajuste..."
                    />
                  </div>
                </div>

                {/* Footer do Modal */}
                <div className="bg-gray-50 px-6 py-4 sm:flex sm:flex-row-reverse border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={adjustQuantity.isPending}
                    className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {adjustQuantity.isPending ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processando...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        Confirmar
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(false)}
                    className="mt-3 sm:mt-0 sm:mr-3 w-full sm:w-auto inline-flex justify-center items-center px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                  >
                    <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default ItemDetailPage;
