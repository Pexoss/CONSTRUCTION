import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { maintenanceService } from './maintenance.service';
import { useItems } from '../../hooks/useInventory';
import { CreateMaintenanceData, MaintenanceType } from '../../types/maintenance.types';
import Layout from '../../components/Layout';

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

    if (name === 'itemId') {
      const selectedItem = items.find((item) => item._id === value);
      setFormData((prev) => ({
        ...prev,
        itemId: value,
        unitId: selectedItem?.trackingType === 'unit' ? '' : undefined,
        itemUnavailable: selectedItem?.trackingType === 'quantity' ? false : true,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  const items = itemsData?.data || [];
  const selectedItem = items.find((item) => item._id === formData.itemId);
  const availableUnits =
    selectedItem?.units?.filter((unit) =>
      unit.status === 'available' || unit.status === 'damaged'
    ) || [];

  return (
    <Layout title="Nova Manutenção" backTo="/maintenance">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Nova Manutenção</h1>

          {createMutation.isError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Erro ao criar manutenção'}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="itemId" className="block text-sm font-medium text-gray-700">
                Item *
              </label>
              <select
                id="itemId"
                name="itemId"
                required
                value={formData.itemId}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Selecione um item</option>
                {items.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.name} - {item.sku} (Disponível: {item.quantity.available})
                  </option>
                ))}
              </select>
            </div>

            {selectedItem?.trackingType === 'unit' && (
              <div>
                <label htmlFor="unitId" className="block text-sm font-medium text-gray-700">
                  Unidade *
                </label>
                <select
                  id="unitId"
                  name="unitId"
                  required
                  value={formData.unitId || ''}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Selecione a unidade</option>
                  {availableUnits.map((unit) => (
                    <option key={unit.unitId} value={unit.unitId}>
                      {unit.unitId} ({unit.status === 'damaged' ? 'Danificada' : 'Disponível'})
                    </option>
                  ))}
                </select>
                {availableUnits.length === 0 && (
                  <p className="mt-2 text-sm text-amber-600">
                    Nenhuma unidade disponível para manutenção.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700">
                  Tipo *
                </label>
                <select
                  id="type"
                  name="type"
                  required
                  value={formData.type}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="preventive">Preventiva</option>
                  <option value="corrective">Corretiva</option>
                </select>
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                  Status *
                </label>
                <select
                  id="status"
                  name="status"
                  required
                  value={formData.status}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="scheduled">Agendada</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="completed">Concluída</option>
                </select>
              </div>

            </div>

            <div>
              <label htmlFor="scheduledDate" className="block text-sm font-medium text-gray-700">
                Data Agendada *
              </label>
              <input
                type="datetime-local"
                id="scheduledDate"
                name="scheduledDate"
                required
                value={formData.scheduledDate}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {formData.status === 'completed' && (
              <div>
                <label htmlFor="completedDate" className="block text-sm font-medium text-gray-700">
                  Data de Conclusão *
                </label>
                <input
                  type="datetime-local"
                  id="scheduledDate"
                  name="scheduledDate"
                  required
                  value={formData.scheduledDate}
                  onChange={handleChange}
                />
              </div>
            )}

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Descrição *
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={4}
                value={formData.description}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="cost" className="block text-sm font-medium text-gray-700">
                  Custo (R$) *
                </label>
                <input
                  type="number"
                  id="cost"
                  name="cost"
                  required
                  min="0"
                  step="0.01"
                  value={formData.cost}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label htmlFor="performedBy" className="block text-sm font-medium text-gray-700">
                  Realizada por
                </label>
                <input
                  type="text"
                  id="performedBy"
                  name="performedBy"
                  value={formData.performedBy}
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
                onClick={() => navigate('/maintenance')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  createMutation.isPending ||
                  (formData.status === 'completed' && !formData.completedDate)
                }
                className="px-4 py-2 bg-indigo-600 text-white rounded-md disabled:opacity-50"
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

export default CreateMaintenancePage;
