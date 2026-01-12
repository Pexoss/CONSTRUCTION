import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useItems, useLowStockItems } from '../../hooks/useInventory';
import { ItemFilters } from '../../types/inventory.types';
import Layout from '../../components/Layout';

const InventoryPage: React.FC = () => {
  const [filters, setFilters] = useState<ItemFilters>({
    page: 1,
    limit: 20,
    isActive: true,
  });
  const [searchTerm, setSearchTerm] = useState('');

  const { data: itemsData, isLoading, error } = useItems(filters);
  const { data: lowStockData } = useLowStockItems();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({ ...prev, search: searchTerm, page: 1 }));
  };

  const handleFilterChange = (key: keyof ItemFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando itens...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Erro ao carregar itens. Tente novamente.</p>
      </div>
    );
  }

  const items = itemsData?.data || [];
  const pagination = itemsData?.pagination;

  return (
    <Layout title="Inventário" backTo="/dashboard">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventário</h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Gerenciar materiais e equipamentos</p>
            </div>
            <div className="flex space-x-3">
              <Link
                to="/inventory/categories"
                className="bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Categorias
              </Link>
              <Link
                to="/inventory/items/new"
                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                + Novo Item
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {lowStockData && lowStockData.count > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  {lowStockData.count} item(ns) com estoque baixo
                </h3>
                <Link to="/inventory/items?lowStock=true" className="text-sm text-yellow-700 underline mt-1 block">
                  Ver itens com estoque baixo
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <input
                type="text"
                placeholder="Buscar por nome, SKU, código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <select
                value={filters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">Todas as categorias</option>
                {/* Categories will be loaded via API */}
              </select>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.lowStock || false}
                  onChange={(e) => handleFilterChange('lowStock', e.target.checked || undefined)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Apenas estoque baixo</span>
              </label>
            </div>
            <div>
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Buscar
              </button>
            </div>
          </form>
        </div>

        {/* Items Table */}
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">Nenhum item encontrado</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {items.map((item) => (
                <li key={item._id}>
                  <Link
                    to={`/inventory/items/${item._id}`}
                    className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          {item.photos && item.photos.length > 0 ? (
                            <img
                              className="h-12 w-12 rounded-md object-cover"
                              src={item.photos[0]}
                              alt={item.name}
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-md bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">Sem foto</span>
                            </div>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="flex items-center">
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            {item.lowStockThreshold && item.quantity.available <= item.lowStockThreshold && (
                              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Estoque baixo
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center text-sm text-gray-500">
                            <span>SKU: {item.sku}</span>
                            {item.customId && <span className="ml-4">ID: {item.customId}</span>}
                            {item.category && <span className="ml-4">• {item.category}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            R$ {item.pricing.dailyRate.toFixed(2)}/dia
                          </p>
                          <p className="text-sm text-gray-500">
                            Disponível: {item.quantity.available} / Total: {item.quantity.total}
                          </p>
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
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 mt-4 rounded-md shadow">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                disabled={pagination.page === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Mostrando <span className="font-medium">{((pagination.page - 1) * pagination.limit) + 1}</span> a{' '}
                  <span className="font-medium">
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>{' '}
                  de <span className="font-medium">{pagination.total}</span> resultados
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) - 1 }))}
                    disabled={pagination.page === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setFilters((prev) => ({ ...prev, page }))}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        pagination.page === page
                          ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setFilters((prev) => ({ ...prev, page: (prev.page || 1) + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Próxima
                  </button>
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
