import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { customerService } from './customer.service';
import { CustomerAddress } from '../../types/customer.types';

const CustomerAddressesPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customerAddresses', id],
    queryFn: () => customerService.getCustomerById(id!),
    enabled: !!id,
  });

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loadingAddressId, setLoadingAddressId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (data?.data?.addresses) {
      setAddresses(data.data.addresses);
    }
  }, [data]);

  const addMutation = useMutation({
    mutationFn: (address: CustomerAddress) => customerService.addAddress(id!, address),
    onMutate: () => {
      setLoadingAddressId('new');
      setIsSaving(true);
    },
    onSuccess: (updatedCustomer) => {
      setAddresses(updatedCustomer.addresses ?? []);
      queryClient.invalidateQueries({ queryKey: ['customerAddresses', id] });
      setSuccessMessage("Endereço salvo com sucesso !")
      setLoadingAddressId(null);
      setIsSaving(false);
    },
    onError: (error: any) => {
      console.group('❌ ADD ADDRESS ERROR');
      console.error('Error object:', error);
      console.error('Backend response:', error?.response);
      console.error('Status:', error?.response?.status);
      console.error('Data:', error?.response?.data);
      console.groupEnd();

      setLoadingAddressId(null);
      setIsSaving(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ addressId, address }: { addressId: string; address: CustomerAddress }) =>
      customerService.updateAddress(id!, addressId, address),
    onMutate: (variables) => {
      setLoadingAddressId(variables.addressId);
      setIsSaving(true);
    },
    onSuccess: (updatedCustomer) => {
      setAddresses(updatedCustomer.addresses ?? []);
      queryClient.invalidateQueries({ queryKey: ['customerAddresses', id] });
      setSuccessMessage("Endereço salvo com sucesso !")
      setLoadingAddressId(null);
      setIsSaving(false);
    },
    onError: (error: any) => {
      console.group('❌ UPDATE ADDRESS ERROR');
      console.error('Error object:', error);
      console.error('Backend response:', error?.response);
      console.error('Status:', error?.response?.status);
      console.error('Data:', error?.response?.data);
      console.groupEnd();

      setLoadingAddressId(null);
      setIsSaving(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (addressId: string) => customerService.deleteAddress(id!, addressId),
    onMutate: (addressId) => {
      setLoadingAddressId(addressId);
    },
    onSuccess: (updatedCustomer) => {
      setAddresses(updatedCustomer.addresses ?? []);
      queryClient.invalidateQueries({ queryKey: ['customerAddresses', id] });
      setLoadingAddressId(null);
    },
    onError: () => {
      setLoadingAddressId(null);
    },
  });

  const handleAddAddress = () => {
    setAddresses([
      ...addresses,
      {
        addressName: '',
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
      },
    ]);
  };

  const handleSaveAddress = (address: CustomerAddress) => {
    console.group('📦 SAVE ADDRESS');
    console.log('➡️ Original address (state):', address);

    if (address._id) {
      console.log('✏️ Action: UPDATE');
      console.log('🆔 Address ID:', address._id);
      console.log('📤 Payload sent to backend:', address);

      updateMutation.mutate({ addressId: address._id, address });
    } else {
      console.log('➕ Action: CREATE');
      console.log('📤 Payload sent to backend:', address);

      addMutation.mutate(address);
    }

    console.groupEnd();
  };


  const handleChange = (index: number, field: keyof CustomerAddress, value: any) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    setAddresses(newAddresses);
  };

  // Verificar se um endereço específico está carregando
  const isAddressLoading = (addressId?: string): boolean => {
    if (!addressId) {
      return loadingAddressId === 'new';
    }
    return loadingAddressId === addressId;
  };

  // Verificar se é uma operação de exclusão
  const isDeleting = (addressId?: string): boolean => {
    if (!addressId) return false;
    return deleteMutation.isPending && loadingAddressId === addressId;
  };

  if (isLoading) {
    return (
      <Layout title="Endereços do Cliente" backTo={`/customers/${id}`}>
        <div className="text-center py-16">Carregando...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Endereços do Cliente" backTo={`/customers/${id}`}>
      <div className="max-w-3xl mx-auto">
        <Link
          to="/customers"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
        >
          ← Voltar para Clientes
        </Link>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Endereços</h2>
          <button
            onClick={handleAddAddress}
            disabled={isSaving}
            className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
          >
            Adicionar Endereço
          </button>
        </div>

        <div className="space-y-4">
          {addresses.map((address, index) => {
            const isLoading = isAddressLoading(address._id);
            const isDeletingAddress = isDeleting(address._id);

            return (
              <div key={address._id || `new-${index}`} className="border p-4 rounded-md bg-white relative">
                {/* Overlay de loading */}
                {isLoading && (
                  <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center rounded-md z-10">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mb-2"></div>
                      <span className="text-sm text-gray-600">
                        {isDeletingAddress ? 'Excluindo...' : 'Salvando...'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                  <select
                    value={address.type}
                    onChange={(e) => handleChange(index, 'type', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  >
                    <option value="main">Principal</option>
                    <option value="billing">Cobrança</option>
                    <option value="work">Obra</option>
                    <option value="other">Outro</option>
                  </select>

                  {address.type === 'work' && (
                    <input
                      type="text"
                      placeholder="Nome da Obra"
                      value={address.addressName}
                      onChange={(e) =>
                        handleChange(index, 'addressName', e.target.value)
                      }
                      className="w-full border rounded px-3 py-2"
                      disabled={isLoading}
                    />
                  )}

                  <input
                    type="text"
                    placeholder="CEP"
                    value={address.zipCode}
                    onChange={(e) => handleChange(index, 'zipCode', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    placeholder="Rua"
                    value={address.street}
                    onChange={(e) => handleChange(index, 'street', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    placeholder="Número"
                    value={address.number || ''}
                    onChange={(e) => handleChange(index, 'number', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />

                  <input
                    type="text"
                    placeholder="Complemento"
                    value={address.complement || ''}
                    onChange={(e) => handleChange(index, 'complement', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    placeholder="Bairro"
                    value={address.neighborhood}
                    onChange={(e) => handleChange(index, 'neighborhood', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    placeholder="Cidade"
                    value={address.city}
                    onChange={(e) => handleChange(index, 'city', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    placeholder="Estado"
                    value={address.state}
                    onChange={(e) => handleChange(index, 'state', e.target.value)}
                    className="w-full border rounded px-3 py-2"
                    disabled={isLoading}
                  />
                  <input
                    type="text"
                    value="Brasil"
                    disabled
                    className="w-full border rounded px-3 py-2"
                  />
                  <label className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      checked={!!address.isDefault}
                      onChange={(e) => handleChange(index, 'isDefault', e.target.checked)}
                      disabled={isLoading}
                    />
                    Padrão
                  </label>
                </div>
                {successMessage && (
                  <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    {successMessage}
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => handleSaveAddress(addresses[index])}
                    disabled={isLoading}
                    className={`px-3 py-1.5 text-white rounded text-sm flex items-center gap-2 ${isLoading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                      }`}
                  >
                    {isLoading && !isDeletingAddress ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Salvando
                      </>
                    ) : (
                      'Salvar'
                    )}
                  </button>
                  {address._id && (
                    <button
                      onClick={() => deleteMutation.mutate(address._id!)}
                      disabled={isLoading}
                      className={`px-3 py-1.5 text-white rounded text-sm flex items-center gap-2 ${isLoading
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700'
                        }`}
                    >
                      {isDeletingAddress ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Excluindo
                        </>
                      ) : (
                        'Excluir'
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
};

export default CustomerAddressesPage;