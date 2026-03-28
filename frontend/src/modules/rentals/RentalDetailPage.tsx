import React, { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rentalService } from "./rental.service";
import {
  RentalStatus,
  ChecklistData,
  RentalWorkAddress,
  RentalTypeUI,
} from "../../types/rental.types";
import { billingService } from "../billings/billing.service";
import { Billing } from "../../types/billing.types";
import { customerService } from "../customers/customer.service";
import Layout from "../../components/Layout";
import { SuccessToast } from "../../components/SuccessToast";
import { useAuth } from "hooks/useAuth";
import { toast } from "react-toastify";
import { useItems } from "../../hooks/useInventory";
import { invoiceService } from "modules/invoices/invoice.service";

const RentalDetailPage: React.FC = () => {
  const rentalTypeApiToUi: Record<string, RentalTypeUI> = {
    daily: "diario",
    weekly: "semanal",
    monthly: "mensal",
  };
  const rentalTypeUiToApi: Record<RentalTypeUI, string> = {
    diario: "daily",
    semanal: "weekly",
    quinzenal: "biweekly",
    mensal: "monthly",
  };

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
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
  const [showRecalculateModal, setShowRecalculateModal] = useState(false);
  const [modalFinalizarAluguel, setModalFinalizarAluguel] = useState(false);
  const [newStatusAluguel, setNewStatusAluguel] = useState<RentalStatus | null>(
    null,
  );
  const [showConfirmFinalClosure, setShowConfirmFinalClosure] = useState(false);
  const [loadingConfirmClosure, setLoadingConfirmClosure] = useState(false);

  const [closePreview, setClosePreview] = useState<{
    originalTotal: number;
    recalculatedTotal: number;
    usedDays: number;
    contractedDays: number;
    rentalType: string;
  } | null>(null);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [closeForm, setCloseForm] = useState({
    returnDate: "",
    rentalType: "daily",
    equipmentSubtotal: "",
    servicesSubtotal: "",
    discount: "",
    lateFee: "",
    total: "",
    notes: "",
  });
  const [closeItemModal, setCloseItemModal] = useState(false);
  const [closeItemReturnDate, setCloseItemReturnDate] = useState("");
  const [closeItemPreview, setCloseItemPreview] = useState<{
    originalTotal: number;
    recalculatedTotal: number;
    usedDays: number;
    contractedDays: number;
    rentalType: string;
  } | null>(null);
  const [closeItemLoading, setCloseItemLoading] = useState(false);
  const [selectedCloseItem, setSelectedCloseItem] = useState<{
    itemId: string;
    unitId?: string;
    name: string;
  } | null>(null);
  const [editForm, setEditForm] = useState({
    notes: "",
    pickupDate: "",
    returnDate: "",
    items: [] as Array<{
      itemId: string;
      unitId?: string;
      quantity: number;
      rentalType: RentalTypeUI;
      pickupDate: string;
      returnDate: string;
    }>,
    workAddress: {
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      zipCode: "",
      workName: "",
      workId: "",
    } as RentalWorkAddress,
  });
  const [newItemForm, setNewItemForm] = useState<{
    itemId: string;
    unitId?: string;
    quantity: number;
    rentalType: RentalTypeUI;
    pickupDate: string;
    returnDate: string;
  }>({
    itemId: "",
    unitId: "",
    quantity: 1,
    rentalType: "diario",
    pickupDate: "",
    returnDate: "",
  });
  const [saveWorkAddress, setSaveWorkAddress] = useState(false);
  const [selectedWorkAddressId, setSelectedWorkAddressId] =
    useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["rental", id],
    queryFn: () => rentalService.getRentalById(id!),
    enabled: !!id,
  });
  const { data: itemsData } = useItems({ isActive: true, limit: 200 });
  const inventoryItems = itemsData?.data || [];
  const selectedInventoryItem = inventoryItems.find(
    (item: any) => item._id === newItemForm.itemId,
  );

  const { user } = useAuth();
  const isAdminUser = ["admin", "superadmin"].includes(user?.role || "");
  const autoBillingProcessedRef = useRef(false);

  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceRental, setInvoiceRental] = useState<any>(null);

  const processBillingMutation = useMutation({
    mutationFn: () => billingService.processRentalBilling(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rental-billings", id] });
    },
  });

  const { data: billingsData, isLoading: billingsLoading } = useQuery({
    queryKey: ["rental-billings", id],
    queryFn: () => billingService.getBillings({ rentalId: id!, limit: 200 }),
    enabled: !!id,
  });

  useEffect(() => {
    autoBillingProcessedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!id || !data?.data) return;
    if (
      !autoBillingProcessedRef.current &&
      ["active", "overdue"].includes(data.data.status)
    ) {
      autoBillingProcessedRef.current = true;
      processBillingMutation.mutate();
    }
  }, [id, data?.data?.status, processBillingMutation]);

  const updateStatusMutation = useMutation({
    mutationFn: (data: { status: RentalStatus; adjustments?: any }) =>
      rentalService.updateRentalStatus(id!, data),

    onSuccess: async (response, variables) => {
      setShowStatusModal(false);
      setServerError(null);
      setModalFinalizarAluguel(false);
      setClosePreview(null);

      if ("requiresApproval" in response) {
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 5000);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      if (variables.status === "active") {
        try {
          const responseInvoices = await invoiceService.getInvoices({
            rentalId: id!,
            limit: 1,
          });

          const invoice = responseInvoices.data?.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )[0];

          if (invoice) {
            setInvoiceRental(invoice);
            setShowInvoiceModal(true);
          }
        } catch (err) {
          console.error("Erro ao buscar fatura:", err);
        }
      }
    },
  });

  const closeRentalMutation = useMutation({
    mutationFn: () => rentalService.closeRental(id!),

    onSuccess: () => {
      setShowStatusModal(false);
      setServerError(null);
      setModalFinalizarAluguel(false);
      setClosePreview(null);

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

  const updateRentalMutation = useMutation({
    mutationFn: (payload: {
      notes?: string;
      pricing?: { discount?: number };
      dates?: { pickupScheduled?: string; returnScheduled?: string };
      workAddress?: RentalWorkAddress;
    }) => rentalService.updateRental(id!, payload),
    onSuccess: async (response) => {
      setShowEditModal(false);
      setServerError(null);

      if (saveWorkAddress && customer?._id && !selectedWorkAddressId) {
        try {
          await customerService.addAddress(customer._id, {
            addressName: editForm.workAddress.workName || "Obra",
            type: "work",
            workName: editForm.workAddress.workName,
            street: editForm.workAddress.street,
            number: editForm.workAddress.number,
            complement: editForm.workAddress.complement,
            neighborhood: editForm.workAddress.neighborhood,
            city: editForm.workAddress.city,
            state: editForm.workAddress.state,
            zipCode: editForm.workAddress.zipCode,
            country: "Brasil",
            isDefault: false,
          });
        } catch {
          toast.error("Não foi possível salvar o endereço do cliente");
        }
      }

      if ("requiresApproval" in response && response.requiresApproval) {
        toast.success("Solicitação enviada para aprovação");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message || "Erro ao atualizar aluguel";
      setServerError(message);
    },
  });

  const approveApprovalMutation = useMutation({
    mutationFn: ({
      approvalId,
      notes,
    }: {
      approvalId: string;
      notes?: string;
    }) => rentalService.approveApproval(id!, approvalId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
    },
  });

  const rejectApprovalMutation = useMutation({
    mutationFn: ({
      approvalId,
      notes,
    }: {
      approvalId: string;
      notes: string;
    }) => rentalService.rejectApproval(id!, approvalId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
    },
  });

  const getStatusColor = (status: RentalStatus) => {
    const colors = {
      reserved: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      overdue: "bg-red-100 text-red-800",
      completed: "bg-gray-100 text-gray-800",
      cancelled: "bg-yellow-100 text-yellow-800",
      ready_to_close: "bg-purple-100 text-purple-800", // 👈 ADICIONA
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
      ready_to_close: "Pronto para fechar",
    };
    return labels[status];
  };

  const formatCurrency = (value?: number) => {
    if (value === undefined || Number.isNaN(value)) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("pt-BR");
  };

  const handleDownloadBillingPDF = async (billingId: string) => {
    try {
      const blob = await billingService.generateBillingPDF(billingId);
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `fechamento-${billingId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao gerar PDF do fechamento");
    }
  };

  const handleDownloadRentalPDF = async () => {
    if (!id) return;
    try {
      const blob = await rentalService.generateRentalPDF(id);
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `locacao-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao gerar PDF da locação");
    }
  };

  const handleAbrirFinalizacaoItem = async (item: any) => {
    if (!id) return;
    setSelectedCloseItem({
      itemId: typeof item.itemId === "string" ? item.itemId : item.itemId._id,
      unitId: item.unitId,
      name:
        typeof item.itemId === "object" ? item.itemId.name || "Item" : "Item",
    });
    setCloseItemReturnDate(new Date().toISOString().split("T")[0]);
    setCloseItemLoading(true);
    try {
      const preview = await rentalService.getClosePreviewItem(
        id,
        typeof item.itemId === "string" ? item.itemId : item.itemId._id,
        item.unitId,
      );
      setCloseItemPreview(preview);
    } catch {
      setCloseItemPreview(null);
    } finally {
      setCloseItemLoading(false);
      setCloseItemModal(true);
    }
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
      const today = new Date().toISOString().split("T")[0];
      setCloseForm({
        returnDate: today,
        rentalType: response.rentalType ?? "daily",
        equipmentSubtotal: rental?.pricing?.equipmentSubtotal?.toFixed(2) ?? "",
        servicesSubtotal: rental?.pricing?.servicesSubtotal?.toFixed(2) ?? "",
        discount: rental?.pricing?.discount?.toFixed(2) ?? "",
        lateFee: rental?.pricing?.lateFee?.toFixed(2) ?? "",
        total:
          response?.recalculatedTotal?.toFixed?.(2) ??
          rental?.pricing?.total?.toFixed?.(2) ??
          "",
        notes: "",
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
      // Se o status atual é ready_to_close, pode confirmar
      if (rental && rental.status === "ready_to_close") {
        setShowStatusModal(false);
        setShowConfirmFinalClosure(true);
        return;
      }
      
      // Se não está ready_to_close, mostra erro
      toast.error(
        "Este aluguel ainda possui itens não finalizados. Finalize todos os itens antes de concluir o aluguel."
      );
      return;
    }
    updateStatusMutation.mutate({ status: newStatus });
    setShowStatusModal(false);
  };

  const confirmFinalClosure = async () => {
    if (!id) return;

    setLoadingConfirmClosure(true);
    try {
      await rentalService.confirmRentalClosure(id);

      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      setShowConfirmFinalClosure(false);
      toast.success("Aluguel finalizado com sucesso!");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erro ao finalizar aluguel");
      console.error(err);
    } finally {
      setLoadingConfirmClosure(false);
    }
  };

  const confirmarFinalizacao = async () => {
    if (!id) return;

    try {
      // 🔥 chama o backend que calcula tudo
      await rentalService.closeRental(id);

      // 🔥 atualiza tela
      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      // 🔥 fecha modal
      setModalFinalizarAluguel(false);
      setNewStatusAluguel(null);

      alert("Aluguel finalizado com sucesso!");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao finalizar aluguel");
    }
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
  const customer =
    typeof rental.customerId === "object" ? rental.customerId : null;
  const customerAddresses = customer?.addresses ?? [];

  const allReturned = rental.items.every((item) => item.returnActual);

  const billings = (billingsData?.data?.billings || []) as Billing[];
  const getBillingItemName = (item: any) => {
    if (item.itemId && typeof item.itemId === "object" && item.itemId.name) {
      return item.itemId.name;
    }
    const billingItemId =
      typeof item.itemId === "string" ? item.itemId : item.itemId?._id;
    const rentalItem = rental.items.find((ri: any) => {
      const rentalItemId =
        typeof ri.itemId === "string" ? ri.itemId : ri.itemId?._id;
      return rentalItemId === billingItemId;
    });
    if (rentalItem && typeof rentalItem.itemId === "object") {
      return rentalItem.itemId.name || "Item";
    }
    return "Item";
  };
  const totalPaid = billings
    .filter((billing) => billing.status === "paid")
    .reduce((sum, billing) => sum + (billing.calculation?.total || 0), 0);
  const totalOpen = billings
    .filter((billing) => !["paid", "cancelled"].includes(billing.status))
    .reduce((sum, billing) => sum + (billing.calculation?.total || 0), 0);
  const pendingApprovals =
    rental.pendingApprovals?.filter(
      (approval) => approval.status === "pending",
    ) || [];
  const changeHistory = rental.changeHistory || [];

  if (showEditModal) {
    return (
      <Layout title="Editar aluguel" backTo={`/rentals/${id}`}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Editar aluguel
                </h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  Voltar
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de retirada
                    </label>
                    <input
                      type="date"
                      value={editForm.pickupDate}
                      onChange={(e) =>
                        setEditForm({ ...editForm, pickupDate: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de devolução
                    </label>
                    <input
                      type="date"
                      value={editForm.returnDate}
                      onChange={(e) =>
                        setEditForm({ ...editForm, returnDate: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Itens do aluguel
                  </h3>
                  <div className="space-y-3">
                    {editForm.items.map((item, index) => {
                      const itemInfo = rental.items[index];
                      const itemName =
                        itemInfo && typeof itemInfo.itemId === "object"
                          ? itemInfo.itemId.name
                          : "Item";
                      return (
                        <div
                          key={`${item.itemId}-${item.unitId || index}`}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {itemName} • Qtd: {item.quantity}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = editForm.items.filter(
                                  (_, i) => i !== index,
                                );
                                setEditForm({ ...editForm, items: updated });
                              }}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              Remover
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                Tipo
                              </label>
                              <select
                                value={item.rentalType}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    rentalType: e.target.value as RentalTypeUI,
                                  };
                                  setEditForm({
                                    ...editForm,
                                    items: updated,
                                  });
                                }}
                                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                <option value="diario">Diário</option>
                                <option value="semanal">Semanal</option>
                                <option value="quinzenal">Quinzenal</option>
                                <option value="mensal">Mensal</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                Retirada
                              </label>
                              <input
                                type="date"
                                value={item.pickupDate}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    pickupDate: e.target.value,
                                  };
                                  setEditForm({
                                    ...editForm,
                                    items: updated,
                                  });
                                }}
                                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                Devolução
                              </label>
                              <input
                                type="date"
                                value={item.returnDate}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    returnDate: e.target.value,
                                  };
                                  setEditForm({
                                    ...editForm,
                                    items: updated,
                                  });
                                }}
                                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Adicionar item
                    </div>
                    <div className="space-y-2">
                      <select
                        value={newItemForm.itemId}
                        onChange={(e) =>
                          setNewItemForm({
                            ...newItemForm,
                            itemId: e.target.value,
                            unitId: "",
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Selecione o item</option>
                        {inventoryItems.map((item: any) => (
                          <option key={item._id} value={item._id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      {selectedInventoryItem && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {selectedInventoryItem?.trackingType === "unit"
                            ? `Unidades disponíveis: ${
                                selectedInventoryItem?.units?.filter(
                                  (u: any) => u.status === "available",
                                ).length || 0
                              }`
                            : `Quantidade disponível: ${
                                selectedInventoryItem?.quantity?.available || 0
                              }`}
                        </div>
                      )}
                      {selectedInventoryItem?.trackingType === "unit" && (
                        <select
                          value={newItemForm.unitId || ""}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              unitId: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">Selecione a unidade</option>
                          {selectedInventoryItem?.units
                            ?.filter((u: any) => u.status === "available")
                            .map((unit: any) => (
                              <option key={unit.unitId} value={unit.unitId}>
                                Unidade: {unit.unitId}
                              </option>
                            ))}
                        </select>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="1"
                          value={newItemForm.quantity}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              quantity: Number(e.target.value) || 1,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <select
                          value={newItemForm.rentalType}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              rentalType: e.target.value as RentalTypeUI,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="diario">Diário</option>
                          <option value="semanal">Semanal</option>
                          <option value="quinzenal">Quinzenal</option>
                          <option value="mensal">Mensal</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={newItemForm.pickupDate}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              pickupDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <input
                          type="date"
                          value={newItemForm.returnDate}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              returnDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newItemForm.itemId) {
                            toast.error("Selecione um item.");
                            return;
                          }
                          if (
                            selectedInventoryItem?.trackingType === "unit" &&
                            !newItemForm.unitId
                          ) {
                            toast.error("Selecione a unidade.");
                            return;
                          }
                          if (!newItemForm.pickupDate) {
                            toast.error("Informe a retirada do item.");
                            return;
                          }
                          if (
                            newItemForm.returnDate &&
                            newItemForm.returnDate < newItemForm.pickupDate
                          ) {
                            toast.error(
                              "A devolução deve ser posterior à retirada.",
                            );
                            return;
                          }
                          setEditForm({
                            ...editForm,
                            items: [
                              ...editForm.items,
                              {
                                itemId: newItemForm.itemId,
                                unitId: newItemForm.unitId,
                                quantity: newItemForm.quantity,
                                rentalType: newItemForm.rentalType,
                                pickupDate: newItemForm.pickupDate,
                                returnDate: newItemForm.returnDate,
                              },
                            ],
                          });
                          setNewItemForm({
                            itemId: "",
                            unitId: "",
                            quantity: 1,
                            rentalType: "diario",
                            pickupDate: "",
                            returnDate: "",
                          });
                        }}
                        className="px-3 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-md text-sm font-medium"
                      >
                        Adicionar item
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Endereço da obra
                  </h3>
                  {customerAddresses.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <label className="text-sm text-gray-700 dark:text-gray-300">
                        Usar endereço salvo:
                      </label>
                      <select
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        value={selectedWorkAddressId}
                        onChange={(e) => {
                          const addressId = e.target.value;
                          setSelectedWorkAddressId(addressId);
                          const addr = customerAddresses.find(
                            (a) => a._id === addressId,
                          );
                          if (!addr) return;
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              street: addr.street,
                              number: addr.number,
                              complement: addr.complement,
                              neighborhood: addr.neighborhood,
                              city: addr.city,
                              state: addr.state,
                              zipCode: addr.zipCode,
                              workName:
                                addr.workName ||
                                addr.addressName ||
                                (addr.type === "main"
                                  ? "Endereço Principal"
                                  : addr.type === "billing"
                                    ? "Endereço de Cobrança"
                                    : "Outro Endereço"),
                              workId: addr._id,
                            },
                          });
                          setSaveWorkAddress(false);
                        }}
                      >
                        <option value="">Selecione um endereço</option>
                        {customerAddresses.map((address) => (
                          <option key={address._id} value={address._id}>
                            {address.type === "work"
                              ? address.workName ||
                                address.addressName ||
                                "Obra"
                              : address.type === "main"
                                ? "Principal"
                                : address.type === "billing"
                                  ? "Cobrança"
                                  : "Outro"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Nome da obra"
                        value={editForm.workAddress.workName}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              workName: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Rua"
                        value={editForm.workAddress.street}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              street: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Número"
                        value={editForm.workAddress.number || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              number: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Complemento"
                        value={editForm.workAddress.complement || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              complement: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Bairro"
                        value={editForm.workAddress.neighborhood || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              neighborhood: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Cidade"
                        value={editForm.workAddress.city}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              city: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Estado"
                        value={editForm.workAddress.state}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              state: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="CEP"
                        value={editForm.workAddress.zipCode}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              zipCode: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={saveWorkAddress}
                      onChange={(e) => setSaveWorkAddress(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                    Salvar este endereço para próximos aluguéis
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observações
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, notes: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                {!isAdminUser && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Como funcionário, a edição será enviada para aprovação.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const work = editForm.workAddress;
                    const workValues = [
                      work.workName,
                      work.street,
                      work.city,
                      work.state,
                      work.zipCode,
                      work.number,
                      work.complement,
                      work.neighborhood,
                      work.workId,
                    ];
                    const hasWorkAddress = workValues.some(
                      (v) => (v || "").trim() !== "",
                    );

                    if (hasWorkAddress) {
                      const missing = [];
                      if (!work.workName.trim()) missing.push("nome da obra");
                      if (!work.street.trim()) missing.push("rua");
                      if (!work.city.trim()) missing.push("cidade");
                      if (!work.state.trim()) missing.push("estado");
                      if (!work.zipCode.trim()) missing.push("CEP");
                      if (missing.length > 0) {
                        toast.error(
                          `Preencha o endereço da obra: ${missing.join(", ")}.`,
                        );
                        return;
                      }
                    }

                    const payload: {
                      notes?: string;
                      dates?: {
                        pickupScheduled?: string;
                        returnScheduled?: string;
                      };
                      workAddress?: RentalWorkAddress;
                      items?: Array<{
                        itemId: string;
                        unitId?: string;
                        quantity?: number;
                        rentalType?:
                          | "daily"
                          | "weekly"
                          | "biweekly"
                          | "monthly";
                        pickupScheduled?: string;
                        returnScheduled?: string;
                      }>;
                    } = {
                      notes: editForm.notes,
                    };

                    if (editForm.pickupDate || editForm.returnDate) {
                      payload.dates = {
                        pickupScheduled: editForm.pickupDate
                          ? new Date(editForm.pickupDate).toISOString()
                          : undefined,
                        returnScheduled: editForm.returnDate
                          ? new Date(editForm.returnDate).toISOString()
                          : undefined,
                      };
                    }

                    if (hasWorkAddress) {
                      payload.workAddress = {
                        workName: work.workName.trim(),
                        street: work.street.trim(),
                        city: work.city.trim(),
                        state: work.state.trim(),
                        zipCode: work.zipCode.trim(),
                        number: work.number?.trim(),
                        complement: work.complement?.trim(),
                        neighborhood: work.neighborhood?.trim(),
                        workId: work.workId?.trim(),
                      };
                    }

                    if (editForm.items.length > 0) {
                      const invalidItem = editForm.items.find(
                        (item) =>
                          item.returnDate &&
                          item.pickupDate &&
                          item.returnDate < item.pickupDate,
                      );
                      if (invalidItem) {
                        toast.error(
                          "Há item com devolução anterior à retirada.",
                        );
                        return;
                      }
                      payload.items = editForm.items.map((item) => ({
                        itemId: item.itemId,
                        unitId: item.unitId || undefined,
                        quantity: item.quantity,
                        rentalType: rentalTypeUiToApi[item.rentalType] as
                          | "daily"
                          | "weekly"
                          | "biweekly"
                          | "monthly",
                        pickupScheduled: item.pickupDate
                          ? new Date(item.pickupDate).toISOString()
                          : undefined,
                        returnScheduled: item.returnDate
                          ? new Date(item.returnDate).toISOString()
                          : undefined,
                      }));
                    }

                    updateRentalMutation.mutate(payload);
                  }}
                  className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Detalhes do Aluguel" backTo="/dashboard">
      {showSuccessToast && (
        <SuccessToast
          onClose={() => setShowSuccessToast(false)}
          message="Sua Solicitação Foi Enviada Com Sucesso!"
          description="Os administradores vão cuidar disso."
        />
      )}
      {allReturned && rental.status !== "completed" && (
        <button
          onClick={confirmarFinalizacao}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
        >
          Finalizar aluguel
        </button>
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
                  onClick={handleDownloadRentalPDF}
                  className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
                      d="M12 16.5v-9m0 9 3-3m-3 3-3-3M6 19.5h12"
                    />
                  </svg>
                  Baixar PDF
                </button>
                <button
                  onClick={() => {
                    const workAddress =
                      rental.workAddress || ({} as RentalWorkAddress);
                    setEditForm({
                      notes: rental.notes || "",
                      pickupDate: rental.dates.pickupScheduled.split("T")[0],
                      returnDate: rental.dates.returnScheduled
                        ? rental.dates.returnScheduled.split("T")[0]
                        : "",
                      items: rental.items.map((item: any) => ({
                        itemId:
                          typeof item.itemId === "string"
                            ? item.itemId
                            : item.itemId._id,
                        unitId: item.unitId,
                        quantity: item.quantity,
                        rentalType:
                          rentalTypeApiToUi[item.rentalType] || "diario",
                        pickupDate: item.pickupScheduled
                          ? item.pickupScheduled.split("T")[0]
                          : "",
                        returnDate: item.returnScheduled
                          ? item.returnScheduled.split("T")[0]
                          : "",
                      })),
                      workAddress: {
                        street: workAddress.street || "",
                        number: workAddress.number || "",
                        complement: workAddress.complement || "",
                        neighborhood: workAddress.neighborhood || "",
                        city: workAddress.city || "",
                        state: workAddress.state || "",
                        zipCode: workAddress.zipCode || "",
                        workName: workAddress.workName || "",
                        workId: workAddress.workId || "",
                      },
                    });
                    setSelectedWorkAddressId(workAddress.workId || "");
                    setSaveWorkAddress(false);
                    setShowEditModal(true);
                  }}
                  className="inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
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
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 7.125 16.862 4.487"
                    />
                  </svg>
                  Editar informações
                </button>
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
                      Criado em
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(rental.dates.reservedAt).toLocaleString(
                        "pt-BR",
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Retirada real
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {new Date(
                        rental.dates.pickupScheduled,
                      ).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
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
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Tipo: {item.rentalType || "daily"} • Retirada:{" "}
                            {item.pickupScheduled
                              ? new Date(
                                  item.pickupScheduled,
                                ).toLocaleDateString("pt-BR")
                              : "-"}{" "}
                            • Devolução:{" "}
                            {item.returnScheduled
                              ? new Date(
                                  item.returnScheduled,
                                ).toLocaleDateString("pt-BR")
                              : "-"}
                          </div>
                          {!item.returnActual && (
                            <button
                              type="button"
                              onClick={() => handleAbrirFinalizacaoItem(item)}
                              className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                            >
                              Finalizar entrega deste item
                            </button>
                          )}
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
                <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
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
                          d="M12 6v6l4 2M6 6h.01M6 12h.01M6 18h.01M18 6h.01M18 12h.01M18 18h.01"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Fechamentos e cobranças
                    </h2>
                    <button
                      type="button"
                      onClick={() => processBillingMutation.mutate()}
                      className="ml-auto text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Atualizar fechamentos
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400 mb-4">
                    <span>
                      Períodos cobrados:{" "}
                      <strong className="text-gray-900 dark:text-white">
                        {billings.length}
                      </strong>
                    </span>
                    <span>
                      Pago:{" "}
                      <strong className="text-gray-900 dark:text-white">
                        {formatCurrency(totalPaid)}
                      </strong>
                    </span>
                    <span>
                      Em aberto:{" "}
                      <strong className="text-gray-900 dark:text-white">
                        {formatCurrency(totalOpen)}
                      </strong>
                    </span>
                  </div>
                  {billingsLoading ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Carregando fechamentos...
                    </div>
                  ) : billings.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum fechamento registrado.
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      {billings.map((billing) => (
                        <div
                          key={billing._id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50"
                        >
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>
                              {formatDate(billing.periodStart)} →{" "}
                              {formatDate(billing.periodEnd)}
                            </span>
                            <span>
                              {billing.status === "paid"
                                ? "Pago"
                                : billing.status === "approved"
                                  ? "A receber"
                                  : billing.status === "pending_approval"
                                    ? "Pendente"
                                    : billing.status === "cancelled"
                                      ? "Cancelado"
                                      : "Fechamento previsto"}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                            {formatCurrency(billing.calculation?.total)}
                          </div>
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            {billing.items && billing.items.length > 0 ? (
                              billing.items.map((item, idx) => {
                                return (
                                  <div key={`${billing._id}-${idx}`}>
                                    • {getBillingItemName(item)} — Qtd:{" "}
                                    {item.quantity} — Períodos:{" "}
                                    {item.periodsCharged} — Subtotal:{" "}
                                    {formatCurrency(item.subtotal)}
                                  </div>
                                );
                              })
                            ) : (
                              <div>Sem itens associados a este fechamento.</div>
                            )}
                          </div>
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                handleDownloadBillingPDF(billing._id)
                              }
                              className="text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                            >
                              Baixar PDF
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {pendingApprovals.length > 0 &&
                (user?.role === "admin" || user?.role === "superadmin") && (
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
                            d="M12 6v6l4 2"
                          />
                        </svg>
                      </div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Aprovações pendentes
                      </h2>
                    </div>
                    <div className="space-y-3">
                      {pendingApprovals.map((approval) => (
                        <div
                          key={approval._id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50"
                        >
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {approval.requestType}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Date(approval.requestDate).toLocaleString(
                              "pt-BR",
                            )}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => {
                                const notes =
                                  window.prompt(
                                    "Observações para aprovação (opcional):",
                                  ) || undefined;
                                approveApprovalMutation.mutate({
                                  approvalId: approval._id,
                                  notes,
                                });
                              }}
                              className="px-3 py-2 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md"
                            >
                              Aprovar
                            </button>
                            <button
                              onClick={() => {
                                const notes = window.prompt(
                                  "Informe o motivo da rejeição:",
                                );
                                if (!notes) return;
                                rejectApprovalMutation.mutate({
                                  approvalId: approval._id,
                                  notes,
                                });
                              }}
                              className="px-3 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md"
                            >
                              Rejeitar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
              {changeHistory.length > 0 && (
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
                          d="M12 6v6l4 2"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Histórico de alterações
                    </h2>
                  </div>
                  <div className="space-y-3 text-sm">
                    {changeHistory.map((history, index) => (
                      <div
                        key={`${history.date}-${index}`}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900/50"
                      >
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(history.date).toLocaleString("pt-BR")}
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {history.changeType}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {history.previousValue} → {history.newValue}
                        </div>
                        {history.reason && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {history.reason}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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
                <option value="ready_to_close">Pronto para fechar</option>
                <option 
                  value="completed" 
                  disabled={rental?.status !== "ready_to_close"}
                  className={rental?.status !== "ready_to_close" ? "opacity-50" : ""}
                >
                  Finalizado {rental?.status !== "ready_to_close" ? "(Bloqueado)" : ""}
                </option>
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

        {showExtendModal && null}

        {showChecklistModal && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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

        {false && (
          <div className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 max-w-md w-full">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Editar aluguel
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de retirada
                    </label>
                    <input
                      type="date"
                      value={editForm.pickupDate}
                      onChange={(e) =>
                        setEditForm({ ...editForm, pickupDate: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de devolução
                    </label>
                    <input
                      type="date"
                      value={editForm.returnDate}
                      onChange={(e) =>
                        setEditForm({ ...editForm, returnDate: e.target.value })
                      }
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Itens do aluguel
                  </h3>
                  <div className="space-y-3">
                    {editForm.items.map((item, index) => {
                      const itemInfo = rental.items[index];
                      const itemName =
                        itemInfo && typeof itemInfo.itemId === "object"
                          ? itemInfo.itemId.name
                          : "Item";
                      return (
                        <div
                          key={`${item.itemId}-${item.unitId || index}`}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {itemName} • Qtd: {item.quantity}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = editForm.items.filter(
                                  (_, i) => i !== index,
                                );
                                setEditForm({ ...editForm, items: updated });
                              }}
                              className="text-xs text-red-600 hover:text-red-700"
                            >
                              Remover
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                Tipo
                              </label>
                              <select
                                value={item.rentalType}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    rentalType: e.target.value as RentalTypeUI,
                                  };
                                  setEditForm({
                                    ...editForm,
                                    items: updated,
                                  });
                                }}
                                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              >
                                <option value="diario">Diário</option>
                                <option value="semanal">Semanal</option>
                                <option value="quinzenal">Quinzenal</option>
                                <option value="mensal">Mensal</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                Retirada
                              </label>
                              <input
                                type="date"
                                value={item.pickupDate}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    pickupDate: e.target.value,
                                  };
                                  setEditForm({
                                    ...editForm,
                                    items: updated,
                                  });
                                }}
                                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                                Devolução
                              </label>
                              <input
                                type="date"
                                value={item.returnDate}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    returnDate: e.target.value,
                                  };
                                  setEditForm({
                                    ...editForm,
                                    items: updated,
                                  });
                                }}
                                className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Adicionar item
                    </div>
                    <div className="space-y-2">
                      <select
                        value={newItemForm.itemId}
                        onChange={(e) =>
                          setNewItemForm({
                            ...newItemForm,
                            itemId: e.target.value,
                            unitId: "",
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Selecione o item</option>
                        {inventoryItems.map((item: any) => (
                          <option key={item._id} value={item._id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      {selectedInventoryItem && (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {selectedInventoryItem?.trackingType === "unit"
                            ? `Unidades disponíveis: ${
                                selectedInventoryItem?.units?.filter(
                                  (u: any) => u.status === "available",
                                ).length || 0
                              }`
                            : `Quantidade disponível: ${
                                selectedInventoryItem?.quantity?.available || 0
                              }`}
                        </div>
                      )}

                      {selectedInventoryItem?.trackingType === "unit" && (
                        <select
                          value={newItemForm.unitId || ""}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              unitId: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="">Selecione a unidade</option>
                          {selectedInventoryItem?.units
                            ?.filter((u: any) => u.status === "available")
                            .map((unit: any) => (
                              <option key={unit.unitId} value={unit.unitId}>
                                Unidade: {unit.unitId}
                              </option>
                            ))}
                        </select>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="1"
                          value={newItemForm.quantity}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              quantity: Number(e.target.value) || 1,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <select
                          value={newItemForm.rentalType}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              rentalType: e.target.value as RentalTypeUI,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="diario">Diário</option>
                          <option value="semanal">Semanal</option>
                          <option value="quinzenal">Quinzenal</option>
                          <option value="mensal">Mensal</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={newItemForm.pickupDate}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              pickupDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <input
                          type="date"
                          value={newItemForm.returnDate}
                          onChange={(e) =>
                            setNewItemForm({
                              ...newItemForm,
                              returnDate: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!newItemForm.itemId) {
                            toast.error("Selecione um item.");
                            return;
                          }
                          if (
                            selectedInventoryItem?.trackingType === "unit" &&
                            !newItemForm.unitId
                          ) {
                            toast.error("Selecione a unidade.");
                            return;
                          }
                          if (!newItemForm.pickupDate) {
                            toast.error("Informe a retirada do item.");
                            return;
                          }
                          if (
                            newItemForm.returnDate &&
                            newItemForm.returnDate < newItemForm.pickupDate
                          ) {
                            toast.error(
                              "A devolução deve ser posterior à retirada.",
                            );
                            return;
                          }
                          setEditForm({
                            ...editForm,
                            items: [
                              ...editForm.items,
                              {
                                itemId: newItemForm.itemId,
                                unitId: newItemForm.unitId,
                                quantity: newItemForm.quantity,
                                rentalType: newItemForm.rentalType,
                                pickupDate: newItemForm.pickupDate,
                                returnDate: newItemForm.returnDate,
                              },
                            ],
                          });
                          setNewItemForm({
                            itemId: "",
                            unitId: "",
                            quantity: 1,
                            rentalType: "diario",
                            pickupDate: "",
                            returnDate: "",
                          });
                        }}
                        className="px-3 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-md text-sm font-medium"
                      >
                        Adicionar item
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Endereço da obra
                  </h3>
                  {customerAddresses.length > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                      <label className="text-sm text-gray-700 dark:text-gray-300">
                        Usar endereço salvo:
                      </label>
                      <select
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        value={selectedWorkAddressId}
                        onChange={(e) => {
                          const addressId = e.target.value;
                          setSelectedWorkAddressId(addressId);
                          const addr = customerAddresses.find(
                            (a) => a._id === addressId,
                          );
                          if (!addr) return;
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              street: addr.street,
                              number: addr.number,
                              complement: addr.complement,
                              neighborhood: addr.neighborhood,
                              city: addr.city,
                              state: addr.state,
                              zipCode: addr.zipCode,
                              workName:
                                addr.workName ||
                                addr.addressName ||
                                (addr.type === "main"
                                  ? "Endereço Principal"
                                  : addr.type === "billing"
                                    ? "Endereço de Cobrança"
                                    : "Outro Endereço"),
                              workId: addr._id,
                            },
                          });
                          setSaveWorkAddress(false);
                        }}
                      >
                        <option value="">Selecione um endereço</option>
                        {customerAddresses.map((address) => (
                          <option key={address._id} value={address._id}>
                            {address.type === "work"
                              ? address.workName ||
                                address.addressName ||
                                "Obra"
                              : address.type === "main"
                                ? "Principal"
                                : address.type === "billing"
                                  ? "Cobrança"
                                  : "Outro"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Nome da obra"
                        value={editForm.workAddress.workName}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              workName: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Rua"
                        value={editForm.workAddress.street}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              street: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Número"
                        value={editForm.workAddress.number || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              number: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Complemento"
                        value={editForm.workAddress.complement || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              complement: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Bairro"
                        value={editForm.workAddress.neighborhood || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              neighborhood: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Cidade"
                        value={editForm.workAddress.city}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              city: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Estado"
                        maxLength={2}
                        value={editForm.workAddress.state}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              state: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm uppercase"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="CEP"
                        value={editForm.workAddress.zipCode}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              zipCode: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="ID da obra"
                        value={editForm.workAddress.workId || ""}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            workAddress: {
                              ...editForm.workAddress,
                              workId: e.target.value,
                            },
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={saveWorkAddress}
                      onChange={(e) => setSaveWorkAddress(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                    />
                    Salvar este endereço para próximos aluguéis
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Observações
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    onChange={(e) =>
                      setEditForm({ ...editForm, notes: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                {!isAdminUser && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Como funcionário, a edição será enviada para aprovação.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    const work = editForm.workAddress;
                    const workValues = [
                      work.workName,
                      work.street,
                      work.city,
                      work.state,
                      work.zipCode,
                      work.number,
                      work.complement,
                      work.neighborhood,
                      work.workId,
                    ];
                    const hasWorkAddress = workValues.some(
                      (v) => (v || "").trim() !== "",
                    );

                    if (hasWorkAddress) {
                      const missing = [];
                      if (!work.workName.trim()) missing.push("nome da obra");
                      if (!work.street.trim()) missing.push("rua");
                      if (!work.city.trim()) missing.push("cidade");
                      if (!work.state.trim()) missing.push("estado");
                      if (!work.zipCode.trim()) missing.push("CEP");
                      if (missing.length > 0) {
                        toast.error(
                          `Preencha o endereço da obra: ${missing.join(", ")}.`,
                        );
                        return;
                      }
                    }

                    const payload: {
                      notes?: string;
                      dates?: {
                        pickupScheduled?: string;
                        returnScheduled?: string;
                      };
                      workAddress?: RentalWorkAddress;
                      items?: Array<{
                        itemId: string;
                        unitId?: string;
                        quantity?: number;
                        rentalType?:
                          | "daily"
                          | "weekly"
                          | "biweekly"
                          | "monthly";
                        pickupScheduled?: string;
                        returnScheduled?: string;
                      }>;
                    } = {
                      notes: editForm.notes,
                    };

                    if (editForm.pickupDate || editForm.returnDate) {
                      payload.dates = {
                        pickupScheduled: editForm.pickupDate
                          ? new Date(editForm.pickupDate).toISOString()
                          : undefined,
                        returnScheduled: editForm.returnDate
                          ? new Date(editForm.returnDate).toISOString()
                          : undefined,
                      };
                    }

                    if (hasWorkAddress) {
                      payload.workAddress = {
                        workName: work.workName.trim(),
                        street: work.street.trim(),
                        city: work.city.trim(),
                        state: work.state.trim(),
                        zipCode: work.zipCode.trim(),
                        number: work.number?.trim(),
                        complement: work.complement?.trim(),
                        neighborhood: work.neighborhood?.trim(),
                        workId: work.workId?.trim(),
                      };
                    }

                    if (editForm.items.length > 0) {
                      const invalidItem = editForm.items.find(
                        (item) =>
                          item.returnDate &&
                          item.pickupDate &&
                          item.returnDate < item.pickupDate,
                      );
                      if (invalidItem) {
                        toast.error(
                          "Há item com devolução anterior à retirada.",
                        );
                        return;
                      }
                      payload.items = editForm.items.map((item) => ({
                        itemId: item.itemId,
                        unitId: item.unitId || undefined,
                        quantity: item.quantity,
                        rentalType: rentalTypeUiToApi[item.rentalType] as
                          | "daily"
                          | "weekly"
                          | "biweekly"
                          | "monthly",
                        pickupScheduled: item.pickupDate
                          ? new Date(item.pickupDate).toISOString()
                          : undefined,
                        returnScheduled: item.returnDate
                          ? new Date(item.returnDate).toISOString()
                          : undefined,
                      }));
                    }

                    updateRentalMutation.mutate(payload);
                  }}
                  className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Salvar
                </button>
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

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Data de devolução
                      </label>
                      <input
                        type="date"
                        value={closeForm.returnDate}
                        onChange={(e) =>
                          setCloseForm({
                            ...closeForm,
                            returnDate: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tipo de aluguel
                      </label>
                      <select
                        value={closeForm.rentalType}
                        onChange={(e) =>
                          setCloseForm({
                            ...closeForm,
                            rentalType: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      >
                        <option value="daily">Diária</option>
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Quinzenal</option>
                        <option value="monthly">Mensal</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Subtotal equipamentos
                        </label>
                        <input
                          type="number"
                          value={closeForm.equipmentSubtotal}
                          onChange={(e) =>
                            setCloseForm({
                              ...closeForm,
                              equipmentSubtotal: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Subtotal serviços
                        </label>
                        <input
                          type="number"
                          value={closeForm.servicesSubtotal}
                          onChange={(e) =>
                            setCloseForm({
                              ...closeForm,
                              servicesSubtotal: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Desconto
                        </label>
                        <input
                          type="number"
                          value={closeForm.discount}
                          onChange={(e) =>
                            setCloseForm({
                              ...closeForm,
                              discount: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Multa
                        </label>
                        <input
                          type="number"
                          value={closeForm.lateFee}
                          onChange={(e) =>
                            setCloseForm({
                              ...closeForm,
                              lateFee: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Total
                      </label>
                      <input
                        type="number"
                        value={closeForm.total}
                        onChange={(e) =>
                          setCloseForm({ ...closeForm, total: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Observações
                      </label>
                      <textarea
                        rows={3}
                        value={closeForm.notes}
                        onChange={(e) =>
                          setCloseForm({ ...closeForm, notes: e.target.value })
                        }
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    {!isAdminUser && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Como funcionário, esta finalização com ajustes será
                        enviada para aprovação do administrador.
                      </p>
                    )}
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

        {closeItemModal && selectedCloseItem && (
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
                      d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.746 3.746 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Finalizar entrega do item
                </h2>
              </div>

              <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                {selectedCloseItem.name}
              </div>

              {closeItemLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Calculando fechamento...
                </div>
              ) : closeItemPreview ? (
                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Dias utilizados:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {closeItemPreview.usedDays}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Valor original:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      R$ {closeItemPreview.originalTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">
                      Valor recalculado:
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      R$ {closeItemPreview.recalculatedTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : null}

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data de devolução
              </label>
              <input
                type="date"
                value={closeItemReturnDate}
                onChange={(e) => setCloseItemReturnDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCloseItemModal(false)}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!selectedCloseItem || !id) return;
                    try {
                      await rentalService.closeRentalItem(
                        id,
                        selectedCloseItem.itemId,
                        {
                          returnDate: closeItemReturnDate
                            ? new Date(closeItemReturnDate).toISOString()
                            : undefined,
                          unitId: selectedCloseItem.unitId,
                        },
                      );
                      setCloseItemModal(false);
                      queryClient.invalidateQueries({
                        queryKey: ["rental", id],
                      });
                      queryClient.invalidateQueries({ queryKey: ["rentals"] });
                      queryClient.invalidateQueries({
                        queryKey: ["rental-billings", id],
                      });
                      toast.success("Entrega do item finalizada.");
                    } catch {
                      toast.error("Erro ao finalizar entrega do item.");
                    }
                  }}
                  className="px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        {showConfirmFinalClosure && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-md">
              <div className="flex items-center mb-4">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg mr-3">
                  <svg
                    className="w-5 h-5 text-green-600 dark:text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Confirmar Fechamento do Aluguel
                </h2>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Todos os itens foram devolvidos e o aluguel está pronto para ser
                finalizado. Esta ação é irreversível.
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Status atual:</strong> Pronto para fechar
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-2">
                  <strong>Ação:</strong> Finalizar aluguel
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirmFinalClosure(false)}
                  disabled={loadingConfirmClosure}
                  className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmFinalClosure}
                  disabled={loadingConfirmClosure}
                  className="px-4 py-2.5 bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 flex items-center gap-2"
                >
                  {loadingConfirmClosure && (
                    <svg
                      className="animate-spin h-4 w-4"
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
                  )}
                  {loadingConfirmClosure ? "Processando..." : "Confirmar Fechamento"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showInvoiceModal && invoiceRental && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg w-[400px]">
              <h2 className="text-lg font-semibold">Fatura criada !</h2>

              <p className="mt-2 text-sm">
                A fatura{" "}
                <span className="font-medium">
                  {invoiceRental.invoiceNumber}
                </span>{" "}
                foi gerada com sucesso.
              </p>

              <div className="mt-4 flex gap-2">
                <Link
                  to={`/invoices/${invoiceRental._id}`}
                  className="flex-1 flex items-center justify-center bg-green-600 text-white py-2 rounded-md hover:bg-green-700"
                >
                  Ver fatura
                </Link>

                <button
                  onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 border border-gray-300 py-2 rounded-md"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RentalDetailPage;
