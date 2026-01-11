import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateItem, useCategories, useSubcategories } from '../../hooks/useInventory';
import { createItemSchema } from '../../utils/inventory.validation';
import { CreateItemData } from '../../types/inventory.types';

const CreateItemPage: React.FC = () => {
  const navigate = useNavigate();
  const createItem = useCreateItem();
  const { data: categoriesData } = useCategories(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const { data: subcategoriesData } = useSubcategories(selectedCategoryId, true);

  const [formData, setFormData] = useState<CreateItemData>({
    name: '',
    description: '',
    category: '',
    subcategory: '',
    sku: '',
    barcode: '',
    customId: '',
    photos: [],
    quantity: {
      total: 0,
      available: 0,
    },
    pricing: {
      dailyRate: 0,
    },
    location: '',
    lowStockThreshold: 0,
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name.startsWith('quantity.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        quantity: {
          ...prev.quantity,
          [field]: parseInt(value) || 0,
        },
      }));
    } else if (name.startsWith('pricing.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        pricing: {
          ...prev.pricing,
          [field]: parseFloat(value) || 0,
        },
      }));
    } else if (name === 'category') {
      setFormData((prev) => ({ ...prev, category: value, subcategory: '' }));
      setSelectedCategoryId(value);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  // Calculate available when total changes
  useEffect(() => {
    if (formData.quantity.total > 0 && !formData.quantity.available) {
      setFormData((prev) => ({
        ...prev,
        quantity: {
          ...prev.quantity,
          available: prev.quantity.total,
        },
      }));
    }
  }, [formData.quantity.total, formData.quantity.available]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = createItemSchema.parse(formData);
      createItem.mutate(validatedData as CreateItemData, {
        onSuccess: () => {
          navigate('/inventory/items');
        },
        onError: (error: any) => {
          setErrors({
            submit: error?.response?.data?.message || 'Erro ao criar item. Tente novamente.',
          });
        },
      });
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

  const categories = categoriesData?.data || [];
  const subcategories = subcategoriesData?.data || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Novo Item</h2>
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
                    value={formData.name}
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
                    value={formData.sku}
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
                    value={formData.category}
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
                    value={formData.subcategory}
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
                    ID Customizado (ex: betoneira 13)
                  </label>
                  <input
                    id="customId"
                    name="customId"
                    type="text"
                    value={formData.customId}
                    onChange={handleChange}
                    placeholder="betoneira-13"
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
                    value={formData.barcode}
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
                    value={formData.description}
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
                    Total *
                  </label>
                  <input
                    id="quantity.total"
                    name="quantity.total"
                    type="number"
                    min="0"
                    required
                    value={formData.quantity.total}
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
                    value={formData.quantity.available}
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
                    value={formData.lowStockThreshold}
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
                    Taxa Diária (R$) *
                  </label>
                  <input
                    id="pricing.dailyRate"
                    name="pricing.dailyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.pricing.dailyRate}
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
                    value={formData.pricing.weeklyRate || ''}
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
                    value={formData.pricing.monthlyRate || ''}
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
                    value={formData.pricing.depositAmount || ''}
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
                value={formData.location}
                onChange={handleChange}
                placeholder="Ex: Galpão A - Prateleira 3"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>

            {errors.submit && (
              <div className="rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{errors.submit}</p>
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/inventory/items')}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createItem.isPending}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createItem.isPending ? 'Criando...' : 'Criar Item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateItemPage;
