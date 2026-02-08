import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerService } from './customer.service';
import { CreateCustomerData } from '../../types/customer.types';
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
    notes: '',
    isBlocked: false,
  });

  useEffect(() => {
    if (data?.data) {
      setFormData({
        name: data.data.name,
        cpfCnpj: data.data.cpfCnpj,
        email: data.data.email || '',
        phone: data.data.phone || '',
        notes: data.data.notes || '',
        isBlocked: data.data.isBlocked,
      });
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
    updateMutation.mutate(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
        <div className="mb-8">
          <Link
            to="/customers"
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center"
          >
            ← Voltar para Clientes
          </Link>
        </div>

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

            {/* Botão para Gerenciar Endereços */}
            <div className="pt-6 border-t border-gray-200">
              <Link
                to={`/customers/${id}/addresses`}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 text-sm font-medium"
              >
                Gerenciar Endereços
              </Link>
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
                disabled={updateMutation.isPending}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${updateMutation.isPending
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-black hover:bg-gray-800 text-white'
                  }`}
              >
                {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default EditCustomerPage;
