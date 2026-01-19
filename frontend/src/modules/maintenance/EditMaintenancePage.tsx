import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { maintenanceService } from './maintenance.service';
import { CreateMaintenanceData, MaintenanceType } from '../../types/maintenance.types';
import { useItem, useItems } from '../../hooks/useInventory';

const EditMaintenancePage: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['maintenance', id],
        queryFn: () => maintenanceService.getMaintenanceById(id!),
        enabled: !!id,
    });

    const [formData, setFormData] = useState<Partial<CreateMaintenanceData>>({
        itemId: '',
        unitId: '',
        type: undefined,
        status: undefined,
        scheduledDate: '',
        description: '',
        cost: 0,
        performedBy: '',
        notes: '',
    });

    const { data: itemsData } = useItems({ isActive: true, limit: 500 });
    const { data: selectedItemData } = useItem(formData.itemId || '');

    useEffect(() => {
        if (data?.data) {
            const m = data.data;

            setFormData({
                itemId: typeof m.itemId === 'string' ? m.itemId : m.itemId._id,
                unitId: m.unitId || '',
                type: m.type,
                status: m.status,
                scheduledDate: m.scheduledDate.slice(0, 10),
                completedDate: m.completedDate?.slice(0, 10),
                description: m.description,
                cost: m.cost,
                performedBy: m.performedBy || '',
                notes: m.notes || '',
            });
        }
    }, [data]);

    const updateMutation = useMutation({
        mutationFn: (payload: Partial<CreateMaintenanceData>) =>
            maintenanceService.updateMaintenance(id!, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['maintenances'] });
            navigate('/maintenance');
        },
    });

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target;
        if (name === 'itemId') {
            setFormData((prev) => ({
                ...prev,
                itemId: value,
                unitId: '',
            }));
            return;
        }
        setFormData(prev => ({
            ...prev,
            [name]: name === 'cost' ? Number(value) : value,
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateMutation.mutate(formData);
    };

    const items = itemsData?.data || [];
    const selectedItemFromApi = selectedItemData?.data;
    const selectedItem = selectedItemFromApi || items.find((item) => item._id === formData.itemId);
    const itemsForSelect = selectedItemFromApi
        ? [selectedItemFromApi, ...items.filter((item) => item._id !== selectedItemFromApi._id)]
        : items;
    const availableUnits =
        selectedItem?.units?.filter((unit) =>
            unit.status === 'available' || unit.status === 'damaged' || unit.unitId === formData.unitId
        ) || [];

    useEffect(() => {
        if (!selectedItem) return;
        if (selectedItem.trackingType === 'unit') {
            setFormData((prev) => ({
                ...prev,
                unitId: prev.unitId ?? '',
            }));
        } else {
            setFormData((prev) => ({
                ...prev,
                unitId: undefined,
            }));
        }
    }, [selectedItem]);

    if (isLoading) {
        return (
            <Layout title="Editar Manutenção" backTo="/maintenance">
                <div className="flex justify-center items-center h-64 text-gray-600">
                    Carregando...
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Editar Manutenção" backTo="/maintenance">
            <div className="max-w-2xl mx-auto bg-white rounded-lg border border-gray-200 p-6">
                <div className="mb-6">
                    <Link to="/maintenance" className="text-black hover:text-gray-800 text-sm font-medium flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Voltar para Manutenções
                    </Link>
                </div>
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">Editar Manutenção</h1>
                    <p className="text-sm text-gray-600 mt-2">Atualize as informações da manutenção</p>
                </div>

                {updateMutation.isError && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-red-800">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>
                                {updateMutation.error instanceof Error
                                    ? updateMutation.error.message
                                    : 'Erro ao atualizar manutenção'}
                            </p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Item */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Item *
                        </label>
                        <select
                            name="itemId"
                            value={formData.itemId || ''}
                            onChange={handleChange}
                            required
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        >
                            <option value="">Selecione o item</option>
                            {itemsForSelect.map((item) => (
                                <option key={item._id} value={item._id}>
                                    {item.name} - {item.sku} ({item.trackingType === 'unit' ? 'Unitário' : 'Quantidade'})
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedItem?.trackingType === 'unit' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Unidade *
                            </label>
                            <select
                                name="unitId"
                                value={formData.unitId || ''}
                                onChange={handleChange}
                                required
                                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                            >
                                <option value="">Selecione a unidade</option>
                                {availableUnits.map((unit) => (
                                    <option key={unit.unitId} value={unit.unitId}>
                                        {unit.unitId} ({unit.status === 'damaged' ? 'Danificada' : unit.status === 'maintenance' ? 'Em manutenção' : 'Disponível'})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {/* Tipo de Manutenção */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Tipo de Manutenção *
                        </label>
                        <select
                            value={formData.type ?? ''}
                            onChange={(e) =>
                                setFormData(prev => ({
                                    ...prev,
                                    type: e.target.value as MaintenanceType,
                                }))
                            }
                            required
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        >
                            <option value="" disabled>Selecione o tipo</option>
                            <option value="preventive">Preventiva</option>
                            <option value="corrective">Corretiva</option>
                        </select>
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Descrição *
                        </label>
                        <textarea
                            name="description"
                            rows={4}
                            value={formData.description}
                            onChange={handleChange}
                            required
                            placeholder="Descreva os detalhes da manutenção..."
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
                        />
                    </div>

                    {/* Data Agendada */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Data Agendada *
                        </label>
                        <input
                            type="date"
                            name="scheduledDate"
                            value={formData.scheduledDate}
                            onChange={handleChange}
                            required
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                        />
                    </div>

                    {/* Custo */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Custo (R$) *
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <span className="text-gray-500">R$</span>
                            </div>
                            <input
                                type="number"
                                name="cost"
                                step="0.01"
                                min="0"
                                value={formData.cost}
                                onChange={handleChange}
                                required
                                className="pl-10 w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                            />
                        </div>
                    </div>

                    {/* Observações */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Observações
                        </label>
                        <textarea
                            name="notes"
                            rows={3}
                            value={formData.notes}
                            onChange={handleChange}
                            placeholder="Observações adicionais sobre a manutenção..."
                            className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-black resize-none"
                        />
                    </div>

                    {/* Ações */}
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
                            disabled={updateMutation.isPending}
                            className={`px-6 py-3 rounded-lg text-sm font-medium transition-colors ${updateMutation.isPending
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
                </form>
            </div>
        </Layout>
    );
};

export default EditMaintenancePage;
