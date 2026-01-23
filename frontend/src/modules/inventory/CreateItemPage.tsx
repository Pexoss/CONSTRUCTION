import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateItem, useCategories, useSubcategories } from '../../hooks/useInventory';
import { createItemSchema } from '../../utils/inventory.validation';
import { CreateItemData } from '../../types/inventory.types';
import Layout from '../../components/Layout';

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

      //converte a data antes de enviar
      if (dataToSend.depreciation?.purchaseDate) {
        dataToSend.depreciation.purchaseDate =
          new Date(dataToSend.depreciation.purchaseDate).toISOString();
      }

      const validatedData = createItemSchema.parse(dataToSend);
      console.log(validatedData)

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
    <Layout title="Novo Item" backTo="/inventory/items">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            to="/inventory/items"
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
          >
            ← Voltar para o Inventário
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Novo Item</h1>
          <p className="text-sm text-gray-600 mt-1">
            Cadastre um novo item no inventário
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200">
          <form onSubmit={handleSubmit} className="divide-y divide-gray-200">

            {/* Informações Básicas */}
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações Básicas</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nome *
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>

                <div>
                  <label htmlFor="sku" className="block text-sm font-medium text-gray-700 mb-1">
                    SKU *
                  </label>
                  <input
                    id="sku"
                    name="sku"
                    type="text"
                    required
                    value={formData.sku}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                  {errors.sku && <p className="mt-1 text-sm text-red-600">{errors.sku}</p>}
                </div>

                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                    Categoria *
                  </label>
                  <select
                    id="category"
                    name="category"
                    required
                    value={formData.category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
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
                  <label htmlFor="subcategory" className="block text-sm font-medium text-gray-700 mb-1">
                    Subcategoria
                  </label>
                  <select
                    id="subcategory"
                    name="subcategory"
                    value={formData.subcategory}
                    onChange={handleChange}
                    disabled={!selectedCategoryId}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm disabled:bg-gray-50 disabled:text-gray-500"
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
                  <label htmlFor="customId" className="block text-sm font-medium text-gray-700 mb-1">
                    ID Customizado
                  </label>
                  <input
                    id="customId"
                    name="customId"
                    type="text"
                    value={formData.customId}
                    onChange={handleChange}
                    placeholder="Ex: betoneira-13"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="barcode" className="block text-sm font-medium text-gray-700 mb-1">
                    Código de Barras
                  </label>
                  <input
                    id="barcode"
                    name="barcode"
                    type="text"
                    value={formData.barcode}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Descrição
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Tipo de Controle */}
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tipo de Controle de Estoque</h2>
              <div className="space-y-4">
                <div className="flex items-start">
                  <input
                    type="radio"
                    name="trackingType"
                    value="quantity"
                    checked={formData.trackingType === 'quantity'}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, trackingType: e.target.value as 'quantity' | 'unit' }));
                      setUnits([]);
                    }}
                    className="mt-1 mr-3 h-4 w-4 text-gray-700 focus:ring-gray-400"
                  />
                  <div>
                    <label className="text-sm font-medium text-gray-700">Quantitativo</label>
                    <p className="text-sm text-gray-500 mt-1">Ex: 30 escoramentos, 50 tábuas</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <input
                    type="radio"
                    name="trackingType"
                    value="unit"
                    checked={formData.trackingType === 'unit'}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, trackingType: e.target.value as 'quantity' | 'unit' }));
                    }}
                    className="mt-1 mr-3 h-4 w-4 text-gray-700 focus:ring-gray-400"
                  />
                  <div>
                    <label className="text-sm font-medium text-gray-700">Unitário com ID</label>
                    <p className="text-sm text-gray-500 mt-1">Ex: Furadeira F421, Betoneira B013</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Unidades (para tipo unitário) */}
            {formData.trackingType === 'unit' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Unidades Individuais</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setUnits([...units, { unitId: '', status: 'available' }]);
                    }}
                    className="px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    + Adicionar Unidade
                  </button>
                </div>

                {errors.units && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <p className="text-sm text-red-700">{errors.units}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {units.map((unit, index) => (
                    <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                          />
                        </div>

                        <div>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                          >
                            <option value="available">Disponível</option>
                            <option value="rented">Alugado</option>
                            <option value="maintenance">Manutenção</option>
                            <option value="damaged">Danificado</option>
                          </select>
                        </div>

                        <div>
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                          />
                        </div>

                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => {
                              const newUnits = units.filter((_, i) => i !== index);
                              setUnits(newUnits);
                            }}
                            className="w-full px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quantidades (para tipo quantitativo) */}
            {formData.trackingType === 'quantity' && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quantidades</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label htmlFor="quantity.total" className="block text-sm font-medium text-gray-700 mb-1">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                    />
                    {errors.quantity && <p className="mt-1 text-sm text-red-600">{errors.quantity}</p>}
                  </div>

                  <div>
                    <label htmlFor="quantity.available" className="block text-sm font-medium text-gray-700 mb-1">
                      Disponível
                    </label>
                    <input
                      id="quantity.available"
                      name="quantity.available"
                      type="number"
                      min="0"
                      value={formData.quantity.available}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="lowStockThreshold" className="block text-sm font-medium text-gray-700 mb-1">
                      Alerta de Estoque Baixo
                    </label>
                    <input
                      id="lowStockThreshold"
                      name="lowStockThreshold"
                      type="number"
                      min="0"
                      value={formData.lowStockThreshold}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Depreciação */}
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
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
                  className="h-4 w-4 rounded border-gray-300 text-gray-700 focus:ring-gray-400"
                />
                <label className="text-sm font-medium text-gray-700">
                  Este item possui depreciação
                </label>
              </div>

              {formData.depreciation && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Depreciação</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div>
                      <label htmlFor="initialValue" className="block text-sm font-medium text-gray-700 mb-1">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                      />
                    </div>

                    <div>
                      <label htmlFor="purchaseDate" className="block text-sm font-medium text-gray-700 mb-1">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                      />
                    </div>

                    <div>
                      <label htmlFor="depreciationRate" className="block text-sm font-medium text-gray-700 mb-1">
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preços */}
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preços</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="pricing.dailyRate" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.weeklyRate" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.biweeklyRate" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.monthlyRate" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="pricing.depositAmount" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Localização */}
            <div className="p-6">
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Localização
              </label>
              <input
                id="location"
                name="location"
                type="text"
                value={formData.location}
                onChange={handleChange}
                placeholder="Ex: Galpão A - Prateleira 3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 text-sm"
              />
            </div>

            {/* Erro Geral */}
            {errors.submit && (
              <div className="p-6 bg-red-50 border-y border-red-100">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <p className="text-sm font-medium text-red-700">{errors.submit}</p>
                </div>
              </div>
            )}

            {/* Botões */}
            <div className="p-6 bg-gray-50 rounded-b-lg">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => navigate('/inventory/items')}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createItem.isPending}
                  className="px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createItem.isPending ? (
                    <span className="flex items-center">
                      <svg className="animate-spin h-4 w-4 mr-2 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Criando...
                    </span>
                  ) : (
                    'Criar Item'
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default CreateItemPage;
