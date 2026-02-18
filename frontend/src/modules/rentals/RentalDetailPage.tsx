import React, { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rentalService } from "./rental.service";
import { RentalStatus, ChecklistData } from "../../types/rental.types";
import Layout from "../../components/Layout";
import { SuccessToast } from "../../components/SuccessToast";
import { useAuth } from "hooks/useAuth";
import { toast } from "react-toastify";

const RentalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistType, setChecklistType] = useState<"pickup" | "return">(
    "pickup",
  );
  const [newStatus, setNewStatus] = useState<RentalStatus>("reserved");
  const [serverError, setServerError] = useState<string | null>(null);
  const [newReturnDate, setNewReturnDate] = useState("");
  const [checklistData, setChecklistData] = useState<ChecklistData>({
    photos: [],
    conditions: {},
    notes: "",
  });

  const [modalFinalizarAluguel, setModalFinalizarAluguel] = useState(false);
  const [newStatusAluguel, setNewStatusAluguel] = useState<RentalStatus | null>(
    null,
  );

  const [closePreview, setClosePreview] = useState<{
    originalTotal: number;
    recalculatedTotal: number;
    usedDays: number;
    contractedDays: number;
    rentalType: string;
  } | null>(null);

  const [loadingPreview, setLoadingPreview] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["rental", id],
    queryFn: () => rentalService.getRentalById(id!),
    enabled: !!id,
  });

  const { data: approvalData } = useQuery({
    queryKey: ["rental-status-change", id],
    queryFn: () => rentalService.getPendingStatusChange(id!),
    enabled: !!id,
  });

  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const updateStatusMutation = useMutation({
    mutationFn: (status: RentalStatus) =>
      rentalService.updateRentalStatus(id!, { status }),

    onSuccess: (response) => {
      setShowStatusModal(false);
      setServerError(null);
      setModalFinalizarAluguel(false);
      setClosePreview(null);

      // Se a alteração precisa de aprovação, mostra o toast
      if ("requiresApproval" in response) {
        setShowSuccessToast(true);

        // Fecha o toast automaticamente após 5s
        setTimeout(() => setShowSuccessToast(false), 5000);
        return;
      }

      // status alterado de verdade
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });

  const extendMutation = useMutation({
    mutationFn: (newReturnDate: string) =>
      rentalService.extendRental(id!, { newReturnDate }),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      setServerError(null);
      setShowExtendModal(false);
    },

    onError: (err: any) => {
      const message = err.response?.data?.message || "Erro ao estender período";
      setServerError(message);
    },
  });

  const updateChecklistMutation = useMutation({
    mutationFn: (data: ChecklistData) => {
      if (checklistType === "pickup") {
        return rentalService.updatePickupChecklist(id!, data);
      } else {
        return rentalService.updateReturnChecklist(id!, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      setServerError(null);
      setShowChecklistModal(false);
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message || "Erro ao atualizar checklist";
      setServerError(message);
    },
  });

  const getStatusColor = (status: RentalStatus) => {
    const colors = {
      reserved: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      overdue: "bg-red-100 text-red-800",
      completed: "bg-gray-100 text-gray-800",
      cancelled: "bg-yellow-100 text-yellow-800",
    };
    return colors[status];
  };

  const getStatusLabel = (status: RentalStatus) => {
    const labels = {
      reserved: "Reservado",
      active: "Ativo",
      overdue: "Atrasado",
      completed: "Finalizado",
      cancelled: "Cancelado",
    };
    return labels[status];
  };

  const handleAbrirFinalizacao = async (status: RentalStatus) => {
    setNewStatusAluguel(status);
    setModalFinalizarAluguel(true);
    setLoadingPreview(true);
    try {
      const response = await rentalService.getClosePreview(id!);
      // Garante que os campos estejam presentes
      setClosePreview({
        originalTotal: response.originalTotal,
        recalculatedTotal: response.recalculatedTotal,
        usedDays: response.usedDays,
        contractedDays: response.contractedDays ?? 1,
        rentalType: response.rentalType ?? "daily",
      });
    } catch {
      toast.error("Erro ao calcular valores do fechamento");
      setModalFinalizarAluguel(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSalvarStatus = () => {
    if (newStatus === "completed") {
      setShowStatusModal(false);
      handleAbrirFinalizacao("completed");
      return;
    }
    updateStatusMutation.mutate(newStatus);
    setShowStatusModal(false);
  };

  const confirmarFinalizacao = () => {
    if (!newStatusAluguel) return;
    updateStatusMutation.mutate(newStatusAluguel);
    setModalFinalizarAluguel(false);
    setNewStatusAluguel(null);
  };

  if (isLoading) {
    return (
      <Layout title="Detalhes do Aluguel" backTo="/rentals">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando...</div>
        </div>
      </Layout>
    );
  }

  if (!data?.data) {
    return (
      <Layout title="Detalhes do Aluguel" backTo="/rentals">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Aluguel não encontrado</p>
        </div>
      </Layout>
    );
  }

  const rental = data.data;
  const pendingRequest = approvalData?.hasPending ? approvalData.request : null;
  const customer =
    typeof rental.customerId === "object" ? rental.customerId : null;

  return (
    <Layout title="Detalhes do Aluguel" backTo="/dashboard">
      {showSuccessToast && (
        <SuccessToast
          onClose={() => setShowSuccessToast(false)}
          message="Sua Solicitação Foi Enviada Com Sucesso!"
          description="Os administradores vão cuidar disso."
        />
      )}

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Cabeçalho */}
          <div className="mb-6">
            <Link
              to="/rentals"
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
              Voltar para Aluguéis
            </Link>
          </div>

          {/* Card Principal */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {rental.rentalNumber}
                </h1>
                <span
                  className={`mt-2 inline-block px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                    rental.status,
                  )}`}
                >
                  {getStatusLabel(rental.status)}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNewStatus(rental.status as RentalStatus);
                    setShowStatusModal(true);
                  }}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  Alterar Status
                </button>

                {rental.status === "active" && (
                  <button
                    onClick={() => {
                      setShowExtendModal(true);
                      setNewReturnDate(
                        rental.dates.returnScheduled.split("T")[0],
                      );
                    }}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                      />
                    </svg>
                    Estender Período
                  </button>
                )}
                {serverError && (
                  <span className="text-red-600 dark:text-red-400 text-xs mt-1 font-medium block">
                    {serverError}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cliente */}
              <div>
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Cliente
                  </h2>
                </div>
                {customer && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Nome
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {customer.name}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        CPF/CNPJ
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {customer.cpfCnpj}
                      </div>
                    </div>
                    {customer.email && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Email
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {customer.email}
                        </div>
                      </div>
                    )}
                    {customer.phone && (
                      <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          Telefone
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {customer.phone}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Datas */}
              <div>
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Datas
                  </h2>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Reservado em
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(rental.dates.reservedAt).toLocaleString(
                        "pt-BR",
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Retirada prevista
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(
                        rental.dates.pickupScheduled,
                      ).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  {rental.dates.pickupActual && (
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Retirada real
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(rental.dates.pickupActual).toLocaleDateString(
                          "pt-BR",
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Devolução prevista
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(
                        rental.dates.returnScheduled,
                      ).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  {rental.dates.returnActual && (
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Devolução real
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {new Date(rental.dates.returnActual).toLocaleDateString(
                          "pt-BR",
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Itens */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <div className="flex items-center mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                  <svg
                    className="w-5 h-5 text-gray-700 dark:text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 7.5l-.8 2.8a2.25 2.25 0 0 1-2.15 1.6H6.7a2.25 2.25 0 0 1-2.15-1.6l-.8-2.8m16 0v.58a2.25 2.25 0 0 1-1.28 2.03l-3.7 1.62c-.55.24-.92.77-.92 1.37v1.14c0 .87-.47 1.64-1.16 2.03a6.752 6.752 0 0 1-3.02.68 6.75 6.75 0 0 1-3.02-.68 2.35 2.35 0 0 1-1.16-2.03v-1.14c0-.6-.37-1.13-.92-1.37l-3.7-1.62A2.25 2.25 0 0 1 3 8.08v-.58m16 0H5"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Itens
                </h2>
              </div>
              <div className="space-y-4">
                {rental.items.map((item, index) => {
                  const itemData =
                    typeof item.itemId === "object" ? item.itemId : null;
                  return (
                    <div
                      key={index}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {itemData ? itemData.name : "Item"}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Quantidade: {item.quantity} • Preço unitário: R${" "}
                            {item.unitPrice.toFixed(2)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900 dark:text-white">
                            R$ {item.subtotal.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {rental.services && rental.services.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Serviços Adicionais
                    </h3>
                    {rental.services.map((service, index) => (
                      <div
                        key={index}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {service.description}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              Quantidade: {service.quantity} • Preço unitário:
                              R$ {service.price.toFixed(2)} • Categoria:{" "}
                              {service.category}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900 dark:text-white">
                              R$ {service.subtotal.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {rental.workAddress && rental.workAddress.street && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      Endereço de entrega
                    </h3>
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {rental.workAddress.workName}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {rental.workAddress.street}, {rental.workAddress.number}{" "}
                        <br />
                        {rental.workAddress.neighborhood} •{" "}
                        {rental.workAddress.city} - {rental.workAddress.state}{" "}
                        <br />
                        CEP: {rental.workAddress.zipCode}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Valores */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Valores
                  </h2>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Subtotal:
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      R$ {rental.pricing.subtotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Caução:
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      R$ {rental.pricing.deposit.toFixed(2)}
                    </span>
                  </div>
                  {rental.pricing.discount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Desconto:
                      </span>
                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                        - R$ {rental.pricing.discount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {rental.pricing.lateFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Multa por atraso:
                      </span>
                      <span className="text-sm font-medium text-red-600 dark:text-red-400">
                        R$ {rental.pricing.lateFee.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-semibold border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
                    <span className="text-gray-900 dark:text-white">
                      Total:
                    </span>
                    <span className="text-gray-900 dark:text-white">
                      R$ {rental.pricing.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checklists */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 0 1 9 9v.375M10.125 2.25A3.375 3.375 0 0 1 13.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 0 1 3.375 3.375M9 15l2.25 2.25L15 12"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Checklists
                  </h2>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setChecklistType("pickup");
                      setChecklistData(
                        rental.checklistPickup || {
                          photos: [],
                          conditions: {},
                          notes: "",
                        },
                      );
                      setShowChecklistModal(true);
                    }}
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                      />
                    </svg>
                    {rental.checklistPickup ? "Editar" : "Adicionar"} Checklist
                    Retirada
                  </button>
                  <button
                    onClick={() => {
                      setChecklistType("return");
                      setChecklistData(
                        rental.checklistReturn || {
                          photos: [],
                          conditions: {},
                          notes: "",
                        },
                      );
                      setShowChecklistModal(true);
                    }}
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    <svg
                      className="w-4 h-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                      />
                    </svg>
                    {rental.checklistReturn ? "Editar" : "Adicionar"} Checklist
                    Devolução
                  </button>
                </div>
              </div>

              {/* Observações */}
              {rental.notes && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <div className="flex items-center mb-4">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                      <svg
                        className="w-5 h-5 text-gray-700 dark:text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Observações
                    </h2>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {rental.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-md w-full">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Alterar Status
              </h2>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as RentalStatus)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
              >
                <option value="reserved">Reservado</option>
                <option value="active">Ativo</option>
                <option value="overdue">Atrasado</option>
                <option value="completed">Finalizado</option>
                <option value="cancelled">Cancelado</option>
              </select>
              {serverError && (
                <span className="text-red-600 dark:text-red-400 text-xs mt-1 mb-3 font-medium block">
                  {serverError}
                </span>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarStatus}
                  className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {showExtendModal && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-md w-full">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Estender Período
              </h2>
              <input
                type="date"
                value={newReturnDate}
                onChange={(e) => setNewReturnDate(e.target.value)}
                min={rental.dates.returnScheduled.split("T")[0]}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowExtendModal(false)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => extendMutation.mutate(newReturnDate)}
                  className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Estender
                </button>
              </div>
            </div>
          </div>
        )}

        {showChecklistModal && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-md w-full">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Checklist{" "}
                {checklistType === "pickup" ? "Retirada" : "Devolução"}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={checklistData.notes || ""}
                    onChange={(e) =>
                      setChecklistData({
                        ...checklistData,
                        notes: e.target.value,
                      })
                    }
                    rows={3}
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowChecklistModal(false)}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() =>
                      updateChecklistMutation.mutate(checklistData)
                    }
                    className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {modalFinalizarAluguel && newStatusAluguel === "completed" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center mb-4">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                  <svg
                    className="w-5 h-5 text-gray-700 dark:text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Finalizar aluguel
                </h2>
              </div>

              {loadingPreview ? (
                <div className="flex items-center justify-center py-8">
                  <svg
                    className="animate-spin h-6 w-6 text-gray-900 dark:text-white"
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
                </div>
              ) : (
                <>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Contrato original:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {closePreview?.contractedDays ?? 1} dias (
                        {(() => {
                          const type = closePreview?.rentalType ?? "daily";
                          if (type === "weekly") return "Semanal";
                          if (type === "biweekly") return "Quinzenal";
                          if (type === "monthly") return "Mensal";
                          return "Diária";
                        })()}
                        )
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Dias utilizados:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {closePreview?.usedDays ?? "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">
                        Valor original:
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        R${" "}
                        {closePreview?.originalTotal?.toFixed
                          ? closePreview.originalTotal.toFixed(2)
                          : "-"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
                      O valor original considera o período total contratado.
                      Como o aluguel foi finalizado antes do prazo, o valor foi
                      recalculado proporcionalmente aos dias utilizados.
                    </p>
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-gray-900 dark:text-white font-medium">
                        Valor final:
                      </span>
                      <span className="text-green-600 dark:text-green-400 font-semibold">
                        R${" "}
                        {closePreview?.recalculatedTotal?.toFixed
                          ? closePreview.recalculatedTotal.toFixed(2)
                          : "-"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-2">
                    <button
                      onClick={() => setModalFinalizarAluguel(false)}
                      className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarFinalizacao}
                      className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      Confirmar fechamento
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RentalDetailPage;
