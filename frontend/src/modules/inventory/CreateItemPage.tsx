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
    trackingType: 'quantity',
    units: [],
    photos: [],
    quantity: {
      total: 0,
      available: 0,
    },
    depreciation: {
      initialValue: 0,
      depreciationRate: 10,
      purchaseDate: '',
    },
    pricing: {
      dailyRate: 0,
    },
    location: '',
    lowStockThreshold: 0,
    isActive: true,
  });

  const [units, setUnits] = useState<Array<{ unitId: string; status: 'available' | 'rented' | 'maintenance' | 'damaged'; location?: string; notes?: string }>>([]);

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
    } else if (name === 'lowStockThreshold') {
      setFormData((prev) => ({
        ...prev,
        lowStockThreshold: parseInt(value) || 0,
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
    setFormData((prev) => ({
      ...prev,
      quantity: {
        ...prev.quantity,
        available: prev.quantity.available ?? prev.quantity.total,
      },
    }));
  }, [formData.quantity.total]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('🚀 HANDLE SUBMIT DISPARADO');
    console.log('📦 formData bruto:', JSON.stringify(formData, null, 2));
    setErrors({});

    try {
      // Criar uma cópia de formData para envio
      const dataToSend: CreateItemData = { ...formData };

      if (formData.trackingType === 'unit') {
        let unitsToSend = units;

        // Se não tiver unidades, cria uma com customId
        if (!unitsToSend.length && formData.customId?.trim()) {
          unitsToSend = [{
            unitId: formData.customId.trim(),
            status: 'available',
            location: formData.location || '',
            notes: '',
          }];
        }

        if (!unitsToSend.length) {
          setErrors({ units: 'Item unitário precisa de ao menos uma unidade' });
          return;
        }

        dataToSend.units = unitsToSend.map((u) => ({
          unitId: u.unitId.trim(),
          status: u.status,
          location: u.location,
          notes: u.notes,
        }));

        // 🔥 AQUI ESTÁ A CORREÇÃO REAL
        const total = dataToSend.units.length;
        const available = dataToSend.units.filter(u => u.status === 'available').length;

        dataToSend.quantity = {
          total,
          available,
          rented: total - available,
          maintenance: 0,
          damaged: 0,
        };
      }

      else if (formData.trackingType === 'quantity') {
        dataToSend.units = [];

        if (!formData.quantity.total || formData.quantity.total <= 0) {
          setErrors({ quantity: 'A quantidade total deve ser maior que zero para itens quantitativos' });
          return;
        }

        // Inicializar valores padrão
        dataToSend.quantity.available = dataToSend.quantity.available ?? 0;
        dataToSend.quantity.rented = dataToSend.quantity.rented ?? 0;
        dataToSend.quantity.maintenance = dataToSend.quantity.maintenance ?? 0;
        dataToSend.quantity.damaged = dataToSend.quantity.damaged ?? 0;
      }
      console.log('🧪 dataToSend ANTES do Zod:', JSON.stringify(dataToSend, null, 2));

      //converte a data antes de enviar
      if (dataToSend.depreciation?.purchaseDate) {
        dataToSend.depreciation.purchaseDate =
          new Date(dataToSend.depreciation.purchaseDate).toISOString();
      }

      const validatedData = createItemSchema.parse(dataToSend);

      console.log('✅ validatedData APÓS Zod:', JSON.stringify(validatedData, null, 2));
      createItem.mutate(validatedData as CreateItemData, {
        onSuccess: () => {
          console.log('✅ ITEM CRIADO COM SUCESSO');
          navigate('/inventory/items');
        },
        onError: (error: any) => {
          console.error('❌ ERRO NA API:', error);
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

            {/* Tipo de Controle */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tipo de Controle de Estoque</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="trackingType"
                      value="quantity"
                      checked={formData.trackingType === 'quantity'}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, trackingType: e.target.value as 'quantity' | 'unit' }));
                        setUnits([]);
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Quantitativo</span>
                  </label>
                  <p className="text-xs text-gray-500 ml-6">Ex: 30 escoramentos, 50 tábuas</p>
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="trackingType"
                      value="unit"
                      checked={formData.trackingType === 'unit'}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, trackingType: e.target.value as 'quantity' | 'unit' }));
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Unitário com ID</span>
                  </label>
                  <p className="text-xs text-gray-500 ml-6">Ex: Furadeira F421, Betoneira B013</p>
                </div>
              </div>
            </div>

            {/* Unidades (para tipo unitário) */}
            {formData.trackingType === 'unit' && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Unidades Individuais</h3>
                <div className="space-y-4">
                  {units.map((unit, index) => (
                    <div key={index} className="flex gap-4 items-start p-4 border border-gray-200 rounded-md">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ID da Unidade *
                        </label>
                        <input
                          type="text"
                          value={unit.unitId}
                          onChange={(e) => {
                            const newUnits = [...units];
                            newUnits[index].unitId = e.target.value;
                            setUnits(newUnits);
                          }}
                          placeholder="Ex: F421, B013"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          value={unit.status}
                          onChange={(e) => {
                            const newUnits = [...units];
                            newUnits[index].status = e.target.value as 'available' | 'rented' | 'maintenance' | 'damaged';
                            setUnits(newUnits);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        >
                          <option value="available">Disponível</option>
                          <option value="rented">Alugado</option>
                          <option value="maintenance">Manutenção</option>
                          <option value="damaged">Danificado</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Localização
                        </label>
                        <input
                          type="text"
                          value={unit.location || ''}
                          onChange={(e) => {
                            const newUnits = [...units];
                            newUnits[index].location = e.target.value;
                            setUnits(newUnits);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newUnits = units.filter((_, i) => i !== index);
                          setUnits(newUnits);
                        }}
                        className="mt-6 px-3 py-2 text-red-600 hover:text-red-800"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setUnits([...units, { unitId: '', status: 'available' }]);
                    }}
                    className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
                  >
                    + Adicionar Unidade
                  </button>
                </div>
              </div>
            )}

            {/* Quantidades (para tipo quantitativo) */}
            {formData.trackingType === 'quantity' && (
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
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!formData.depreciation}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData(prev => ({
                      ...prev,
                      depreciation: {
                        initialValue: 0,
                        depreciationRate: 10,
                        purchaseDate: '',
                      },
                    }));
                  } else {
                    setFormData(prev => ({
                      ...prev,
                      depreciation: undefined,
                    }));
                  }
                }}
              />
              <span className="text-sm text-gray-700">Este item possui depreciação</span>
            </div>

            {formData.depreciation && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Depreciação</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Valor Inicial */}
                  <div>
                    <label htmlFor="initialValue" className="block text-sm font-medium text-gray-700">
                      Valor Inicial *
                    </label>
                    <input
                      id="initialValue"
                      type="number"
                      min="0"
                      required
                      value={formData.depreciation.initialValue ?? ''}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          depreciation: {
                            ...prev.depreciation!,
                            initialValue: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    />
                  </div>

                  {/* Data da Compra */}
                  <div>
                    <label htmlFor="purchaseDate" className="block text-sm font-medium text-gray-700">
                      Data da Compra *
                    </label>
                    <input
                      id="purchaseDate"
                      type="date"
                      required
                      value={formData.depreciation.purchaseDate ?? ''}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          depreciation: {
                            ...prev.depreciation!,
                            purchaseDate: e.target.value,
                          },
                        }))
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    />
                  </div>

                  {/* Taxa */}
                  <div>
                    <label htmlFor="depreciationRate" className="block text-sm font-medium text-gray-700">
                      Taxa de Depreciação (%) *
                    </label>
                    <input
                      id="depreciationRate"
                      type="number"
                      min="0"
                      max="100"
                      value={formData.depreciation.depreciationRate ?? 10}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          depreciation: {
                            ...prev.depreciation!,
                            depreciationRate: Number(e.target.value),
                          },
                        }))
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                    />
                  </div>
                </div>
              </div>
            )}



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
                  <label htmlFor="pricing.biweeklyRate" className="block text-sm font-medium text-gray-700">
                    Taxa Quinzenal (R$)
                  </label>
                  <input
                    id="pricing.biweeklyRate"
                    name="pricing.biweeklyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricing.biweeklyRate || ''}
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
