// modules/customers/ViewCustomerPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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

  if (isLoading) {
    return (
      <Layout title="Visualizar Cliente" backTo="/customers">
        <div className="flex justify-center items-center h-64 text-gray-600 dark:text-gray-400">
          Carregando...
        </div>
      </Layout>
    );
  }

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
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Layout principal: duas colunas no desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informações do Cliente */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Informações do Cliente
            </h2>
            <div className="space-y-3 mt-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Nome</p>
                <p className="font-medium text-gray-900 dark:text-white">{customer.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">CPF/CNPJ</p>
                <p className="font-medium text-gray-900 dark:text-white">{customer.cpfCnpj}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Email</p>
                <p className="font-medium text-gray-900 dark:text-white">{customer.email || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Telefone</p>
                <p className="font-medium text-gray-900 dark:text-white">{customer.phone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Observações</p>
                <p className="font-medium text-gray-900 dark:text-white">{customer.notes || '-'}</p>
              </div>
            </div>
          </div>

          {/* Endereços */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
              Endereços
            </h2>
            <div className="space-y-4 mt-3">
              {(customer.addresses ?? []).map((address: CustomerAddress, index: number) => (
                <div
                  key={index}
                  className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
                >
                  <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400 mb-2">
                    {address.type === 'main'
                      ? 'Principal'
                      : address.type === 'billing'
                      ? 'Cobrança'
                      : address.type === 'work'
                      ? address.workName || `Obra ${index + 1}`
                      : `Outro ${index + 1}`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-700 dark:text-gray-300 text-sm">
                    <p><span className="font-semibold">Bairro:</span> {address.neighborhood || '-'}</p>
                    <p><span className="font-semibold">Rua:</span> {address.street || '-'}</p>
                    <p><span className="font-semibold">Número:</span> {address.number || '-'}</p>
                    <p><span className="font-semibold">Complemento:</span> {address.complement || '-'}</p>
                    <p><span className="font-semibold">Cidade:</span> {address.city || '-'}</p>
                    <p><span className="font-semibold">Estado:</span> {address.state || '-'}</p>
                    <p><span className="font-semibold">CEP:</span> {address.zipCode || '-'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ViewCustomerPage;
