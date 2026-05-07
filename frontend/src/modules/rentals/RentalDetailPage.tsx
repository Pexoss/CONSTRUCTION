import React, { useEffect, useState } from "react";
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
import { createPortal } from "react-dom";
import {
  formatDocumentForDisplay,
  formatPhoneForDisplay,
  formatDateNoTimezoneShift,
  formatDateTimeForDisplay,
  formatRentalTypeLabel,
  getBillingOutstandingAmount,
  todayDateInputValue,
} from "../../utils/formatters";
import { features } from "../../config/features";
const RentalDetailPage: React.FC = () => {
  const rentalTypeApiToUi: Record<string, RentalTypeUI> = {
    daily: "diario",
    weekly: "semanal",
    biweekly: "quinzenal",
    monthly: "mensal",
  };

  const computeReturnFromPickupAndType = (
    pickup: string,
    type: RentalTypeUI,
  ): string => {
    if (!pickup) return "";
    const [y, m, d] = pickup.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    let add = 1;
    switch (type) {
      case "diario":
        add = 1;
        break;
      case "semanal":
        add = 6;
        break;
      case "quinzenal":
        add = 14;
        break;
      case "mensal":
        add = 29;
        break;
      default:
        add = 1;
    }
    const end = new Date(start);
    end.setDate(end.getDate() + add);
    const yy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, "0");
    const dd = String(end.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  const rentalTypeUiToApi: Record<RentalTypeUI, string> = {
    diario: "daily",
    semanal: "weekly",
    quinzenal: "biweekly",
    mensal: "monthly",
  };

  const toDateInput = (value?: string | Date | null) => {
    if (!value) return "";
    const str = value instanceof Date ? value.toISOString() : String(value);
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  };

  const toTimeInput = (value?: string | Date | null) => {
    if (!value) return "";
    if (typeof value === "string" && /T00:00:00(?:\.000)?Z$/.test(value)) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  };

  const toLocalDateTimeIso = (date: string, time = "00:00") => {
    if (!date) return undefined;
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(
      year,
      month - 1,
      day,
      hours || 0,
      minutes || 0,
    ).toISOString();
  };

  const formatTimeForDisplay = (value?: string | Date | null) => {
    if (!value) return "";
    if (typeof value === "string" && /T00:00:00(?:\.000)?Z$/.test(value)) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatPickupDateForDisplay = (value?: string | Date | null) => {
    if (!value) return "";
    if (typeof value === "string" && /T00:00:00(?:\.000)?Z$/.test(value)) {
      return formatDateNoTimezoneShift(value);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return formatDateNoTimezoneShift(value);
    return date.toLocaleDateString("pt-BR");
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
  const [closeItemReturnedQuantity, setCloseItemReturnedQuantity] = useState(1);
  const [closeItemNewRentalType, setCloseItemNewRentalType] = useState<
    "daily" | "weekly" | "biweekly" | "monthly" | ""
  >("");
  const [closeItemBillingRentalType, setCloseItemBillingRentalType] = useState<
    "daily" | "weekly" | "biweekly" | "monthly" | ""
  >("");
  const [closeItemPreview, setCloseItemPreview] = useState<{
    originalTotal: number;
    recalculatedTotal: number;
    usedDays: number;
    contractedDays: number;
    rentalType: string;
    rentalTotalAfterClose: number;
  } | null>(null);
  const [closeItemLoading, setCloseItemLoading] = useState(false);
  const [selectedCloseItem, setSelectedCloseItem] = useState<{
    itemId: string;
    unitId?: string;
    name: string;
    quantity: number;
    rentalType?: "daily" | "weekly" | "biweekly" | "monthly";
  } | null>(null);
  const [editForm, setEditForm] = useState({
    notes: "",
    pickupDate: "",
    pickupTime: "",
    returnDate: "",
    items: [] as Array<{
      itemId: string;
      unitId?: string;
      quantity: number;
      rentalType: RentalTypeUI;
      pickupDate: string;
      pickupTime: string;
      returnDate: string;
      returnActualDate?: string;
      historicalDelivery?: boolean;
      recalculateOnSave?: boolean;
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
    pickupTime: string;
    returnDate: string;
  }>({
    itemId: "",
    unitId: "",
    quantity: 1,
    rentalType: "diario",
    pickupDate: "",
    pickupTime: "",
    returnDate: "",
  });
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState("");
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
  const filteredInventoryItems = inventoryItems.filter((item: any) => {
    if (!addItemSearch.trim()) return true;
    const term = addItemSearch.toLowerCase().trim();
    return (
      item.name?.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term) ||
      item.sku?.toLowerCase().includes(term)
    );
  });

  const { user } = useAuth();
  const isAdminUser = ["admin", "superadmin"].includes(user?.role || "");

  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const processBillingMutation = useMutation({
    mutationFn: () => billingService.processRentalBilling(id!),
  });

  const runProcessBillingFeedback = (
    payload: Awaited<ReturnType<typeof billingService.processRentalBilling>>,
  ) => {
    const d = payload?.data;
    if (!d || typeof d !== "object") {
      toast.error(
        "Resposta inválida do servidor ao processar fechamentos. Tente novamente.",
      );
      return;
    }
    if (d.skipReason === "rental_not_active") {
      toast.warning(
        "Só é possível gerar fechamentos quando o aluguel estiver ativo ou em atraso. Se você pediu alteração de status, aguarde a aprovação de um administrador.",
      );
      return;
    }
    const parts: string[] = [];
    if (d.created > 0) {
      parts.push(
        `${d.created} fechamento${d.created === 1 ? "" : "s"} gerado${d.created === 1 ? "" : "s"}`,
      );
    }
    if (d.draftsCreated > 0) {
      parts.push(
        `${d.draftsCreated} fechamento${d.draftsCreated === 1 ? "" : "s"} previsto${d.draftsCreated === 1 ? "" : "s"} em rascunho`,
      );
    }
    if (parts.length > 0) {
      toast.success(parts.join(". ") + ".");
    } else {
      toast.info(
        "Nenhum fechamento novo neste momento. Verifique datas de retirada/devolução e o tipo de cobrança.",
      );
    }
  };

  const handleAtualizarFechamentos = async () => {
    if (!id) return;
    try {
      const payload = await processBillingMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ["rental-billings", id] });
      runProcessBillingFeedback(payload);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Não foi possível atualizar os fechamentos.";
      toast.error(message);
    }
  };

  const { data: billingsData, isLoading: billingsLoading } = useQuery({
    queryKey: ["rental-billings", id],
    queryFn: () => billingService.getBillings({ rentalId: id!, limit: 200 }),
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (data: { status: RentalStatus; adjustments?: any }) =>
      rentalService.updateRentalStatus(id!, data),

    onSuccess: (response) => {
      setShowStatusModal(false);
      setServerError(null);
      setModalFinalizarAluguel(false);
      setClosePreview(null);

      if (response.requiresApproval) {
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 5000);
        toast.info(
          "Solicitação enviada. O status só muda após aprovação de um administrador.",
          { autoClose: 8000 },
        );
        queryClient.invalidateQueries({ queryKey: ["rental", id] });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["rental", id] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });

      toast.success(response.message || "Status atualizado.");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Não foi possível alterar o status.";
      setServerError(message);
      toast.error(message);
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
      toast.success("Aluguel finalizado com sucesso.");
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ?? "Não foi possível finalizar o aluguel.";
      setServerError(message);
      toast.error(message);
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
    return formatDateNoTimezoneShift(value) || value;
  };

  const formatBillingPeriodDate = (value?: string) => {
    if (!value) return "-";
    const isoDatePart = String(value).split("T")[0];
    const parts = isoDatePart.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return formatDateNoTimezoneShift(value) || value;
  };

  const getChangeTypeLabel = (changeType: string): string => {
    const labels: Record<string, string> = {
      status_change: "Mudança de Status",
      rental_update: "Atualização do Aluguel",
      discount: "Alteração de Desconto",
      rental_type_change: "Mudança de Tipo",
      date_extended: "Prorrogação de Datas",
      "discount_request": "Solicitação de Desconto",
      "extension_request": "Solicitação de Prorrogação",
      "status_change_request": "Solicitação de Mudança de Status",
    };
    return labels[changeType] || changeType;
  };

  const rentalLineHasUnitTracked = (unitId?: string | null) =>
    Boolean(unitId != null && String(unitId).trim() !== "");

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
      quantity: Number(item.quantity || 1),
      rentalType:
        (item.rentalType as "daily" | "weekly" | "biweekly" | "monthly") ||
        "daily",
    });
    setCloseItemReturnDate(todayDateInputValue());
    setCloseItemReturnedQuantity(Number(item.quantity || 1));
    setCloseItemNewRentalType("");
    setCloseItemBillingRentalType("");
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
      const today = todayDateInputValue();
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
  const fulfillmentMethodLabel =
    rental.fulfillmentMethod === "delivery_service"
      ? "Serviço de entrega"
      : rental.fulfillmentMethod === "store_pickup"
        ? "Retirado na locadora"
        : "Não informado";

  const allReturned = rental.items.every((item) => item.returnActual);

  const billings = (billingsData?.data?.billings || []) as Billing[];
  const getEntityId = (value: any) =>
    typeof value === "string"
      ? value
      : value?._id?.toString?.() || value?.toString?.() || "";
  const getRentalTypeApiValue = (value?: string) =>
    value && value in rentalTypeUiToApi
      ? rentalTypeUiToApi[value as RentalTypeUI]
      : value || "daily";
  const normalizeBillingDateKey = (value?: string | Date | null) => {
    if (!value) return "na";
    const text = value instanceof Date ? value.toISOString() : String(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "na" : date.toISOString().slice(0, 10);
  };
  const buildRentalLineKeyForDisplay = (item: any) =>
    [
      getEntityId(item.itemId),
      item.unitId ? String(item.unitId) : "no-unit",
      getRentalTypeApiValue(item.rentalType),
      normalizeBillingDateKey(item.pickupScheduled),
      normalizeBillingDateKey(item.returnScheduled),
    ].join("|");
  const isSameBillingItemAsRentalItem = (
    billing: Billing,
    billingItem: any,
    rentalItem: any,
  ) => {
    if (billingItem.rentalLineKey) {
      return billingItem.rentalLineKey === buildRentalLineKeyForDisplay(rentalItem);
    }

    const sameItem = getEntityId(billingItem.itemId) === getEntityId(rentalItem.itemId);
    const sameUnit =
      (billingItem.unitId || "") === (rentalItem.unitId || "");
    const sameType =
      billing.rentalType === getRentalTypeApiValue(rentalItem.rentalType);
    return sameItem && sameUnit && sameType;
  };
  const getDisplayedRentalItemSubtotal = (item: any) => {
    if (!item.returnActual) {
      return Number(item.subtotal || 0);
    }

    const billedTotal = billings
      .filter((billing) => billing.status !== "cancelled")
      .reduce((sum, billing) => {
        const itemTotal = (billing.items || [])
          .filter((billingItem) =>
            isSameBillingItemAsRentalItem(billing, billingItem, item),
          )
          .reduce(
            (billingItemSum, billingItem) =>
              billingItemSum + Number(billingItem.subtotal || 0),
            0,
          );
        return sum + itemTotal;
      }, 0);

    return billedTotal > 0 ? billedTotal : Number(item.subtotal || 0);
  };
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
    .reduce((sum, billing) => sum + getBillingOutstandingAmount(billing), 0);
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Data de retirada
                    </label>
                    <input
                      type="date"
                      value={editForm.pickupDate}
                      onChange={(e) => {
                        const pickupDate = e.target.value;
                        setEditForm({
                          ...editForm,
                          pickupDate,
                          items: editForm.items.map((item) => ({
                            ...item,
                            pickupDate,
                            returnDate: computeReturnFromPickupAndType(
                              pickupDate,
                              item.rentalType,
                            ),
                            recalculateOnSave: true,
                          })),
                        });
                      }}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Horário de retirada/entrega
                    </label>
                    <input
                      type="time"
                      value={editForm.pickupTime}
                      onChange={(e) => {
                        const pickupTime = e.target.value;
                        setEditForm({
                          ...editForm,
                          pickupTime,
                          items: editForm.items.map((item) => ({
                            ...item,
                            pickupTime,
                          })),
                        });
                      }}
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-2">
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
                                    returnDate: computeReturnFromPickupAndType(
                                      updated[index].pickupDate,
                                      e.target.value as RentalTypeUI,
                                    ),
                                    recalculateOnSave: true,
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
                                    returnDate: computeReturnFromPickupAndType(
                                      e.target.value,
                                      updated[index].rentalType,
                                    ),
                                    recalculateOnSave: true,
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
                                Horário
                              </label>
                              <input
                                type="time"
                                value={item.pickupTime}
                                onChange={(e) => {
                                  const updated = [...editForm.items];
                                  updated[index] = {
                                    ...updated[index],
                                    pickupTime: e.target.value,
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
                                Devolução prevista
                              </label>
                              <div className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-gray-100 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300">
                                {item.returnDate || "Calculada após a retirada"}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 space-y-2">
                            {item.returnDate &&
                              item.returnDate < todayDateInputValue() &&
                              !item.returnActualDate && (
                                <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={item.historicalDelivery === true}
                                    onChange={(e) => {
                                      const updated = [...editForm.items];
                                      updated[index] = {
                                        ...updated[index],
                                        historicalDelivery: e.target.checked
                                          ? true
                                          : undefined,
                                      };
                                      setEditForm({
                                        ...editForm,
                                        items: updated,
                                      });
                                    }}
                                    className="mt-0.5 rounded border-gray-300"
                                  />
                                  <span>
                                    Item já devolvido nesta data (somente
                                    histórico). Se desmarcado, serão gerados
                                    fechamentos até hoje conforme o tipo.
                                  </span>
                                </label>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNewItemForm({
                          itemId: "",
                          unitId: "",
                          quantity: 1,
                          rentalType: "diario",
                          pickupDate: editForm.pickupDate,
                          pickupTime: editForm.pickupTime,
                          returnDate: computeReturnFromPickupAndType(
                            editForm.pickupDate,
                            "diario",
                          ),
                        });
                        setShowAddItemModal(true);
                      }}
                      className="px-3 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-md text-sm font-medium"
                    >
                      + Adicionar item
                    </button>
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
                              street: addr.street || "",
                              number: addr.number,
                              complement: addr.complement,
                              neighborhood: addr.neighborhood,
                              city: addr.city || "",
                              state: addr.state || "",
                              zipCode: addr.zipCode || "",
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
                            {address.workName ||
                              address.addressName ||
                              address.street ||
                              "Endereço"}
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
                        historicalDelivery?: boolean;
                        recalculateScheduledReturn?: boolean;
                      }>;
                    } = {
                      notes: editForm.notes,
                    };

                    if (editForm.pickupDate) {
                      payload.dates = {
                        pickupScheduled: toLocalDateTimeIso(
                          editForm.pickupDate,
                          editForm.pickupTime,
                        ),
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
                      const todayStr = todayDateInputValue();
                      payload.items = editForm.items.map((item) => {
                        const row: {
                          itemId: string;
                          unitId?: string;
                          quantity: number;
                          rentalType:
                            | "daily"
                            | "weekly"
                            | "biweekly"
                            | "monthly";
                          pickupScheduled?: string;
                          returnScheduled?: string;
                          historicalDelivery?: boolean;
                          recalculateScheduledReturn?: boolean;
                        } = {
                          itemId: item.itemId,
                          unitId: item.unitId || undefined,
                          quantity: item.quantity,
                          rentalType: rentalTypeUiToApi[item.rentalType] as
                            | "daily"
                            | "weekly"
                            | "biweekly"
                            | "monthly",
                          pickupScheduled: item.pickupDate
                            ? toLocalDateTimeIso(item.pickupDate, item.pickupTime)
                            : undefined,
                          returnScheduled: item.returnDate
                            ? toLocalDateTimeIso(item.returnDate, item.pickupTime)
                            : undefined,
                        };
                        if (item.recalculateOnSave && item.pickupDate) {
                          row.recalculateScheduledReturn = true;
                        }
                        if (
                          item.returnDate &&
                          item.returnDate < todayStr &&
                          !item.returnActualDate &&
                          item.historicalDelivery === true
                        ) {
                          row.historicalDelivery = true;
                        }
                        return row;
                      });
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
        {showAddItemModal &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-2xl">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Adicionar item ao aluguel
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 space-y-3">
                  <input
                    type="text"
                    placeholder="Buscar item por nome, descrição ou SKU..."
                    value={addItemSearch}
                    onChange={(e) => setAddItemSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
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
                    {filteredInventoryItems.map((item: any) => (
                      <option key={item._id} value={item._id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
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
                          returnDate: computeReturnFromPickupAndType(
                            newItemForm.pickupDate,
                            e.target.value as RentalTypeUI,
                          ),
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
                          returnDate: computeReturnFromPickupAndType(
                            e.target.value,
                            newItemForm.rentalType,
                          ),
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                    <input
                      type="time"
                      value={newItemForm.pickupTime}
                      onChange={(e) =>
                        setNewItemForm({
                          ...newItemForm,
                          pickupTime: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-gray-100 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300">
                      Devolução prevista:{" "}
                      {newItemForm.returnDate || "calculada após a retirada"}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddItemModal(false)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newItemForm.itemId) {
                          toast.error("Selecione um item.");
                          return;
                        }
                        if (selectedInventoryItem?.trackingType === "unit" && !newItemForm.unitId) {
                          toast.error("Selecione a unidade.");
                          return;
                        }
                        if (!newItemForm.pickupDate) {
                          toast.error("Informe a retirada do item.");
                          return;
                        }
                        if (!newItemForm.pickupTime) {
                          toast.error("Informe o horário de retirada/entrega do item.");
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
                              pickupTime: newItemForm.pickupTime,
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
                          pickupTime: "",
                          returnDate: "",
                        });
                        setShowAddItemModal(false);
                      }}
                      className="px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-md text-sm font-medium"
                    >
                      + Adicionar item
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )}
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
                {pendingApprovals.length > 0 && !isAdminUser && (
                  <div
                    className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
                    role="status"
                  >
                    Existe solicitação de alteração pendente de aprovação. O
                    status exibido só muda depois que um administrador aprovar.
                  </div>
                )}
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
                    const defaultPickupTime = toTimeInput(rental.dates.pickupScheduled);
                    setEditForm({
                      notes: rental.notes || "",
                      pickupDate: toDateInput(rental.dates.pickupScheduled),
                      pickupTime: defaultPickupTime,
                      returnDate: rental.dates.returnScheduled
                        ? toDateInput(rental.dates.returnScheduled)
                        : "",
                      items: rental.items.map((item: any) => {
                        const ra = item.returnActual
                          ? toDateInput(item.returnActual)
                          : "";
                        const rs = item.returnScheduled
                          ? toDateInput(item.returnScheduled)
                          : "";
                        return {
                          itemId:
                            typeof item.itemId === "string"
                              ? item.itemId
                              : item.itemId._id,
                          unitId: item.unitId,
                          quantity: item.quantity,
                          rentalType:
                            rentalTypeApiToUi[item.rentalType] || "diario",
                          pickupDate: item.pickupScheduled
                            ? toDateInput(item.pickupScheduled)
                            : "",
                          pickupTime: toTimeInput(item.pickupScheduled) || defaultPickupTime,
                          returnDate: item.returnScheduled
                            ? toDateInput(item.returnScheduled)
                            : "",
                          returnActualDate: ra || undefined,
                          historicalDelivery: !!(ra && rs && ra === rs),
                          recalculateOnSave: false,
                        };
                      }),
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
                {/* TODO: Reativar modal de alteração de status quando voltar fluxo de ativação manual */}
                {/* <button
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
                */}

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
                        {formatDocumentForDisplay(customer.cpfCnpj)}
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
                          {formatPhoneForDisplay(customer.phone)}
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
                      {formatDateTimeForDisplay(rental.dates.reservedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Retirada
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatPickupDateForDisplay(rental.dates.pickupScheduled)}
                      {formatTimeForDisplay(rental.dates.pickupScheduled)
                        ? ` às ${formatTimeForDisplay(rental.dates.pickupScheduled)}`
                        : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Entrega dos itens
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {fulfillmentMethodLabel}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Fechamento
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDateNoTimezoneShift(rental.dates.returnScheduled)}
                    </div>
                  </div>
                  {rental.dates.returnActual && (
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Devolução real
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDateNoTimezoneShift(rental.dates.returnActual)}
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
                  const displayedSubtotal =
                    getDisplayedRentalItemSubtotal(item);
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
                            Tipo: {formatRentalTypeLabel(item.rentalType)} • Retirada:{" "}
                            {item.pickupScheduled
                              ? formatPickupDateForDisplay(item.pickupScheduled)
                              : "-"}{" "}
                            {formatTimeForDisplay(item.pickupScheduled)
                              ? `às ${formatTimeForDisplay(item.pickupScheduled)} `
                              : ""}
                            • Devolução:{" "}
                            {item.returnScheduled
                              ? formatDateNoTimezoneShift(item.returnScheduled)
                              : "-"}
                          </div>
                          {!item.returnActual && (
                            <button
                              type="button"
                              onClick={() => handleAbrirFinalizacaoItem(item)}
                              className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                            >
                              Finalizar devolução deste item
                            </button>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-gray-900 dark:text-white">
                            R$ {displayedSubtotal.toFixed(2)}
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
                      Endereço de devolução
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
                    <div className="ml-auto flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={processBillingMutation.isPending}
                        onClick={() => void handleAtualizarFechamentos()}
                        className="text-xs px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {processBillingMutation.isPending
                          ? "Atualizando…"
                          : "Atualizar fechamentos"}
                      </button>
                      {features.financialUnifiedModule && (
                        <button
                          type="button"
                          onClick={() => navigate("/finance")}
                          className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Gerenciar no financeiro
                        </button>
                      )}
                    </div>
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
                              {formatBillingPeriodDate(billing.periodStart)} →{" "}
                              {formatBillingPeriodDate(billing.periodEnd)}
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
                            {formatDateTimeForDisplay(approval.requestDate)}
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
                          {formatDateTimeForDisplay(history.date)}
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {getChangeTypeLabel(history.changeType)}
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
        {/* TODO: Reativar modal de alteração de status quando voltar fluxo de ativação manual */}
        {/* {showStatusModal && (
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
        )} */}

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
                      Devolução prevista
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
                    <button
                      type="button"
                      onClick={() => setShowAddItemModal(true)}
                      className="px-3 py-2 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-md text-sm font-medium"
                    >
                      + Adicionar item
                    </button>
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
                              street: addr.street || "",
                              number: addr.number,
                              complement: addr.complement,
                              neighborhood: addr.neighborhood,
                              city: addr.city || "",
                              state: addr.state || "",
                              zipCode: addr.zipCode || "",
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
                            {address.workName ||
                              address.addressName ||
                              address.street ||
                              "Endereço"}
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
                        historicalDelivery?: boolean;
                        recalculateScheduledReturn?: boolean;
                      }>;
                    } = {
                      notes: editForm.notes,
                    };

                    if (editForm.pickupDate) {
                      payload.dates = {
                        pickupScheduled: editForm.pickupDate || undefined,
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
                      const todayStr = todayDateInputValue();
                      payload.items = editForm.items.map((item) => {
                        const row: {
                          itemId: string;
                          unitId?: string;
                          quantity: number;
                          rentalType:
                            | "daily"
                            | "weekly"
                            | "biweekly"
                            | "monthly";
                          pickupScheduled?: string;
                          returnScheduled?: string;
                          historicalDelivery?: boolean;
                          recalculateScheduledReturn?: boolean;
                        } = {
                          itemId: item.itemId,
                          unitId: item.unitId || undefined,
                          quantity: item.quantity,
                          rentalType: rentalTypeUiToApi[item.rentalType] as
                            | "daily"
                            | "weekly"
                            | "biweekly"
                            | "monthly",
                          pickupScheduled: item.pickupDate || undefined,
                          returnScheduled: item.returnDate || undefined,
                        };
                        if (item.recalculateOnSave && item.pickupDate) {
                          row.recalculateScheduledReturn = true;
                        }
                        if (
                          item.returnDate &&
                          item.returnDate < todayStr &&
                          !item.returnActualDate &&
                          item.historicalDelivery === true
                        ) {
                          row.historicalDelivery = true;
                        }
                        return row;
                      });
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
                        Data real da devolução
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
                  Finalizar devolução do item
                </h2>
              </div>

              <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                {selectedCloseItem.name}
                {rentalLineHasUnitTracked(selectedCloseItem.unitId) && (
                  <span className="block mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Equipamento por unidade identificada — devolução sempre integral nesta linha.
                  </span>
                )}
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
                  <div className="border-t border-gray-300 dark:border-gray-600 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400 font-semibold">
                        Total do aluguel:
                      </span>
                      <span className="font-bold text-gray-900 dark:text-white text-base">
                        R$ {closeItemPreview.rentalTotalAfterClose.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Data real da devolução
              </label>
              <input
                type="date"
                value={closeItemReturnDate}
                onChange={(e) => setCloseItemReturnDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
              />
              {selectedCloseItem &&
                !rentalLineHasUnitTracked(selectedCloseItem.unitId) &&
                selectedCloseItem.quantity > 1 && (
                <>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Quantidade a devolver
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={selectedCloseItem.quantity}
                    value={closeItemReturnedQuantity}
                    onChange={(e) =>
                      setCloseItemReturnedQuantity(
                        Math.max(
                          1,
                          Math.min(
                            selectedCloseItem.quantity,
                            Number(e.target.value || 1),
                          ),
                        ),
                      )
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
                  />
                </>
              )}
              {selectedCloseItem &&
                !rentalLineHasUnitTracked(selectedCloseItem.unitId) && (
                <>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de cobrança desta devolução (opcional)
                  </label>
                  <select
                    value={closeItemBillingRentalType}
                    onChange={(e) =>
                      setCloseItemBillingRentalType(
                        e.target.value as
                          | "daily"
                          | "weekly"
                          | "biweekly"
                          | "monthly"
                          | "",
                      )
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
                  >
                    <option value="">Igual ao contrato atual</option>
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quinzenal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </>
              )}
              {selectedCloseItem &&
                !rentalLineHasUnitTracked(selectedCloseItem.unitId) && (
                <>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tipo para quantidade que permanece no aluguel (opcional)
                  </label>
                  <select
                    value={closeItemNewRentalType}
                    onChange={(e) =>
                      setCloseItemNewRentalType(
                        e.target.value as
                          | "daily"
                          | "weekly"
                          | "biweekly"
                          | "monthly"
                          | "",
                      )
                    }
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
                  >
                    <option value="">Manter tipo atual</option>
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="biweekly">Quinzenal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </>
              )}

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
                      const returnDateIso = closeItemReturnDate || undefined;
                      const partialFlowAllowed =
                        !rentalLineHasUnitTracked(selectedCloseItem.unitId);
                      const useReturnsEndpoint =
                        selectedCloseItem.quantity > 1 && partialFlowAllowed;

                      if (useReturnsEndpoint) {
                        await rentalService.returnRentalItems(id, {
                          returnDate: returnDateIso,
                          items: [
                            {
                              itemId: selectedCloseItem.itemId,
                              unitId: selectedCloseItem.unitId,
                              returnedQuantity: closeItemReturnedQuantity,
                              ...(closeItemBillingRentalType
                                ? {
                                    billingRentalType:
                                      closeItemBillingRentalType,
                                  }
                                : {}),
                            },
                          ],
                        });
                      } else {
                        await rentalService.closeRentalItem(
                          id,
                          selectedCloseItem.itemId,
                          {
                            returnDate: returnDateIso,
                            unitId: selectedCloseItem.unitId,
                          },
                        );
                      }

                      if (
                        partialFlowAllowed &&
                        closeItemNewRentalType
                      ) {
                        await rentalService.changeRentalTypeForItem(
                          id,
                          selectedCloseItem.itemId,
                          {
                            unitId: selectedCloseItem.unitId,
                            newRentalType: closeItemNewRentalType,
                            effectiveDate: returnDateIso,
                            notes: "Alteração de tipo após devolução",
                          },
                        );
                      }
                      setCloseItemModal(false);
                      queryClient.invalidateQueries({
                        queryKey: ["rental", id],
                      });
                      queryClient.invalidateQueries({ queryKey: ["rentals"] });
                      queryClient.invalidateQueries({
                        queryKey: ["rental-billings", id],
                      });
                      toast.success("Devolução processada com sucesso.");
                    } catch (err: unknown) {
                      const message =
                        (err as { response?: { data?: { message?: string } } })
                          ?.response?.data?.message ??
                        "Erro ao processar devolução do item.";
                      toast.error(message);
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
        {showAddItemModal &&
          createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-2xl">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Adicionar item ao aluguel
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-3">
                <input
                  type="text"
                  placeholder="Buscar item por nome, descrição ou SKU..."
                  value={addItemSearch}
                  onChange={(e) => setAddItemSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
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
                  {filteredInventoryItems.map((item: any) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
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
                        returnDate: computeReturnFromPickupAndType(
                          newItemForm.pickupDate,
                          e.target.value as RentalTypeUI,
                        ),
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
                        returnDate: computeReturnFromPickupAndType(
                          e.target.value,
                          newItemForm.rentalType,
                        ),
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <div className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-md text-sm bg-gray-100 dark:bg-gray-900/60 text-gray-700 dark:text-gray-300">
                    Devolução prevista:{" "}
                    {newItemForm.returnDate || "calculada após a retirada"}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newItemForm.itemId) {
                        toast.error("Selecione um item.");
                        return;
                      }
                      if (selectedInventoryItem?.trackingType === "unit" && !newItemForm.unitId) {
                        toast.error("Selecione a unidade.");
                        return;
                      }
                      if (!newItemForm.pickupDate) {
                        toast.error("Informe a retirada do item.");
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
                            pickupTime: newItemForm.pickupTime,
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
                        pickupTime: "",
                        returnDate: "",
                      });
                      setShowAddItemModal(false);
                    }}
                    className="px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-md text-sm font-medium"
                  >
                    + Adicionar item
                  </button>
                </div>
              </div>
            </div>
            </div>,
            document.body,
          )}
      </div>
    </Layout>
  );
};

export default RentalDetailPage;
