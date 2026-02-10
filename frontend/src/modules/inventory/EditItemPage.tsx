import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useItem,
  useUpdateItem,
  useCategories,
  useSubcategories,
} from "../../hooks/useInventory";
import { updateItemSchema } from "../../utils/inventory.validation";
import { EditItemData } from "../../types/inventory.types";
import Layout from "../../components/Layout";

const EditItemPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: itemData, isLoading } = useItem(id || "");
  const updateItem = useUpdateItem();
  const { data: categoriesData } = useCategories(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const { data: subcategoriesData } = useSubcategories(
    selectedCategoryId,
    true,
  );

  const [formData, setFormData] = useState<EditItemData>({
    depreciation: null,
  } as EditItemData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!itemData?.data) return;

    const item = itemData.data;

    setFormData({
      name: item.name,
      description: item.description,
      category: item.category,
      subcategory: item.subcategory,
      sku: item.sku,
      barcode: item.barcode,
      customId: item.customId,
      photos: item.photos,
      specifications: item.specifications,
      quantity: {
        total: item.quantity.total,
        rented: item.quantity.rented,
        maintenance: item.quantity.maintenance,
        damaged: item.quantity.damaged,
      },
      pricing: item.pricing,
      // depreciation: {
      //   initialValue: 0,
      //   depreciationRate: 10,
      //   purchaseDate: '',
      // },
      location: item.location,
      lowStockThreshold: item.lowStockThreshold,
      isActive: item.isActive,
    });

    const category = categoriesData?.data.find((c) => c.name === item.category);
    if (category) setSelectedCategoryId(category._id);
  }, [itemData, categoriesData]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;

    if (name.startsWith("quantity.")) {
      const field = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        quantity: {
          ...prev.quantity!,
          [field]: Number(value) || 0,
        },
      }));
      return;
    }

    if (name.startsWith("pricing.")) {
      const field = name.split(".")[1];
      setFormData((prev) => ({
        ...prev,
        pricing: {
          ...prev.pricing!,
          [field]: Number(value) || 0,
        },
      }));
      return;
    }

    if (name === "category") {
      setFormData((prev) => ({ ...prev, category: value, subcategory: "" }));
      const cat = categoriesData?.data.find((c) => c.name === value);
      setSelectedCategoryId(cat?._id || "");
      return;
    }

    if (type === "checkbox") {
      setFormData((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setErrors({});

    try {
      const dataToSend: EditItemData = { ...formData };

      if (dataToSend.depreciation === null) {
        delete dataToSend.depreciation;
      }

      const validatedData = updateItemSchema.parse(dataToSend);

      await updateItem.mutateAsync({
        id,
        data: validatedData,
      });

      navigate(`/inventory/items/${id}`);
    } catch (error: any) {
      if (error?.errors) {
        const zodErrors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          zodErrors[err.path[0]] = err.message;
        });
        setErrors(zodErrors);
      }
    }
  };

  if (isLoading) {
    return (
      <Layout title="Editar Item" backTo="/inventory/items">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando item...</div>
        </div>
      </Layout>
    );
  }

  if (!itemData?.data) {
    return (
      <Layout title="Editar Item" backTo="/inventory/items">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Item não encontrado</p>
        </div>
      </Layout>
    );
  }

  const categories = categoriesData?.data || [];
  const subcategories = subcategoriesData?.data || [];

  return (
    <Layout title="Editar Item" backTo="/inventory/items">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/inventory/items"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              ← Voltar para o Inventário
            </Link>
          </div>

          {/* Cabeçalho */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Editar Item
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Atualize as informações do item
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Informações do Item
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-8">
              {/* Informações Básicas */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Informações Básicas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Nome *
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={formData.name || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.name}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="sku"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      SKU *
                    </label>
                    <input
                      id="sku"
                      name="sku"
                      type="text"
                      required
                      value={formData.sku || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                    {errors.sku && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.sku}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="category"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Categoria *
                    </label>
                    <select
                      id="category"
                      name="category"
                      required
                      value={formData.category || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                      <option value="">Selecione uma categoria</option>
                      {categories.map((cat) => (
                        <option key={cat._id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    {errors.category && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.category}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="subcategory"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Subcategoria
                    </label>
                    <select
                      id="subcategory"
                      name="subcategory"
                      value={formData.subcategory || ""}
                      onChange={handleChange}
                      disabled={!selectedCategoryId}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-400 text-sm disabled:opacity-50"
                    >
                      <option value="">Selecione uma subcategoria</option>
                      {subcategories.map((sub) => (
                        <option key={sub._id} value={sub.name}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="customId"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      ID Customizado
                    </label>
                    <input
                      id="customId"
                      name="customId"
                      type="text"
                      value={formData.customId || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="barcode"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Código de Barras
                    </label>
                    <input
                      id="barcode"
                      name="barcode"
                      type="text"
                      value={formData.barcode || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label
                      htmlFor="description"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Descrição
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      rows={3}
                      value={formData.description || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Quantidades */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Quantidades
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label
                      htmlFor="quantity.total"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Total
                    </label>
                    <input
                      id="quantity.total"
                      name="quantity.total"
                      type="number"
                      min="0"
                      value={formData.quantity?.total || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quantity.available"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Disponível
                    </label>
                    <input
                      id="quantity.available"
                      name="quantity.available"
                      type="number"
                      min="0"
                      value={itemData?.data?.quantity?.available ?? 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="lowStockThreshold"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Alerta de Estoque Baixo
                    </label>
                    <input
                      id="lowStockThreshold"
                      name="lowStockThreshold"
                      type="number"
                      min="0"
                      value={formData.lowStockThreshold || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Depreciação */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Depreciação
                  </h3>

                  {formData.depreciation ? (
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          depreciation: null,
                        }))
                      }
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"
                    >
                      Remover depreciação
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          depreciation: {
                            initialValue: 0,
                            depreciationRate: 10,
                            purchaseDate: "",
                          },
                        }))
                      }
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"
                    >
                      Adicionar depreciação
                    </button>
                  )}
                </div>

                {formData.depreciation && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Valor inicial
                      </label>
                      <input
                        type="number"
                        placeholder="Valor inicial"
                        value={formData.depreciation?.initialValue ?? ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            depreciation: {
                              ...prev.depreciation!,
                              initialValue: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Data da compra
                      </label>
                      <input
                        type="date"
                        value={formData.depreciation?.purchaseDate ?? ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            depreciation: {
                              ...prev.depreciation!,
                              purchaseDate: e.target.value,
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Taxa (%)
                      </label>
                      <input
                        type="number"
                        placeholder="Taxa (%)"
                        value={formData.depreciation?.depreciationRate ?? ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            depreciation: {
                              ...prev.depreciation!,
                              depreciationRate: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Preços */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Preços
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label
                      htmlFor="pricing.dailyRate"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Taxa Diária (R$)
                    </label>
                    <input
                      id="pricing.dailyRate"
                      name="pricing.dailyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.pricing?.dailyRate || 0}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pricing.weeklyRate"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Taxa Semanal (R$)
                    </label>
                    <input
                      id="pricing.weeklyRate"
                      name="pricing.weeklyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.pricing?.weeklyRate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pricing.monthlyRate"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Taxa Mensal (R$)
                    </label>
                    <input
                      id="pricing.monthlyRate"
                      name="pricing.monthlyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.pricing?.monthlyRate || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pricing.depositAmount"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                    >
                      Valor de Depósito (R$)
                    </label>
                    <input
                      id="pricing.depositAmount"
                      name="pricing.depositAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.pricing?.depositAmount || ""}
                      onChange={handleChange}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Localização e Status */}
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="location"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Localização
                  </label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    value={formData.location || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    checked={formData.isActive ?? true}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-gray-500"
                  />
                  <label
                    htmlFor="isActive"
                    className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                  >
                    Item ativo
                  </label>
                </div>
              </div>

              {/* Erro Geral */}
              {errors.submit && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 border border-red-100 dark:border-red-800/30">
                  <div className="flex items-center">
                    <svg
                      className="h-5 w-5 text-red-600 dark:text-red-400 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                      />
                    </svg>
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {errors.submit}
                    </p>
                  </div>
                </div>
              )}

              {/* Botões */}
              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => navigate(`/inventory/items/${id}`)}
                  className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateItem.isPending}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {updateItem.isPending ? (
                    <span className="flex items-center">
                      <svg
                        className="animate-spin h-4 w-4 mr-2 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Salvando...
                    </span>
                  ) : (
                    "Salvar Alterações"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default EditItemPage;
