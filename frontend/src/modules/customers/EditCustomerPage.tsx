import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from './customer.service';
import { CreateCustomerData, CustomerAddress } from '../../types/customer.types';
import Layout from '../../components/Layout';

const EditCustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerService.getCustomerById(id!),
    enabled: !!id,
  });

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

  useEffect(() => {
    if (data?.data) {
      setFormData({
        name: data.data.name,
        cpfCnpj: data.data.cpfCnpj,
        email: data.data.email || '',
        phone: data.data.phone || '',
        addresses: [],
        notes: data.data.notes || '',
        isBlocked: data.data.isBlocked,
      });
      // Carregar endereços se existirem
      if (data.data.addresses && data.data.addresses.length > 0) {
        setAddresses(data.data.addresses);
      }
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateCustomerData>) => customerService.updateCustomer(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Filtra endereços que têm pelo menos os campos obrigatórios preenchidos
    const validAddresses = addresses.filter(a => a.street && a.city && a.state && a.zipCode);

    const submitData = {
      ...formData,
      addresses: validAddresses.length > 0 ? validAddresses : undefined,
    };

    updateMutation.mutate(submitData);
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
        city: '',
        state: '',
        zipCode: '',
        isDefault: addresses.length === 0,
        _isSaved: false,
      },
    ]);
  };

  const handleSaveAddress = async (index: number) => {
    try {
      const address = addresses[index];

      const updatedCustomer = await customerService.addAddress(id!, address);

      setAddresses(
        (updatedCustomer.addresses ?? []).map((addr: CustomerAddress) => ({
          ...addr,
          _isSaved: true,
        }))
      );
    } catch (error) {
      console.error('Erro ao salvar endereço:', error);
    }
  };

  const hasUnsavedAddresses = addresses.some(addr => !addr._isSaved);

  const updateAddress = (index: number, field: keyof CustomerAddress, value: any) => {
    const newAddresses = [...addresses];

    newAddresses[index] = {
      ...newAddresses[index],
      [field]: value,
      _isSaved: false,
    };

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

  if (isLoading) {
    return (
      <Layout title="Editar Cliente" backTo="/customers">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600 dark:text-gray-400">Carregando...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Editar Cliente" backTo="/customers">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {updateMutation.isError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>
                  {updateMutation.error instanceof Error
                    ? updateMutation.error.message
                    : 'Erro ao atualizar cliente'}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dados Básicos */}
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nome *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                />
              </div>

              <div>
                <label htmlFor="cpfCnpj" className="block text-sm font-medium text-gray-700 mb-2">
                  CPF/CNPJ *
                </label>
                <input
                  type="text"
                  id="cpfCnpj"
                  name="cpfCnpj"
                  required
                  value={formData.cpfCnpj}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  />
                </div>
              </div>
            </div>

            {/* Endereços */}
            <div className="pt-6 border-t border-gray-200">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Endereços</h3>
                  <p className="text-sm text-gray-600 mt-1">Gerencie os endereços do cliente</p>
                </div>
                <button
                  type="button"
                  onClick={addAddress}
                  className="bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar Endereço
                </button>
              </div>

              {addresses.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg mb-6">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="mt-4 text-gray-600">Nenhum endereço adicionado</p>
                  <p className="text-sm text-gray-500 mt-1">Clique em "Adicionar Endereço" para incluir</p>
                </div>
              )}

              <div className="space-y-4">
                {addresses.map((address, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h4 className="text-md font-semibold text-gray-900">
                        Endereço {index + 1}
                      </h4>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={address.isDefault}
                              onChange={(e) => updateAddress(index, 'isDefault', e.target.checked)}
                              className="sr-only"
                            />
                            <div className={`w-4 h-4 border rounded ${address.isDefault ? 'bg-black border-black' : 'border-gray-300'}`}>
                              {address.isDefault && (
                                <svg className="w-3 h-3 mx-auto my-0.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                          Padrão
                        </label>
                        <button
                          type="button"
                          onClick={() => handleSaveAddress(index)}
                          className="px-3 py-1.5 border border-green-200 text-green-700 hover:bg-green-50 rounded-md text-sm font-medium transition-colors"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAddress(index)}
                          className="px-3 py-1.5 border border-red-200 text-red-700 hover:bg-red-50 rounded-md text-sm font-medium transition-colors"
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    {/* Campos do endereço */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
                        <select
                          value={address.type}
                          onChange={(e) => updateAddress(index, 'type', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        >
                          <option value="main">Principal</option>
                          <option value="billing">Cobrança</option>
                          <option value="work">Obra</option>
                          <option value="other">Outro</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">CEP</label>
                        <input
                          type="text"
                          value={address.zipCode}
                          onChange={(e) => updateAddress(index, 'zipCode', e.target.value)}
                          placeholder="00000-000"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black font-mono"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Rua</label>
                        <input
                          type="text"
                          value={address.street}
                          onChange={(e) => updateAddress(index, 'street', e.target.value)}
                          placeholder="Nome da rua"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Número</label>
                        <input
                          type="text"
                          value={address.number || ''}
                          onChange={(e) => updateAddress(index, 'number', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Complemento</label>
                        <input
                          type="text"
                          value={address.complement || ''}
                          onChange={(e) => updateAddress(index, 'complement', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Bairro</label>
                        <input
                          type="text"
                          value={address.neighborhood || ''}
                          onChange={(e) => updateAddress(index, 'neighborhood', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Cidade</label>
                        <input
                          type="text"
                          value={address.city}
                          onChange={(e) => updateAddress(index, 'city', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
                        <input
                          type="text"
                          value={address.state}
                          onChange={(e) => updateAddress(index, 'state', e.target.value)}
                          maxLength={2}
                          placeholder="UF"
                          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-black focus:border-black uppercase"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Observações */}
            <div className="pt-6 border-t border-gray-200">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Observações
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                placeholder="Anotações importantes sobre o cliente..."
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
              />
            </div>

            {/* Botões de Ação */}
            <div className="pt-6 border-t border-gray-200 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/customers')}
                className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending || hasUnsavedAddresses}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${updateMutation.isPending || hasUnsavedAddresses
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-black hover:bg-gray-800 text-white'
                  }`}

              >
                {updateMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Salvando...
                  </div>
                ) : 'Salvar Alterações'}
              </button>
            </div>
            {hasUnsavedAddresses && (
              <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md p-3">
                ⚠️ Existem endereços não salvos. Clique em <strong>Salvar</strong> no endereço antes de continuar.
              </div>
            )}

          </form>
        </div>
      </div>
    </Layout>
  );
};

export default EditCustomerPage;
