import React, { useState, useMemo } from 'react';
import { data, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { customerService } from '../customers/customer.service';
import { useItems } from '../../hooks/useInventory';
import { CreateRentalData, RentalService, RentalWorkAddress } from '../../types/rental.types';
import { Item } from '../../types/inventory.types';
import Layout from '../../components/Layout';
import axios from 'axios';
import { filterReferenceElements } from 'recharts/types/state/selectors/axisSelectors';

interface SelectedItem {
  itemId: string;
  quantity: number;
  unitId?: string;
  rentalType?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  item: Item;
}


const CreateRentalPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [services, setServices] = useState<RentalService[]>([]);
  const [workAddress, setWorkAddress] = useState<RentalWorkAddress | null>(null);
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => rentalService.getCategories(true),
  });

  const [sort, setSort] = useState<'name' | 'name_desc' | 'price' | 'price_desc' | 'available'>('name');

  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customerService.getCustomers({ limit: 100 }),
  });

  const { data: itemsData } = useItems({ isActive: true, limit: 100 });
  const createMutation = useMutation({
    mutationFn: (data: CreateRentalData) => rentalService.createRental(data),
    onSuccess: () => {
      navigate('/rentals');
    },
  });

  const calculatePrice = (item: Item, quantity: number, startDate: Date, endDate: Date): number => {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return 0;

    let price = 0;
    if (item.pricing.monthlyRate && days >= 30) {
      const months = Math.floor(days / 30);
      const remainingDays = days % 30;
      price = months * item.pricing.monthlyRate + remainingDays * item.pricing.dailyRate;
    } else if (item.pricing.weeklyRate && days >= 7) {
      const weeks = Math.floor(days / 7);
      const remainingDays = days % 7;
      price = weeks * item.pricing.weeklyRate + remainingDays * item.pricing.dailyRate;
    } else {
      price = days * item.pricing.dailyRate;
    }

    return price * quantity;
  };

  const calculateTotals = () => {
    if (!pickupDate || !returnDate) return { equipmentSubtotal: 0, servicesSubtotal: 0, subtotal: 0, deposit: 0, total: 0 };

    const startDate = new Date(pickupDate);
    const endDate = new Date(returnDate);

    let equipmentSubtotal = 0;
    let servicesSubtotal = 0;
    let deposit = 0;

    selectedItems.forEach((selectedItem) => {
      const itemPrice = calculatePrice(selectedItem.item, selectedItem.quantity, startDate, endDate);
      equipmentSubtotal += itemPrice;
      deposit += (selectedItem.item.pricing.depositAmount || 0) * selectedItem.quantity;
    });

    services.forEach((service) => {
      servicesSubtotal += service.subtotal;
    });

    const subtotal = equipmentSubtotal + servicesSubtotal;
    const total = subtotal - discount;

    return { equipmentSubtotal, servicesSubtotal, subtotal, deposit, total };
  };

  const handleAddItem = (item: Item) => {
    if (item.trackingType === 'unit') {
      const availableUnits = item.units?.filter((u) => u.status === 'available') || [];
      if (availableUnits.length === 0) {
        alert(`O item "${item.name}" não possui unidades disponíveis para aluguel.`);
        return;
      }
    }

    const existingIndex = selectedItems.findIndex((si) => si.itemId === item._id);
    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      if (item.trackingType !== 'unit') {
        updated[existingIndex].quantity += 1;
      }
      setSelectedItems(updated);
    } else {
      setSelectedItems([...selectedItems, { itemId: item._id, quantity: 1, item }]);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((si) => si.itemId !== itemId));
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    setSelectedItems(
      selectedItems.map((si) => (si.itemId === itemId ? { ...si, quantity } : si))
    );
  };

  const addService = () => {
    setServices([
      ...services,
      {
        description: '',
        price: 0,
        quantity: 1,
        subtotal: 0,
        category: '',
      },
    ]);
  };

  const updateService = (index: number, field: keyof RentalService, value: any) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], [field]: value };

    // Recalcular subtotal
    if (field === 'price' || field === 'quantity') {
      newServices[index].subtotal = newServices[index].price * newServices[index].quantity;
    }

    setServices(newServices);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer || selectedItems.length === 0 || !pickupDate || !returnDate) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    //format dates
    const formatDateToISO = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toISOString();
    };

    for (const si of selectedItems) {
      if (si.item.trackingType === 'unit' && !si.unitId) {
        alert(`O item "${si.item.name}" precisa de um unitId válido.`);
        return;
      }
    }

    const servicesToSend = services.map((s) => ({
      description: s.description.trim(),
      price: Number(s.price) || 0,
      quantity: Number(s.quantity) || 1,
      subtotal: (Number(s.price) || 0) * (Number(s.quantity) || 1),
      category: s.category?.trim() || '',
    }));

    const data: CreateRentalData = {
      customerId: selectedCustomer,
      items: selectedItems.map((si) => ({
        itemId: si.itemId,
        unitId: si.item.trackingType === 'unit' ? si.unitId : undefined,
        quantity: si.quantity,
        rentalType: si.rentalType || 'daily',
      })),

      services: servicesToSend.length > 0 ? servicesToSend : undefined,
      workAddress: workAddress || undefined,
      dates: {
        pickupScheduled: formatDateToISO(pickupDate),
        returnScheduled: formatDateToISO(returnDate),
      },
      pricing: {
        discount,
      },
      notes,
    };

    createMutation.mutate(data, {
      onSuccess: (res) => {
      },
      onError: (err: any) => {
      },
    });
  };

  const totals = calculateTotals();
  const items = itemsData?.data || [];
  const customers = customersData?.data || [];
  const selectedCustomerData = customers.find(
    (c) => c._id === selectedCustomer
  ) ?? null;

  const customerAddresses = selectedCustomerData?.addresses ?? [];

  const addressOptions =
    selectedCustomerData?.addresses?.map((address, index) => ({
      label:
        address.type === 'work'
          ? address.workName || `Obra ${index + 1}`
          : address.type === 'main'
            ? 'Principal'
            : `Outro ${index + 1}`,
      value: index,
    })) ?? [];

  const filteredItems = items.filter(item => {
    if (item.quantity.available <= 0) return false;

    if (category && item.category !== category) return false;

    if (search) {
      const term = search.toLowerCase();

      const matches =
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term) ||
        item.barcode?.toLowerCase().includes(term) ||
        item.customId?.toLowerCase().includes(term);

      if (!matches) return false;
    }

    return true;
  });

  const handleClearFilters = () => {
    setSearch('');
    setCategory('');
  };

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];

    switch (sort) {
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));

      case 'name_desc':
        return list.sort((a, b) => b.name.localeCompare(a.name));

      case 'price':
        return list.sort(
          (a, b) => (a.pricing?.dailyRate ?? 0) - (b.pricing?.dailyRate ?? 0)
        );

      case 'price_desc':
        return list.sort(
          (a, b) => (b.pricing?.dailyRate ?? 0) - (a.pricing?.dailyRate ?? 0)
        );

      case 'available':
        return list.sort(
          (a, b) => (b.quantity.available ?? 0) - (a.quantity.available ?? 0)
        );

      default:
        return list;
    }
  }, [filteredItems, sort]);

  return (
    <Layout title="Novo Aluguel" backTo="/rentals">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          {/* Left Column - Items Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Cliente *</h2>
                <span className="text-xs text-gray-500">Obrigatório</span>
              </div>
              <div className="relative">
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black appearance-none bg-white"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((customer) => (
                    <option key={customer._id} value={customer._id}>
                      {customer.name} - {customer.cpfCnpj}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {selectedCustomer && selectedCustomerData && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Cliente selecionado:</span> {selectedCustomerData.name}
                  </p>
                </div>
              )}
            </div>

            {/* Items Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Itens Disponíveis</h2>
                  <p className="text-sm text-gray-600 mt-1">Busque e filtre os itens para alugar</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-gray-700">
                    {items.filter(item => item.quantity.available > 0).length} itens disponíveis
                  </span>
                </div>
              </div>

              {/* Barra de busca e filtros */}
              <div className="mb-6 space-y-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar por nome, descrição ou código..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 w-full border border-gray-300 rounded-lg px-4 py-3"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Filtrar por categoria
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2.5"
                    >
                      <option value="">Todas as categorias</option>
                      {categories.map(cat => (
                        <option key={cat._id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium"
                    >
                      Limpar filtros
                    </button>

                    <button
                      type="button"
                      className="px-4 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    // onClick={handleAdvancedFilter} - lógica a ser implementada
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      Filtros
                    </button>
                  </div>
                </div>
              </div>

              {filteredItems.map(item => item.quantity.available > 0).length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                  <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">Nenhum item encontrado</h3>
                  <p className="mt-2 text-gray-600 max-w-md mx-auto">
                    {items.length === 0
                      ? "Não há itens cadastrados no sistema."
                      : "Tente ajustar os filtros ou termos da busca."}
                  </p>
                  {items.length > 0 && (
                    <button onClick={handleClearFilters}>
                      Limpar filtros
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Contador de resultados filtrados */}
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {filteredItems.length} itens disponíveis
                    </span>


                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-700">Ordenar por:</label>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as any)}
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                      >

                        <option value="name">Nome A-Z</option>
                        <option value="name_desc">Nome Z-A</option>
                        <option value="price">Preço menor</option>
                        <option value="price_desc">Preço maior</option>
                        <option value="available">Disponibilidade</option>
                      </select>
                    </div>
                  </div>

                  {/* Lista de itens */}
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {sortedItems
                      .map((item) => (
                        <div
                          key={item._id}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors group"
                        >
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-medium text-gray-900">{item.name}</h3>
                                  <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                                    {item.category}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                  <span className="font-medium text-gray-900">R$ {item.pricing.dailyRate}/dia</span>
                                  <span className="mx-2">•</span>
                                  <span className="inline-flex items-center">
                                    <svg className="w-4 h-4 mr-1 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Disponível: {item.quantity.available}
                                  </span>
                                </div>
                                {item.description && (
                                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{item.description}</p>
                                )}
                              </div>
                              <div className="hidden group-hover:block ml-4">
                                {/* <span className="text-xs font-medium px-2 py-1 bg-black text-white rounded-full">
                                  Código: {item.code || item._id.slice(-6)}
                                </span> */}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleAddItem(item)}
                            className="ml-4 bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Adicionar
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Itens Selecionados</h2>
                    <span className="text-sm font-medium text-gray-700">
                      {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {selectedItems.map((selectedItem) => (
                      <div
                        key={selectedItem.itemId}
                        className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium text-gray-900">{selectedItem.item.name}</h3>
                              <span className="text-sm font-medium text-gray-700">
                                {pickupDate && returnDate
                                  ? `R$ ${calculatePrice(
                                    selectedItem.item,
                                    1,
                                    new Date(pickupDate),
                                    new Date(returnDate)
                                  ).toFixed(2)}/unidade`
                                  : 'Defina as datas'}
                              </span>
                            </div>
                            {selectedItem.item.trackingType === 'unit' && (
                              <div className="mt-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Selecione a unidade *
                                </label>
                                <select
                                  value={selectedItem.unitId || ''}
                                  onChange={(e) => {
                                    const updated = selectedItems.map((si) =>
                                      si.itemId === selectedItem.itemId ? { ...si, unitId: e.target.value } : si
                                    );
                                    setSelectedItems(updated);
                                  }}
                                  required
                                  className="w-full md:w-auto border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                                >
                                  <option value="">Selecione...</option>
                                  {selectedItem.item.units
                                    ?.filter((u) => u.status === 'available')
                                    .map((unit) => (
                                      <option key={unit.unitId} value={unit.unitId}>
                                        Unidade: {unit.unitId}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 ml-4">
                            <div className="flex items-center gap-2">
                              <label className="text-sm text-gray-700">Qtd:</label>
                              <input
                                type="number"
                                min="1"
                                max={selectedItem.item.quantity.available}
                                value={selectedItem.quantity}
                                onChange={(e) =>
                                  handleQuantityChange(selectedItem.itemId, parseInt(e.target.value) || 1)
                                }
                                className="w-20 border border-gray-300 rounded-md px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                              />
                            </div>
                            <button
                              onClick={() => handleRemoveItem(selectedItem.itemId)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Serviços Adicionais */}
              <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Serviços Adicionais</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      Ex: Frete, Limpeza, Instalação, etc.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addService}
                    className="bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Adicionar Serviço
                  </button>
                </div>

                {services.length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="mt-2 text-gray-600">Nenhum serviço adicionado</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {services.map((service, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                        {/* Primeira linha - 3 campos */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                          <div className="md:col-span-5">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Descrição *
                            </label>
                            <input
                              type="text"
                              value={service.description}
                              onChange={(e) => updateService(index, 'description', e.target.value)}
                              placeholder="Ex: Frete Alfenas-Fama"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Categoria
                            </label>
                            <input
                              type="text"
                              value={service.category}
                              onChange={(e) => updateService(index, 'category', e.target.value)}
                              placeholder="Ex: frete, limpeza"
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Subtotal
                            </label>
                            <div className="px-3 py-2 border border-gray-300 bg-gray-50 rounded-md text-sm font-medium text-gray-900">
                              R$ {service.subtotal.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Segunda linha - 3 campos */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                          <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Preço Unitário (R$) *
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500 text-sm">R$</span>
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={service.price}
                                onChange={(e) => updateService(index, 'price', parseFloat(e.target.value) || 0)}
                                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                              />
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Quantidade
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={service.quantity}
                              onChange={(e) => updateService(index, 'quantity', parseInt(e.target.value) || 1)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm text-center"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <div className="flex items-end justify-between gap-3">
                              <div className="flex-1">
                                <div className="text-sm text-gray-500 mb-1">Cálculo:</div>
                                <div className="text-xs text-gray-600 font-medium">
                                  R$ {service.price.toFixed(2)} × {service.quantity} = R$ {service.subtotal.toFixed(2)}
                                </div>
                              </div>

                              <div>
                                <button
                                  type="button"
                                  onClick={() => removeService(index)}
                                  className="p-2.5 text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 hover:border-red-300 rounded-md transition-colors flex items-center justify-center"
                                  title="Remover serviço"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Endereço da Obra */}
              {selectedCustomerData && (
                <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Endereço da Obra</h2>
                      <p className="text-sm text-gray-600 mt-1">Opcional - para entrega no local</p>
                    </div>
                    {customerAddresses.length > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Usar endereço salvo:</label>
                        <select
                          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                          onChange={(e) => {
                            const index = Number(e.target.value);
                            const addr = customerAddresses[index];
                            if (!addr) return;

                            setWorkAddress({
                              workName: addr.workName || '',
                              street: addr.street,
                              number: addr.number,
                              neighborhood: addr.neighborhood,
                              city: addr.city,
                              state: addr.state,
                              zipCode: addr.zipCode,
                            });
                          }}
                        >
                          <option value="">Selecione...</option>
                          {customerAddresses.map((address, index) => (
                            <option key={index} value={index}>
                              {address.type === 'work'
                                ? address.workName || `Obra ${index + 1}`
                                : address.type === 'main'
                                  ? 'Principal'
                                  : `Outro ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nome da Obra
                        </label>
                        <input
                          type="text"
                          value={workAddress?.workName || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), workName: e.target.value } as RentalWorkAddress)}
                          placeholder="Ex: Construção Residencial"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          CEP
                        </label>
                        <input
                          type="text"
                          value={workAddress?.zipCode || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), zipCode: e.target.value } as RentalWorkAddress)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Rua
                        </label>
                        <input
                          type="text"
                          value={workAddress?.street || ''}
                          onChange={(e) =>
                            setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), street: e.target.value } as RentalWorkAddress)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Número
                        </label>
                        <input
                          type="text"
                          value={workAddress?.number || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), number: e.target.value } as RentalWorkAddress)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Bairro
                        </label>
                        <input
                          type="text"
                          value={workAddress?.neighborhood || ''}
                          onChange={(e) =>
                            setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), neighborhood: e.target.value } as RentalWorkAddress)
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cidade
                        </label>
                        <input
                          type="text"
                          value={workAddress?.city || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), city: e.target.value } as RentalWorkAddress)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Estado
                        </label>
                        <input
                          type="text"
                          value={workAddress?.state || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), state: e.target.value } as RentalWorkAddress)}
                          maxLength={2}
                          placeholder="UF"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-black text-sm uppercase"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200 p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Resumo do Aluguel</h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Retirada *
                    </label>
                    <input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data de Devolução *
                    </label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      required
                      min={pickupDate || new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Desconto (R$)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Observações
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Instruções especiais, detalhes da obra, etc."
                      className="w-full border border-gray-300 rounded-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
                    />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Equipamentos:</span>
                    <span className="font-medium text-gray-900">R$ {totals.equipmentSubtotal.toFixed(2)}</span>
                  </div>
                  {totals.servicesSubtotal > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Serviços:</span>
                      <span className="font-medium text-gray-900">R$ {totals.servicesSubtotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium text-gray-900">R$ {totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Caução:</span>
                    <span className="font-medium text-gray-900">R$ {totals.deposit.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between items-center text-red-600">
                      <span>Desconto:</span>
                      <span className="font-medium">- R$ {discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                    <span className="text-lg font-bold text-gray-900">Total:</span>
                    <span className="text-lg font-bold text-gray-900">R$ {totals.total.toFixed(2)}</span>
                  </div>
                </div>

                {createMutation.isError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-800">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        {createMutation.error instanceof Error
                          ? createMutation.error.message
                          : 'Erro ao criar aluguel'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || selectedItems.length === 0}
                    className={`w-full py-3.5 px-4 rounded-md text-sm font-medium transition-colors ${createMutation.isPending || selectedItems.length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-black hover:bg-gray-800 text-white'
                      }`}
                  >
                    {createMutation.isPending ? (
                      <div className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Criando aluguel...
                      </div>
                    ) : selectedItems.length === 0 ? (
                      'Selecione pelo menos 1 item'
                    ) : (
                      `Criar Aluguel • R$ ${totals.total.toFixed(2)}`
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CreateRentalPage;
