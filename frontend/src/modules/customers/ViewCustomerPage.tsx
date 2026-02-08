// modules/customers/ViewCustomerPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { customerService } from './customer.service';
import { Customer, CustomerAddress } from '../../types/customer.types';

const ViewCustomerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customerService.getCustomerById(id!),
    enabled: !!id,
  });

  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (data?.data) setCustomer(data.data);
  }, [data]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerService.deleteCustomer(id),
    onSuccess: () => {
      navigate('/customers');
    },
  });

  if (isLoading) {
    return (
      <Layout title="Visualizar Cliente" backTo="/customers">
        <div className="flex justify-center items-center h-64">
          Carregando...
        </div>
      </Layout>
    );
  }

  const handleDelete = () => {
    if (!customer?._id) return;
    deleteMutation.mutate(customer._id);
  };

  if (isError || !customer) {
    return (
      <Layout title="Visualizar Cliente" backTo="/customers">
        <div className="text-red-600 dark:text-red-400 p-4">
          Erro ao carregar cliente ou cliente não encontrado.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Cliente: ${customer.name}`} backTo="/customers">
      <div className="mb-8">
        <Link
          to="/customers"
          className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
        >
          ← Voltar para Clientes
        </Link>
      </div>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            Cliente: {customer.name}
          </h1>

          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm bg-black hover:bg-gray-900 text-white rounded-md disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Excluindo...' : 'Excluir Cliente'}
          </button>
        </div>

        {/* Layout principal: duas colunas no desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informações do Cliente */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 border-b border-gray-200 pb-3">
              Informações do Cliente
            </h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Nome</p>
                <p className="font-medium text-gray-900">{customer.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">CPF/CNPJ</p>
                <p className="font-medium text-gray-900 font-mono">{customer.cpfCnpj}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Email</p>
                <p className="font-medium text-gray-900">{customer.email || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Telefone</p>
                <p className="font-medium text-gray-900">{customer.phone || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Observações</p>
                <p className="font-medium text-gray-900">{customer.notes || '-'}</p>
              </div>
            </div>
          </div>

          {/* Endereços */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 border-b border-gray-200 pb-3">
              Endereços
            </h2>
            <div className="space-y-4">
              {(customer.addresses ?? []).length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="mt-4 text-gray-600">Nenhum endereço registrado</p>
                  <Link
                    to={`/customers/${customer._id}/edit`}
                    className="mt-2 text-sm text-black hover:text-gray-800 font-medium"
                  >
                    Clique para adicionar endereço
                  </Link>
                </div>
              ) : (
                (customer.addresses ?? []).map((address: CustomerAddress, index: number) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900 mb-3">
                      {address.addressName?.trim()
                        ? address.addressName
                        : address.type === 'main'
                          ? 'Principal'
                          : address.type === 'billing'
                            ? 'Cobrança'
                            : address.type === 'work'
                              ? `Obra ${index + 1}`
                              : `Outro ${index + 1}`}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-600 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Bairro:</span> {address.neighborhood || '-'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Rua:</span> {address.street || '-'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Número:</span> {address.number || '-'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Complemento:</span> {address.complement || '-'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Cidade:</span> {address.city || '-'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Estado:</span> {address.state || '-'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">CEP:</span> {address.zipCode || '-'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ViewCustomerPage;
