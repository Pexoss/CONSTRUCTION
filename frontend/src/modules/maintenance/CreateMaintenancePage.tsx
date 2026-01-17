import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { maintenanceService } from './maintenance.service';
import { useItems } from '../../hooks/useInventory';
import { CreateMaintenanceData, MaintenanceType } from '../../types/maintenance.types';

const CreateMaintenancePage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateMaintenanceData>({
    itemId: '',
    type: 'preventive',
    status: 'scheduled',
    scheduledDate: '',
    description: '',
    cost: 0,
    performedBy: '',
    notes: '',
    attachments: [],
  });

  const { data: itemsData } = useItems({ isActive: true, limit: 100 });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateMaintenanceData) => maintenanceService.createMaintenance(data),
    onSuccess: () => {
      navigate('/maintenance');
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;

    const parsedValue =
      type === 'number'
        ? Number(value)
        : value;

    console.log('[handleChange]', {
      name,
      rawValue: value,
      parsedValue,
      type,
    });

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  const items = itemsData?.data || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header de navegação */}
        <div className="mb-6">
          <Link to="/maintenance" className="text-black hover:text-gray-800 text-sm font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Voltar para Manutenções
          </Link>
        </div>

        {/* Formulário principal */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-8">Nova Manutenção</h1>

          {createMutation.isError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : 'Erro ao criar manutenção'}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seção de Item */}
            <div>
              <label htmlFor="itemId" className="block text-sm font-medium text-gray-700 mb-2">
                Item *
              </label>
              <select
                id="itemId"
                name="itemId"
                required
                value={formData.itemId}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              >
                <option value="">Selecione um item</option>
                {items.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name} - {item.sku} (Disponível: {item.quantity.available})
                  </option>
                ))}
              </select>
            </div>

            {/* Seção de Tipo e Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo *
                </label>
                <select
                  id="type"
                  name="type"
                  required
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                >
                  <option value="preventive">Preventiva</option>
                  <option value="corrective">Corretiva</option>
                </select>
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                  Status *
                </label>
                <select
                  id="status"
                  name="status"
                  required
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                >
                  <option value="scheduled">Agendada</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="completed">Concluída</option>
                </select>
              </div>
            </div>

            {/* Data Prevista */}
            <div>
              <label htmlFor="scheduledDate" className="block text-sm font-medium text-gray-700 mb-2">
                Data Prevista para Entrega
              </label>
              <input
                type="datetime-local"
                id="scheduledDate"
                name="scheduledDate"
                required
                value={formData.scheduledDate}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              />
            </div>

            {/* Data de Conclusão (condicional) */}
            {formData.status === 'completed' && (
              <div>
                <label htmlFor="completedDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Data de Conclusão *
                </label>
                <input
                  type="datetime-local"
                  id="completedDate"
                  name="completedDate"
                  required
                  value={formData.completedDate}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                />
              </div>
            )}

            {/* Descrição */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Descrição *
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={formData.description}
                onChange={handleChange}
                placeholder="Descreva os detalhes da manutenção..."
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
              />
            </div>

            {/* Custo e Realizada por */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="cost" className="block text-sm font-medium text-gray-700 mb-2">
                  Custo (R$) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">R$</span>
                  </div>
                  <input
                    type="number"
                    id="cost"
                    name="cost"
                    required
                    min="0"
                    step="0.01"
                    value={formData.cost}
                    onChange={handleChange}
                    className="pl-10 w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="performedBy" className="block text-sm font-medium text-gray-700 mb-2">
                  Realizada por
                </label>
                <input
                  type="text"
                  id="performedBy"
                  name="performedBy"
                  value={formData.performedBy}
                  onChange={handleChange}
                  placeholder="Nome do técnico ou empresa"
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                />
              </div>
            </div>

            {/* Observações */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Observações
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                placeholder="Observações adicionais..."
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
              />
            </div>

            {/* Botões de Ação */}
            <div className="pt-6 border-t border-gray-200 flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/maintenance')}
                className="px-6 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  (formData.status === 'completed' && !formData.completedDate)
                }
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${createMutation.isPending ||
                    (formData.status === 'completed' && !formData.completedDate)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-black hover:bg-gray-800 text-white'
                  }`}
              >
                {createMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Salvando...
                  </div>
                ) : 'Criar Manutenção'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateMaintenancePage;
