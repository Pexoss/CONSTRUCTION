import React, { useState } from 'react';
import { data, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { customerService } from '../customers/customer.service';
import { useItems } from '../../hooks/useInventory';
import { CreateRentalData, RentalService, RentalWorkAddress } from '../../types/rental.types';
import { Item } from '../../types/inventory.types';
import Layout from '../../components/Layout';
import axios from 'axios';

interface SelectedItem {
  itemId: string;
  quantity: number;
  unitId?: string;
  rentalType?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  item: Item;
}


const CreateRentalPage: React.FC = () => {
  console.log('CreateRental renderizou')
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [services, setServices] = useState<RentalService[]>([]);
  const [workAddress, setWorkAddress] = useState<RentalWorkAddress | null>(null);
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');

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


  return (
    <Layout title="Novo Aluguel" backTo="/rentals">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Items Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cliente *</h2>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Selecione um cliente</option>
                {customers.map((customer) => (
                  <option key={customer._id} value={customer._id}>
                    {customer.name} - {customer.cpfCnpj}
                  </option>
                ))}
              </select>
            </div>

            {/* Items Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens Disponíveis</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items
                  .filter((item) => item.quantity.available > 0)
                  .map((item) => (
                    <div
                      key={item._id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-sm text-gray-500">
                          R$ {item.pricing.dailyRate}/dia • Disponível: {item.quantity.available}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddItem(item)}
                        className="ml-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                      >
                        Adicionar
                      </button>
                    </div>
                  ))}
              </div>

              {/* Selected Items */}
              {selectedItems.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Itens Selecionados</h2>
                  <div className="space-y-3">
                    {selectedItems.map((selectedItem) => (
                      <div
                        key={selectedItem.itemId}
                        className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-md"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">{selectedItem.item.name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {pickupDate && returnDate
                              ? `R$ ${calculatePrice(
                                selectedItem.item,
                                1,
                                new Date(pickupDate),
                                new Date(returnDate)
                              ).toFixed(2)} por unidade`
                              : 'Selecione as datas'}
                          </div>
                          {selectedItem.item.trackingType === 'unit' && (
                            <select
                              value={selectedItem.unitId || ''}
                              onChange={(e) => {
                                const updated = selectedItems.map((si) =>
                                  si.itemId === selectedItem.itemId ? { ...si, unitId: e.target.value } : si
                                );
                                setSelectedItems(updated);
                              }}
                              className="mt-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 dark:bg-gray-800 dark:text-white"
                            >
                              <option value="">Selecione a unidade</option>
                              {selectedItem.item.units
                                ?.filter((u) => u.status === 'available')
                                .map((unit) => (
                                  <option key={unit.unitId} value={unit.unitId}>
                                    {unit.unitId}
                                  </option>
                                ))}
                            </select>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            max={selectedItem.item.trackingType === 'unit' ? 1 : selectedItem.item.quantity.available}
                            value={selectedItem.quantity}
                            onChange={(e) =>
                              handleQuantityChange(selectedItem.itemId, parseInt(e.target.value) || 1)
                            }
                            disabled={selectedItem.item.trackingType === 'unit'}
                            className="w-20 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:text-white"
                          />
                          <button
                            onClick={() => handleRemoveItem(selectedItem.itemId)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 text-sm font-medium"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Serviços Adicionais */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Serviços Adicionais</h2>
                  <button
                    type="button"
                    onClick={addService}
                    className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    + Adicionar Serviço
                  </button>
                </div>

                {services.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum serviço adicionado. Ex: Frete, Limpeza, Instalação
                  </p>
                )}

                <div className="space-y-3">
                  {services.map((service, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Descrição *
                          </label>
                          <input
                            type="text"
                            value={service.description}
                            onChange={(e) => updateService(index, 'description', e.target.value)}
                            placeholder="Ex: Frete Alfenas-Fama"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Preço (R$) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={service.price}
                            onChange={(e) => updateService(index, 'price', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Quantidade
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={service.quantity}
                            onChange={(e) => updateService(index, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Categoria
                          </label>
                          <input
                            type="text"
                            value={service.category}
                            onChange={(e) => updateService(index, 'category', e.target.value)}
                            placeholder="Ex: frete, limpeza"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Subtotal
                          </label>
                          <input
                            type="text"
                            value={`R$ ${service.subtotal.toFixed(2)}`}
                            disabled
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 sm:text-sm"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => removeService(index)}
                            className="w-full px-3 py-2 text-red-600 hover:text-red-800 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-md text-sm font-medium"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Endereço da Obra */}
              {customerAddresses.length > 0 && (
                <div className="mb-4 mt-8">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Selecionar endereço existente
                  </label>

                  <select
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm"
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
                    <option value="">Selecione um endereço</option>
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

              {selectedCustomerData && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Endereço da Obra (Opcional)</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nome da Obra
                      </label>
                      <input
                        type="text"
                        value={workAddress?.workName || ''}
                        onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), workName: e.target.value } as RentalWorkAddress)}
                        placeholder="Ex: Construção Residencial - Rua X"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Bairro
                        </label>
                        <input
                          type="text"
                          value={workAddress?.neighborhood || ''}
                          onChange={(e) =>
                            setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), neighborhood: e.target.value } as RentalWorkAddress)
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 mt-2">
                          Rua
                        </label>
                        <input
                          type="text"
                          value={workAddress?.street || ''}
                          onChange={(e) =>
                            setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), street: e.target.value } as RentalWorkAddress)
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Número
                        </label>
                        <input
                          type="text"
                          value={workAddress?.number || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), number: e.target.value } as RentalWorkAddress)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          CEP
                        </label>
                        <input
                          type="text"
                          value={workAddress?.zipCode || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), zipCode: e.target.value } as RentalWorkAddress)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Cidade
                        </label>
                        <input
                          type="text"
                          value={workAddress?.city || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), city: e.target.value } as RentalWorkAddress)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Estado
                        </label>
                        <input
                          type="text"
                          value={workAddress?.state || ''}
                          onChange={(e) => setWorkAddress({ ...(workAddress || {} as RentalWorkAddress), state: e.target.value } as RentalWorkAddress)}
                          maxLength={2}
                          placeholder="UF"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Resumo</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Retirada *
                    </label>
                    <input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      required
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data de Devolução *
                    </label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      required
                      min={pickupDate || new Date().toISOString().split('T')[0]}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Desconto (R$)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observações
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="border-t dark:border-gray-700 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Equipamentos:</span>
                      <span className="font-medium dark:text-white">R$ {totals.equipmentSubtotal.toFixed(2)}</span>
                    </div>
                    {totals.servicesSubtotal > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Serviços:</span>
                        <span className="font-medium dark:text-white">R$ {totals.servicesSubtotal.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                      <span className="font-medium dark:text-white">R$ {totals.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Caução:</span>
                      <span className="font-medium dark:text-white">R$ {totals.deposit.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-red-600 dark:text-red-400">
                        <span>Desconto:</span>
                        <span>- R$ {discount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-bold border-t dark:border-gray-700 pt-2">
                      <span className="dark:text-white">Total:</span>
                      <span className="dark:text-white">R$ {totals.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {createMutation.isError && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                      {createMutation.error instanceof Error
                        ? createMutation.error.message
                        : 'Erro ao criar aluguel'}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={createMutation.isPending || selectedItems.length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {createMutation.isPending ? 'Criando...' : 'Criar Aluguel'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CreateRentalPage;
