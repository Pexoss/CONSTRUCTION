import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { customerService } from './customer.service';
import { CreateCustomerData, CustomerAddress } from '../../types/customer.types';
import Layout from '../../components/Layout';

const CreateCustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateCustomerData>({
    name: '',
    cpfCnpj: '',
    email: '',
    phone: '',
    addresses: [],
    notes: '',
    isBlocked: false,
  });

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);

  const createMutation = useMutation({
    mutationFn: (data: CreateCustomerData) => customerService.createCustomer(data),
    onSuccess: () => {
      navigate('/customers');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Adicionar endereços ao formData
    const submitData = {
      ...formData,
      addresses: addresses.length > 0 ? addresses : undefined,
    };
    createMutation.mutate(submitData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const addAddress = () => {
    setAddresses([
      ...addresses,
      {
        type: 'main',
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'Brasil',
        isDefault: addresses.length === 0, 
        _isSaved: false, 
      },
    ]);
  };

  const updateAddress = (index: number, field: keyof CustomerAddress, value: any) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };

    // Se marcar como default, remover default de outros
    if (field === 'isDefault' && value) {
      newAddresses.forEach((addr, i) => {
        if (i !== index) addr.isDefault = false;
      });
    }

    setAddresses(newAddresses);
  };

  const removeAddress = (index: number) => {
    const newAddresses = addresses.filter((_, i) => i !== index);
    // Se o removido era default, marcar o primeiro como default
    if (newAddresses.length > 0 && !newAddresses.some((a) => a.isDefault)) {
      newAddresses[0].isDefault = true;
    }
    setAddresses(newAddresses);
  };

  return (
    <Layout title="Novo Cliente" backTo="/customers">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link
            to="/customers"
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
          >
            ← Voltar para Clientes
          </Link>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">

          {createMutation.isError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Erro ao criar cliente'}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Nome *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="cpfCnpj" className="block text-sm font-medium text-gray-700">
                CPF/CNPJ *
              </label>
              <input
                type="text"
                id="cpfCnpj"
                name="cpfCnpj"
                required
                value={formData.cpfCnpj}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Telefone
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Múltiplos Endereços */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Endereços
                </label>
                <button
                  type="button"
                  onClick={addAddress}
                  className="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  + Adicionar Endereço
                </button>
              </div>

              {addresses.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Nenhum endereço adicionado. Clique em "Adicionar Endereço" para começar.
                </p>
              )}

              <div className="space-y-4">
                {addresses.map((address, index) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        Endereço {index + 1}
                      </h4>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center text-sm">
                          <input
                            type="checkbox"
                            checked={address.isDefault}
                            onChange={(e) => updateAddress(index, 'isDefault', e.target.checked)}
                            className="mr-2"
                          />
                          <span className="text-gray-700 dark:text-gray-300">Padrão</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeAddress(index)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400"
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tipo *
                        </label>
                        <select
                          value={address.type}
                          onChange={(e) => updateAddress(index, 'type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        >
                          <option value="main">Principal</option>
                          <option value="billing">Cobrança</option>
                          <option value="work">Obra</option>
                          <option value="other">Outro</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          CEP *
                        </label>
                        <input
                          type="text"
                          value={address.zipCode}
                          onChange={(e) => updateAddress(index, 'zipCode', e.target.value)}
                          placeholder="00000-000"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Rua *
                        </label>
                        <input
                          type="text"
                          value={address.street}
                          onChange={(e) => updateAddress(index, 'street', e.target.value)}
                          placeholder="Nome da rua"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Número
                        </label>
                        <input
                          type="text"
                          value={address.number || ''}
                          onChange={(e) => updateAddress(index, 'number', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Complemento
                        </label>
                        <input
                          type="text"
                          value={address.complement || ''}
                          onChange={(e) => updateAddress(index, 'complement', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Bairro
                        </label>
                        <input
                          type="text"
                          value={address.neighborhood || ''}
                          onChange={(e) => updateAddress(index, 'neighborhood', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Cidade *
                        </label>
                        <input
                          type="text"
                          value={address.city}
                          onChange={(e) => updateAddress(index, 'city', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Estado *
                        </label>
                        <input
                          type="text"
                          value={address.state}
                          onChange={(e) => updateAddress(index, 'state', e.target.value)}
                          maxLength={2}
                          placeholder="UF"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                Observações
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/customers')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default CreateCustomerPage;
