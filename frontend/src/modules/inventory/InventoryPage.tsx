import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useItems, useLowStockItems } from '../../hooks/useInventory';
import { Item, ItemFilters } from '../../types/inventory.types';
import Layout from '../../components/Layout';
import { inventoryService } from './inventory.service';

const InventoryPage: React.FC = () => {
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>([]);
  const [inventorySummary, setInventorySummary] = useState<{
    totalItems: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  } | null>(null);
  const [filters, setFilters] = useState<ItemFilters>({
    page: 1,
    limit: 20,
    isActive: true,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data: itemsData, isLoading, error } = useItems(filters);
  const { data: lowStockData } = useLowStockItems();

  // Carregar categorias ao montar
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await inventoryService.getCategories(true);
        setCategories(response.data);
      } catch (err) {
        console.error('Erro ao carregar categorias', err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    async function loadInventorySummary() {
      try {
        const data = await inventoryService.getInformationsItens();
        setInventorySummary(data);
        console.log(data)
      } catch (error: any) {
        // console.error('Erro ao buscar resumo do inventário');
        // console.error('Mensagem:', error?.message);
        // console.error('Status:', error?.response?.status);
        // console.error('Data:', error?.response?.data);
      }
    }

    loadInventorySummary();
  }, []);

  // Atualiza filtros
  const handleFilterChange = (key: keyof ItemFilters, value: string | boolean | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // resetar página ao mudar filtro
    }));
  };

  // Pesquisa
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters(prev => ({ ...prev, search: searchTerm || undefined, page: 1 }));
  };

  const items = itemsData?.data || [];
  const pagination = itemsData?.pagination;


  return (
    <Layout title="Inventário" backTo="/dashboard">
      {/* Header */}
      <div className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-xl mb-8 px-8 py-6 flex justify-between items-center border border-gray-100 dark:border-gray-700">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
              <svg className="h-7 w-7 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Inventário</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 flex items-center">
                <svg className="h-4 w-4 mr-1.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Gerencie materiais, equipamentos e estoque
              </p>
            </div>
          </div>

          {/* Status do Inventário*/}
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {inventorySummary?.inStock ?? 0}
                </span>{' '}
                itens em estoque
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-500"></div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {inventorySummary?.lowStock ?? 0}
                </span>{' '}
                itens com estoque baixo
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500"></div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {inventorySummary?.outOfStock ?? 0}
                </span>{' '}
                itens esgotados
              </span>
            </div>
          </div>
        </div>

        <div className="flex space-x-4">
          <Link
            to="/inventory/categories"
            className="inline-flex items-center px-5 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-sm font-medium shadow-sm hover:shadow transition-all duration-200"
          >
            <svg className="h-5 w-5 mr-2 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            Categorias
          </Link>

          <Link
            to="/inventory/items/new"
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-sm font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Item
          </Link>
        </div>
      </div>

      {/* Alert Estoque Baixo */}
      {lowStockData && lowStockData.count > 0 && (
        <div
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 cursor-pointer"
          onClick={() => handleFilterChange('lowStock', true)} // ativa o filtro
        >
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 flex items-center">
            <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                {lowStockData.count} item(ns) com estoque baixo
              </h3>
              <Link
                to="/inventory/items?lowStock=true"
                className="text-sm text-yellow-700 underline mt-1 block"
              >
                Ver itens com estoque baixo
              </Link>
            </div>
          </div>
        </div>
      )}


      {/* Filtros */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {/* Campo de Busca */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Buscar por nome, SKU, código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 sm:text-sm"
              />
            </div>

            {/* Seletor de Categoria */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <select
                value={filters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
                className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200 sm:text-sm appearance-none bg-white"
              >
                <option value="">Todas as categorias</option>
                {categories.map(cat => (
                  <option key={cat._id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Checkbox de Estoque Baixo */}
            <label className="flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200 p-3 hover:bg-gray-100 transition-all duration-200 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={filters.lowStock || false}
                  onChange={(e) => handleFilterChange('lowStock', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-300 rounded-full peer peer-checked:bg-amber-500 transition-colors duration-200 relative">
                  <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-5"></div>
                </div>
                <div className="ml-3 flex items-center">
                  <svg className="h-5 w-5 text-amber-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.342 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    Estoque baixo
                  </span>
                </div>
              </div>
            </label>

            {/* Botão de Busca */}
            <button
              type="submit"
              className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white px-4 py-3 rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center justify-center"
            >
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Buscar
            </button>
          </form>
        </div>

        {/* Tabela de itens */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {isLoading ? (
            <div className="p-8 text-center text-gray-600">Carregando itens...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum item encontrado</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {items.map(item => {
                const available =
                  item.trackingType === 'unit'
                    ? item.quantity.total - item.quantity.maintenance
                    : item.quantity.total;

                const isOutOfStock = available === 0;
                const isLowStock =
                  !isOutOfStock &&
                  item.lowStockThreshold !== undefined &&
                  available <= item.lowStockThreshold;

                return (
                  <li key={item._id}>
                    <Link
                      to={`/inventory/items/${item._id}`}
                      className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-1 min-w-0">
                          {/* Foto */}
                          <div className="flex-shrink-0 mr-4">
                            {item.photos && item.photos.length > 0 ? (
                              <img
                                className="h-14 w-14 rounded-md object-cover"
                                src={item.photos[0]}
                                alt={item.name}
                              />
                            ) : (
                              <div className="h-14 w-14 rounded-md bg-gray-100 flex items-center justify-center">
                                <span className="text-gray-400 text-xs">Sem foto</span>
                              </div>
                            )}
                          </div>

                          {/* Informações principais */}
                          <div className="flex-1 min-w-0">
                            {/* Linha 1: Nome + status */}
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-base font-semibold text-gray-900 truncate">
                                {item.name}
                              </p>

                              {isOutOfStock ? (
                                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  Esgotado
                                </span>
                              ) : isLowStock ? (
                                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  Estoque baixo
                                </span>
                              ) : (
                                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Disponível
                                </span>
                              )}
                            </div>

                            {/* Linha 2: Meta */}
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                                <strong>SKU:</strong>&nbsp;{item.sku}
                              </span>

                              {item.customId && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-700">
                                  <strong>ID:</strong>&nbsp;{item.customId}
                                </span>
                              )}

                              {item.trackingType === 'unit' && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">
                                  Unitário
                                </span>
                              )}

                              {item.category && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
                                  {item.category}
                                </span>
                              )}
                            </div>

                            {/* Linha 3: Estoque */}
                            <div className="flex items-center space-x-6 text-sm text-gray-600">
                              <div className="flex items-center">
                                <span className="font-medium text-gray-500 mr-1">
                                  {item.trackingType === 'unit' ? 'Unidades:' : 'Estoque:'}
                                </span>
                                <span className="font-semibold text-green-600">
                                  {item.quantity.available}
                                </span>
                                <span className="mx-1">disponíveis de</span>
                                <span className="font-semibold text-gray-700">
                                  {item.quantity.total}
                                </span>
                              </div>

                              {item.trackingType === 'unit' &&
                                item.quantity.maintenance > 0 && (
                                  <div className="flex items-center">
                                    <span className="font-medium text-gray-500 mr-1">
                                      Manutenção:
                                    </span>
                                    <span className="font-semibold text-amber-600">
                                      {item.quantity.maintenance}
                                    </span>
                                  </div>
                                )}

                              {item.trackingType !== 'unit' &&
                                item.lowStockThreshold !== undefined &&
                                item.lowStockThreshold > 0 && (
                                  <div className="flex items-center">
                                    <span className="font-medium text-gray-500 mr-1">
                                      Alerta:
                                    </span>
                                    <span className="font-semibold text-amber-600">
                                      ≤ {item.lowStockThreshold}
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>

                        {/* Preço */}
                        <div className="flex items-center space-x-6 ml-6">
                          <div className="text-right">
                            <p className="text-lg font-bold text-indigo-700">
                              R$ {item.pricing.dailyRate.toFixed(2)}
                            </p>
                            <p className="text-sm text-gray-500">por dia</p>

                            {item.pricing.weeklyRate && (
                              <p className="text-sm text-gray-600 mt-1">
                                <strong>
                                  R$ {item.pricing.weeklyRate.toFixed(2)}
                                </strong>
                                <span className="text-xs text-gray-500"> / semana</span>
                              </p>
                            )}
                          </div>

                          <svg
                            className="h-5 w-5 text-gray-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Paginação */}
        {pagination && pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 rounded-md shadow">
            <div className="flex-1 flex justify-between sm:hidden">
              <button onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))} disabled={pagination.page === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Anterior</button>
              <button onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))} disabled={pagination.page >= pagination.totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">Próxima</button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">{((pagination.page - 1) * pagination.limit) + 1}</span> a{' '}
                <span className="font-medium">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> de <span className="font-medium">{pagination.total}</span> resultados
              </p>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
                    <button key={page} onClick={() => setFilters(prev => ({ ...prev, page }))} className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${pagination.page === page ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600' : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'}`}>{page}</button>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default InventoryPage;
