import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useItem, useUpdateItem, useCategories, useSubcategories } from '../../hooks/useInventory';
import { updateItemSchema } from '../../utils/inventory.validation';
import { CreateItemData } from '../../types/inventory.types';

const EditItemPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: itemData, isLoading } = useItem(id || '');
  const updateItem = useUpdateItem();
  const { data: categoriesData } = useCategories(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const { data: subcategoriesData } = useSubcategories(selectedCategoryId, true);

  const [formData, setFormData] = useState<Partial<CreateItemData>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (itemData?.data) {
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
        quantity: item.quantity,
        pricing: item.pricing,
        location: item.location,
        lowStockThreshold: item.lowStockThreshold,
        isActive: item.isActive,
      });
      // Find category ID from name for subcategory loading
      const category = categoriesData?.data.find((cat) => cat.name === item.category);
      if (category) {
        setSelectedCategoryId(category._id);
      }
    }
  }, [itemData, categoriesData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('quantity.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        quantity: {
          ...(prev.quantity || { total: 0, available: 0 }),
          [field]: parseInt(value) || 0,
        },
      }));
    } else if (name.startsWith('pricing.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        pricing: {
          ...(prev.pricing || { dailyRate: 0 }),
          [field]: parseFloat(value) || 0,
        },
      }));
    } else if (name === 'category') {
      setFormData((prev) => ({ ...prev, category: value, subcategory: '' }));
      const category = categoriesData?.data.find((cat) => cat.name === value);
      setSelectedCategoryId(category?._id || '');
    } else if (name === 'isActive') {
      setFormData((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setErrors({});

    try {
      const validatedData = updateItemSchema.parse(formData);
      updateItem.mutate(
        { id, data: validatedData as Partial<CreateItemData> },
        {
          onSuccess: () => {
            navigate(`/inventory/items/${id}`);
          },
          onError: (error: any) => {
            setErrors({
              submit: error?.response?.data?.message || 'Erro ao atualizar item. Tente novamente.',
            });
          },
        }
      );
    } catch (error: any) {
      if (error.errors) {
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
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-600">Carregando item...</div>
      </div>
    );
  }

  if (!itemData?.data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <p className="text-red-800">Item não encontrado</p>
      </div>
    );
  }

  const categories = categoriesData?.data || [];
  const subcategories = subcategoriesData?.data || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Editar Item</h2>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
            {/* Informações Básicas */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Informações Básicas</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Nome *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
                    SKU *
                  </label>
                  <input
                    id="sku"
                    name="sku"
                    type="text"
                    required
                    value={formData.sku || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                  {errors.sku && <p className="mt-1 text-sm text-red-600">{errors.sku}</p>}
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                    Categoria *
                  </label>
                  <select
                    id="category"
                    name="category"
                    required
                    value={formData.category || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {errors.category && <p className="mt-1 text-sm text-red-600">{errors.category}</p>}
                </div>

                <div>
                  <label htmlFor="subcategory" className="block text-sm font-medium text-gray-700">
                    Subcategoria
                  </label>
                  <select
                    id="subcategory"
                    name="subcategory"
                    value={formData.subcategory || ''}
                    onChange={handleChange}
                    disabled={!selectedCategoryId}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
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
                  <label htmlFor="customId" className="block text-sm font-medium text-gray-700">
                    ID Customizado
                  </label>
                  <input
                    id="customId"
                    name="customId"
                    type="text"
                    value={formData.customId || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="barcode" className="block text-sm font-medium text-gray-700">
                    Código de Barras
                  </label>
                  <input
                    id="barcode"
                    name="barcode"
                    type="text"
                    value={formData.barcode || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Descrição
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={formData.description || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Quantidades */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quantidades</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="quantity.total" className="block text-sm font-medium text-gray-700">
                    Total
                  </label>
                  <input
                    id="quantity.total"
                    name="quantity.total"
                    type="number"
                    min="0"
                    value={formData.quantity?.total || 0}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="quantity.available" className="block text-sm font-medium text-gray-700">
                    Disponível
                  </label>
                  <input
                    id="quantity.available"
                    name="quantity.available"
                    type="number"
                    min="0"
                    value={formData.quantity?.available || 0}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="lowStockThreshold" className="block text-sm font-medium text-gray-700">
                    Alerta de Estoque Baixo
                  </label>
                  <input
                    id="lowStockThreshold"
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    value={formData.lowStockThreshold || 0}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Preços */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Preços</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pricing.dailyRate" className="block text-sm font-medium text-gray-700">
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
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.weeklyRate" className="block text-sm font-medium text-gray-700">
                    Taxa Semanal (R$)
                  </label>
                  <input
                    id="pricing.weeklyRate"
                    name="pricing.weeklyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricing?.weeklyRate || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.monthlyRate" className="block text-sm font-medium text-gray-700">
                    Taxa Mensal (R$)
                  </label>
                  <input
                    id="pricing.monthlyRate"
                    name="pricing.monthlyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricing?.monthlyRate || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.depositAmount" className="block text-sm font-medium text-gray-700">
                    Valor de Depósito (R$)
                  </label>
                  <input
                    id="pricing.depositAmount"
                    name="pricing.depositAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricing?.depositAmount || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Localização */}
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                Localização
              </label>
              <input
                id="location"
                name="location"
                type="text"
                value={formData.location || ''}
                onChange={handleChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            {/* Status */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="isActive"
                  checked={formData.isActive ?? true}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-700">Item ativo</span>
              </label>
            </div>

            {errors.submit && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{errors.submit}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate(`/inventory/items/${id}`)}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateItem.isPending}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateItem.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditItemPage;
