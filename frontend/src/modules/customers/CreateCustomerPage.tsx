import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { customerService } from './customer.service';
import { CreateCustomerData, Customer } from '../../types/customer.types';
import Layout from '../../components/Layout';

const CreateCustomerPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateCustomerData>({
    name: '',
    cpfCnpj: '',
    email: '',
    phone: '',
    notes: '',
    isBlocked: false,
  });
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [createdCustomerId, setCreatedCustomerId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateCustomerData,) =>
      customerService.createCustomer(data),

    onSuccess: (customer) => {
      console.log('✅ Cliente criado:', customer);
      console.log('🆔 ID:', customer._id);

      setCreatedCustomerId(customer._id);
      setShowAddressModal(true);
    },

    onError: (error: any) => {
      console.error('❌ Erro ao criar cliente:', error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    console.log('📝 Submit acionado');
    console.log('📦 FormData atual:', formData);

    createMutation.mutate(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    console.log(`✏️ Campo alterado: ${name}`, value);

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
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
                className="px-4 py-2 text-sm bg-black hover:bg-gray-900 text-white rounded-md"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAddressModal && createdCustomerId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Cliente criado com sucesso
            </h2>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Agora complete o endereço do cliente para continuar.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddressModal(false);
                  navigate('/customers');
                }}
                className="px-4 py-2 text-sm border rounded-md text-gray-700 dark:text-gray-300"
              >
                Depois
              </button>

              <button
                onClick={() =>
                  navigate(`/customers/${createdCustomerId}/addresses`)
                }
                className="px-4 py-2 text-sm bg-black hover:bg-gray-900 text-white rounded-md"
              >
                Preencher Endereço
              </button>

            </div>
          </div>
        </div>
      )}

    </Layout>
  );
};

export default CreateCustomerPage;
