import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { maintenanceService } from "./maintenance.service";
import {
  CreateMaintenanceData,
  MaintenanceType,
} from "../../types/maintenance.types";
import { useItem, useItems } from "../../hooks/useInventory";

const EditMaintenancePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["maintenance", id],
    queryFn: () => maintenanceService.getMaintenanceById(id!),
    enabled: !!id,
  });

  const [formData, setFormData] = useState<Partial<CreateMaintenanceData>>({
    itemId: "",
    unitId: "",
    type: undefined,
    status: undefined,
    scheduledDate: "",
    description: "",
    cost: 0,
    performedBy: "",
    notes: "",
  });

  const { data: itemsData } = useItems({ isActive: true, limit: 500 });
  const { data: selectedItemData } = useItem(formData.itemId || "");

  useEffect(() => {
    if (data?.data) {
      const m = data.data;

      setFormData({
        itemId: typeof m.itemId === "string" ? m.itemId : m.itemId._id,
        unitId: m.unitId || "",
        type: m.type,
        status: m.status,
        scheduledDate: m.scheduledDate.slice(0, 10),
        completedDate: m.completedDate?.slice(0, 10),
        description: m.description,
        cost: m.cost,
        performedBy: m.performedBy || "",
        notes: m.notes || "",
      });
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CreateMaintenanceData>) =>
      maintenanceService.updateMaintenance(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenances"] });
      navigate("/maintenance");
    },
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    if (name === "itemId") {
      setFormData((prev) => ({
        ...prev,
        itemId: value,
        unitId: "",
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: name === "cost" ? Number(value) : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const items = itemsData?.data || [];
  const selectedItemFromApi = selectedItemData?.data;
  const selectedItem =
    selectedItemFromApi || items.find((item) => item._id === formData.itemId);
  const itemsForSelect = selectedItemFromApi
    ? [
        selectedItemFromApi,
        ...items.filter((item) => item._id !== selectedItemFromApi._id),
      ]
    : items;
  const availableUnits =
    selectedItem?.units?.filter(
      (unit) =>
        unit.status === "available" ||
        unit.status === "damaged" ||
        unit.unitId === formData.unitId,
    ) || [];

  useEffect(() => {
    if (!selectedItem) return;
    if (selectedItem.trackingType === "unit") {
      setFormData((prev) => ({
        ...prev,
        unitId: prev.unitId ?? "",
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header de navegação */}
          <div className="mb-6">
            <Link
              to="/maintenance"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              <svg
                className="h-4 w-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              Voltar para Manutenções
            </Link>
          </div>

          {/* Formulário principal */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <svg
                  className="w-6 h-6 text-gray-700 dark:text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.42 15.17L17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Editar Manutenção
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Atualize as informações da manutenção
                </p>
              </div>
            </div>

            {updateMutation.isError && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    {updateMutation.error instanceof Error
                      ? updateMutation.error.message
                      : "Erro ao atualizar manutenção"}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Item */}
              <div>
                <label
                  htmlFor="itemId"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Item <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <select
                  id="itemId"
                  name="itemId"
                  value={formData.itemId || ""}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Selecione o item</option>
                  {itemsForSelect.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} - {item.sku} (
                      {item.trackingType === "unit" ? "Unitário" : "Quantidade"}
                      )
                    </option>
                  ))}
                </select>
              </div>

              {/* Unidade (condicional) */}
              {selectedItem?.trackingType === "unit" && (
                <div>
                  <label
                    htmlFor="unitId"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Unidade{" "}
                    <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <select
                    id="unitId"
                    name="unitId"
                    value={formData.unitId || ""}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Selecione a unidade</option>
                    {availableUnits.map((unit) => (
                      <option key={unit.unitId} value={unit.unitId}>
                        {unit.unitId} (
                        {unit.status === "damaged"
                          ? "Danificada"
                          : unit.status === "maintenance"
                            ? "Em manutenção"
                            : "Disponível"}
                        )
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tipo de Manutenção */}
              <div>
                <label
                  htmlFor="type"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Tipo de Manutenção{" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <select
                  id="type"
                  value={formData.type ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      type: e.target.value as MaintenanceType,
                    }))
                  }
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="" disabled>
                    Selecione o tipo
                  </option>
                  <option value="preventive">Preventiva</option>
                  <option value="corrective">Corretiva</option>
                </select>
              </div>

              {/* Descrição */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Descrição{" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  required
                  placeholder="Descreva os detalhes da manutenção..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                />
              </div>

              {/* Data Agendada */}
              <div>
                <label
                  htmlFor="scheduledDate"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Data Agendada{" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <input
                  type="date"
                  id="scheduledDate"
                  name="scheduledDate"
                  value={formData.scheduledDate}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Custo */}
              <div>
                <label
                  htmlFor="cost"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Custo (R$){" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                      R$
                    </span>
                  </div>
                  <input
                    id="cost"
                    type="number"
                    name="cost"
                    step="0.01"
                    min="0"
                    value={formData.cost}
                    onChange={handleChange}
                    required
                    className="pl-10 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label
                  htmlFor="notes"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Observações
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Observações adicionais sobre a manutenção..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                />
              </div>

              {/* Botões de Ação */}
              <div className="pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/maintenance")}
                  className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {updateMutation.isPending ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4 mr-2 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default EditMaintenancePage;
