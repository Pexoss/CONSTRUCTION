import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useItems, useLowStockItems } from "../../hooks/useInventory";
import { Item, ItemFilters } from "../../types/inventory.types";
import Layout from "../../components/Layout";
import { inventoryService } from "./inventory.service";

const InventoryPage: React.FC = () => {
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>(
    [],
  );
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
  const [searchTerm, setSearchTerm] = useState("");

  const { data: itemsData, isLoading, error } = useItems(filters);
  const { data: lowStockData } = useLowStockItems();

  // Carregar categorias ao montar
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await inventoryService.getCategories(true);
        setCategories(response.data);
      } catch (err) {
        console.error("Erro ao carregar categorias", err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    async function loadInventorySummary() {
      try {
        const data = await inventoryService.getInformationsItens();
        setInventorySummary(data);
        console.log(data);
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
  const handleFilterChange = (
    key: keyof ItemFilters,
    value: string | boolean | undefined,
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1, // resetar página ao mudar filtro
    }));
  };

  // Pesquisa
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((prev) => ({
      ...prev,
      search: searchTerm || undefined,
      page: 1,
    }));
  };

  const items = itemsData?.data || [];
  const pagination = itemsData?.pagination;

  return (
    <Layout title="Inventário" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <svg
                    className="h-7 w-7 text-gray-800 dark:text-gray-200"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Inventário
                  </h1>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Gerencie materiais, equipamentos e estoque
                  </p>
                </div>
              </div>

              <div className="flex space-x-3">
                <Link
                  to="/inventory/categories"
                  className="inline-flex items-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200"
                >
                  <svg
                    className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                  Categorias
                </Link>

                <Link
                  to="/inventory/items/new"
                  className="inline-flex items-center px-4 py-2.5 bg-gray-900 darkF:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow hover:shadow-md transition-all duration-200"
                >
                  <svg
                    className="h-4 w-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Novo Item
                </Link>
              </div>
            </div>

            {/* Status do Inventário */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center mb-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 mr-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Itens em estoque
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {inventorySummary?.inStock ?? 0}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center mb-2">
                  <div className="h-2 w-2 rounded-full bg-amber-500 mr-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Estoque baixo
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {inventorySummary?.lowStock ?? 0}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center mb-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 mr-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Itens esgotados
                  </p>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {inventorySummary?.outOfStock ?? 0}
                </p>
              </div>
            </div>
          </div>

          {/* Alert Estoque Baixo */}
          {lowStockData && lowStockData.count > 0 && (
            <div
              className="mb-6 cursor-pointer"
              onClick={() => handleFilterChange("lowStock", true)}
            >
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-4 flex items-center">
                <svg
                  className="h-5 w-5 text-amber-600 dark:text-amber-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {lowStockData.count} item(ns) com estoque baixo
                  </h3>
                  <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Clique para ver itens com estoque baixo
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-8">
            <form
              onSubmit={handleSearch}
              className="grid grid-cols-1 md:grid-cols-4 gap-4"
            >
              {/* Campo de Busca */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar por nome, SKU, código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 sm:text-sm"
                />
              </div>

              {/* Seletor de Categoria */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <select
                  value={filters.category || ""}
                  onChange={(e) =>
                    handleFilterChange("category", e.target.value || undefined)
                  }
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 sm:text-sm appearance-none"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 20 20"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              {/* Checkbox de Estoque Baixo */}
              <label className="flex items-center bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-3 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 cursor-pointer">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.lowStock || false}
                    onChange={(e) =>
                      handleFilterChange("lowStock", e.target.checked)
                    }
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-amber-500 transition-colors duration-200 relative">
                    <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-5"></div>
                  </div>
                  <div className="ml-3 flex items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Estoque baixo
                    </span>
                  </div>
                </div>
              </label>

              {/* Botão de Busca */}
              <button
                type="submit"
                className="bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium shadow hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 flex items-center justify-center"
              >
                <svg
                  className="h-5 w-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
                Buscar
              </button>
            </form>
          </div>

          {/* Tabela de itens */}
          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            {isLoading ? (
              <div className="p-8 text-center text-gray-600 dark:text-gray-400">
                Carregando itens...
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                Nenhum item encontrado
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {items.map((item) => {
                  const available =
                    item.trackingType === "unit"
                      ? item.quantity.total - item.quantity.maintenance
                      : item.quantity.total;

                  const isOutOfStock = available === 0;
                  const isLowStock =
                    !isOutOfStock &&
                    item.lowStockThreshold !== undefined &&
                    available <= item.lowStockThreshold;

                  return (
                    <div
                      key={item._id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                    >
                      <Link
                        to={`/inventory/items/${item._id}`}
                        className="block px-6 py-4"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center flex-1 min-w-0">
                            {/* Foto */}
                            <div className="flex-shrink-0 mr-4">
                              {item.photos && item.photos.length > 0 ? (
                                <img
                                  className="h-12 w-12 rounded-md object-cover"
                                  src={item.photos[0]}
                                  alt={item.name}
                                />
                              ) : (
                                <div className="h-12 w-12 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                  <span className="text-gray-400 dark:text-gray-500 text-xs">
                                    Sem foto
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Informações principais */}
                            <div className="flex-1 min-w-0">
                              {/* Linha 1: Nome + status */}
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                                  {item.name}
                                </p>

                                {isOutOfStock ? (
                                  <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                                    Esgotado
                                  </span>
                                ) : isLowStock ? (
                                  <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                                    Estoque baixo
                                  </span>
                                ) : (
                                  <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                    Disponível
                                  </span>
                                )}
                              </div>

                              {/* Linha 2: Meta */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                  <strong>SKU:</strong>&nbsp;{item.sku}
                                </span>

                                {item.customId && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                    <strong>ID:</strong>&nbsp;{item.customId}
                                  </span>
                                )}

                                {item.trackingType === "unit" && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                                    Unitário
                                  </span>
                                )}

                                {item.category && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                    {item.category}
                                  </span>
                                )}
                              </div>

                              {/* Linha 3: Estoque */}
                              <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                                <div className="flex items-center">
                                  <span className="font-medium text-gray-500 dark:text-gray-400 mr-1">
                                    {item.trackingType === "unit"
                                      ? "Unidades:"
                                      : "Estoque:"}
                                  </span>
                                  <span className="font-semibold text-green-600 dark:text-green-400">
                                    {item.quantity.available}
                                  </span>
                                  <span className="mx-1">disponíveis de</span>
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                                    {item.quantity.total}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Preço */}
                          <div className="flex items-center space-x-6 ml-6">
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900 dark:text-white">
                                R$ {item.pricing.dailyRate.toFixed(2)}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                por dia
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Paginação */}
          {pagination && pagination.totalPages > 1 && (
            <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 mt-4 rounded-lg shadow-sm">
              <div className="flex-1 flex justify-between sm:hidden">
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: (prev.page || 1) - 1,
                    }))
                  }
                  disabled={pagination.page === 1}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: (prev.page || 1) + 1,
                    }))
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Mostrando{" "}
                  <span className="font-medium">
                    {(pagination.page - 1) * pagination.limit + 1}
                  </span>{" "}
                  a{" "}
                  <span className="font-medium">
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total,
                    )}
                  </span>{" "}
                  de <span className="font-medium">{pagination.total}</span>{" "}
                  resultados
                </p>
                <div>
                  <nav
                    className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                    aria-label="Pagination"
                  >
                    {Array.from(
                      { length: pagination.totalPages },
                      (_, i) => i + 1,
                    ).map((page) => (
                      <button
                        key={page}
                        onClick={() =>
                          setFilters((prev) => ({ ...prev, page }))
                        }
                        className={`
                        relative inline-flex items-center px-4 py-2 border text-sm font-medium
                        ${
                          pagination.page === page
                            ? "z-10 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                            : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        }
                      `}
                      >
                        {page}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default InventoryPage;
