import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { maintenanceService } from "./maintenance.service";
import { useItem, useItems } from "../../hooks/useInventory";
import { CreateMaintenanceData } from "../../types/maintenance.types";
import Layout from "../../components/Layout";

const CreateMaintenancePage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateMaintenanceData>({
    itemId: "",
    type: "preventive",
    status: "scheduled",
    scheduledDate: "",
    description: "",
    cost: 0,
    performedBy: "",
    notes: "",
    attachments: [],
  });

  const { data: itemsData } = useItems({ isActive: true, limit: 500 });
  const { data: selectedItemData } = useItem(formData.itemId || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateMaintenanceData) =>
      maintenanceService.createMaintenance(data),
    onSuccess: () => {
      navigate("/maintenance");
    },
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;

    const parsedValue = type === "number" ? Number(value) : value;

    console.log("[handleChange]", {
      name,
      rawValue: value,
      parsedValue,
      type,
    });

    if (name === "itemId") {
      setFormData((prev) => ({
        ...prev,
        itemId: value,
        unitId: "",
        itemUnavailable: prev.itemUnavailable,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
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

  useEffect(() => {
    if (!selectedItem) return;
    if (selectedItem.trackingType === "unit") {
      setFormData((prev) => ({
        ...prev,
        unitId: prev.unitId ?? "",
        itemUnavailable: true,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        unitId: undefined,
        itemUnavailable: false,
      }));
    }
  }, [selectedItem]);
  const availableUnits =
    selectedItem?.units?.filter(
      (unit) => unit.status === "available" || unit.status === "damaged",
    ) || [];

  return (
    <Layout title="Nova Manutenção" backTo="/maintenance">
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
            <div className="flex items-center gap-3 mb-8">
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Nova Manutenção
              </h1>
            </div>

            {createMutation.isError && (
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
                    {createMutation.error instanceof Error
                      ? createMutation.error.message
                      : "Erro ao criar manutenção"}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Seção de Item */}
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
                  required
                  value={formData.itemId}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Selecione um item</option>
                  {itemsForSelect.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name} - {item.sku} (Disponível:{" "}
                      {item.quantity.available})
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
                    required
                    value={formData.unitId || ""}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">Selecione a unidade</option>
                    {availableUnits.map((unit) => (
                      <option key={unit.unitId} value={unit.unitId}>
                        {unit.unitId} (
                        {unit.status === "damaged"
                          ? "Danificada"
                          : "Disponível"}
                        )
                      </option>
                    ))}
                  </select>
                  {availableUnits.length === 0 && (
                    <p className="mt-2 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <svg
                        className="w-4 h-4"
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
                      Nenhuma unidade disponível para manutenção.
                    </p>
                  )}
                </div>
              )}

              {/* Seção de Tipo e Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="type"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Tipo{" "}
                    <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <select
                    id="type"
                    name="type"
                    required
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="preventive">Preventiva</option>
                    <option value="corrective">Corretiva</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="status"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Status{" "}
                    <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <select
                    id="status"
                    name="status"
                    required
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  >
                    <option value="scheduled">Agendada</option>
                    <option value="in_progress">Em Andamento</option>
                    <option value="completed">Concluída</option>
                  </select>
                </div>
              </div>

              {/* Data Prevista */}
              <div>
                <label
                  htmlFor="scheduledDate"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Data Prevista para Entrega{" "}
                  <span className="text-red-500 dark:text-red-400">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="scheduledDate"
                  name="scheduledDate"
                  required
                  value={formData.scheduledDate}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Data de Conclusão (condicional) */}
              {formData.status === "completed" && (
                <div>
                  <label
                    htmlFor="completedDate"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Data de Conclusão{" "}
                    <span className="text-red-500 dark:text-red-400">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    id="completedDate"
                    name="completedDate"
                    required
                    value={formData.completedDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              )}

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
                  required
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Descreva os detalhes da manutenção..."
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                />
              </div>

              {/* Custo e Realizada por */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      type="number"
                      id="cost"
                      name="cost"
                      required
                      min="0"
                      step="0.01"
                      value={formData.cost}
                      onChange={handleChange}
                      className="pl-10 w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="performedBy"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Realizada por
                  </label>
                  <input
                    type="text"
                    id="performedBy"
                    name="performedBy"
                    value={formData.performedBy}
                    onChange={handleChange}
                    placeholder="Nome do técnico ou empresa"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
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
                  placeholder="Observações adicionais..."
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
                  disabled={
                    createMutation.isPending ||
                    (formData.status === "completed" && !formData.completedDate)
                  }
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {createMutation.isPending ? (
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
                      Criar Manutenção
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

export default CreateMaintenancePage;
