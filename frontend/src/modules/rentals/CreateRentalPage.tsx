import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { rentalService } from './rental.service';
import { customerService } from '../customers/customer.service';
import { useItems } from '../../hooks/useInventory';
import { CreateRentalData } from '../../types/rental.types';
import { Item } from '../../types/inventory.types';

interface SelectedItem {
  itemId: string;
  quantity: number;
  item: Item;
}

const CreateRentalPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
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
    if (!pickupDate || !returnDate) return { subtotal: 0, deposit: 0, total: 0 };

    const startDate = new Date(pickupDate);
    const endDate = new Date(returnDate);

    let subtotal = 0;
    let deposit = 0;

    selectedItems.forEach((selectedItem) => {
      const itemPrice = calculatePrice(selectedItem.item, selectedItem.quantity, startDate, endDate);
      subtotal += itemPrice;
      deposit += (selectedItem.item.pricing.depositAmount || 0) * selectedItem.quantity;
    });

    const total = subtotal - discount;

    return { subtotal, deposit, total };
  };

  const handleAddItem = (item: Item) => {
    const existingIndex = selectedItems.findIndex((si) => si.itemId === item._id);
    if (existingIndex >= 0) {
      const updated = [...selectedItems];
      updated[existingIndex].quantity += 1;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || selectedItems.length === 0 || !pickupDate || !returnDate) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    const data: CreateRentalData = {
      customerId: selectedCustomer,
      items: selectedItems.map((si) => ({
        itemId: si.itemId,
        quantity: si.quantity,
      })),
      dates: {
        pickupScheduled: pickupDate,
        returnScheduled: returnDate,
      },
      pricing: {
        discount,
      },
      notes,
    };

    createMutation.mutate(data);
  };

  const totals = calculateTotals();
  const items = itemsData?.data || [];
  const customers = customersData?.data || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Novo Aluguel</h1>

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
            </div>

            {/* Selected Items */}
            {selectedItems.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Itens Selecionados</h2>
                <div className="space-y-3">
                  {selectedItems.map((selectedItem) => (
                    <div
                      key={selectedItem.itemId}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-md"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{selectedItem.item.name}</div>
                        <div className="text-sm text-gray-500">
                          {pickupDate && returnDate
                            ? `R$ ${calculatePrice(
                                selectedItem.item,
                                1,
                                new Date(pickupDate),
                                new Date(returnDate)
                              ).toFixed(2)} por unidade`
                            : 'Selecione as datas'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="1"
                          max={selectedItem.item.quantity.available}
                          value={selectedItem.quantity}
                          onChange={(e) =>
                            handleQuantityChange(selectedItem.itemId, parseInt(e.target.value) || 1)
                          }
                          className="w-20 border border-gray-300 rounded-md px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => handleRemoveItem(selectedItem.itemId)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo</h2>

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

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">R$ {totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Caução:</span>
                    <span className="font-medium">R$ {totals.deposit.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>Desconto:</span>
                      <span>- R$ {discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>R$ {totals.total.toFixed(2)}</span>
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
  );
};

export default CreateRentalPage;
