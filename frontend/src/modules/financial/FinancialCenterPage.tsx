import React, { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { features } from "../../config/features";
import { financialService } from "./financial.service";
import { chargeService } from "../charges/charge.service";
import { invoiceService } from "../invoices/invoice.service";
import { billingService } from "../billings/billing.service";
import {
  billingMatchesBoardFilters,
  groupBillingsByFinancialStage,
  FinancialBoardUrlFilters,
} from "./financialBoardFilters";
import { RentalDeliveryQuickModal } from "./RentalDeliveryQuickModal";
import { rentalTypeLabel } from "../../utils/statusLabels";
import {
  formatDateNoTimezoneShift,
  getBillingOutstandingAmount,
  toDateInputValue,
} from "../../utils/formatters";
import SortableTh from "../../components/SortableTh";
import {
  ColumnSort,
  sortedTableRows,
  toggleColumnSort,
} from "../../utils/tableSort";

const stageLabel: Record<string, string> = {
  pending: "Pendentes",
  charge: "Cobrança",
  invoiced: "Faturado",
  paid: "Pago",
  cancelled: "Cancelado",
};

const chargeStatusLabel: Record<string, string> = {
  pending: "Pendente",
  partial: "Parcial",
  paid: "Pago",
  cancelled: "Cancelado",
};

const invoiceStatusLabel: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  paid: "Paga",
  cancelled: "Cancelada",
};

const getBillingOutstanding = getBillingOutstandingAmount;

const isBillingEligibleForCharge = (billing: any): boolean =>
  billing?.financialStage === "pending" &&
  billing?.status !== "paid" &&
  billing?.status !== "cancelled" &&
  !billing?.chargeId &&
  !billing?.invoiceId &&
  getBillingOutstanding(billing) > 0.01;

const isBillingEligibleForInvoice = (billing: any): boolean =>
  billing?.status !== "paid" &&
  billing?.status !== "cancelled" &&
  !billing?.invoiceId &&
  getBillingOutstanding(billing) > 0.01;

type FinBillSortKey =
  | "customer"
  | "period"
  | "type"
  | "items"
  | "work"
  | "stage"
  | "outstanding";

const FinancialCenterPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);
  const [selectedChargeId, setSelectedChargeId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"billings" | "charges" | "invoices">("billings");
  const [billingsSubView, setBillingsSubView] = useState<"lista" | "quadro">("lista");
  const [finBillSort, setFinBillSort] = useState<ColumnSort<FinBillSortKey> | null>({
    key: "period",
    dir: "desc",
  });
  const [deliveryModalRentalId, setDeliveryModalRentalId] = useState<string | null>(null);
  const [paymentValue, setPaymentValue] = useState<string>("");
  const [paymentDiscountValue, setPaymentDiscountValue] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("manual");
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>("");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<string>("boleto/PIX");
  const [chargeModal, setChargeModal] = useState<any | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<any | null>(null);
  const [chargeModalNotes, setChargeModalNotes] = useState<string>("");
  const [chargeModalDueDate, setChargeModalDueDate] = useState<string>("");
  const [chargeModalTotal, setChargeModalTotal] = useState<string>("");
  const [chargeModalBillingIds, setChargeModalBillingIds] = useState<string[]>([]);
  const [invoiceModalNotes, setInvoiceModalNotes] = useState<string>("");
  const [refreshPreviewModal, setRefreshPreviewModal] = useState<{
    billingId: string;
    billingNumber: string;
    customerName: string;
    current: { total: number; outstandingAmount: number };
    next: { total: number; outstandingAmount: number };
    diff: { total: number; outstandingAmount: number };
  } | null>(null);
  const customerFilter = searchParams.get("customer") || "";
  const itemFilter = searchParams.get("item") || "";
  const obraFilter = searchParams.get("obra") || "";
  const periodStartFilter = searchParams.get("start") || "";
  const periodEndFilter = searchParams.get("end") || "";

  const filterParams: FinancialBoardUrlFilters = useMemo(
    () => ({
      customerId: customerFilter,
      itemText: itemFilter,
      obraText: obraFilter,
      periodStart: periodStartFilter,
      periodEnd: periodEndFilter,
    }),
    [customerFilter, itemFilter, obraFilter, periodStartFilter, periodEndFilter],
  );

  const updateFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) {
      next.set(key, value.trim());
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };
  const boardQuery = useQuery({
    queryKey: ["financial-board"],
    queryFn: () => financialService.getBoard(),
    enabled: features.financialUnifiedModule,
  });
  const boardData = boardQuery.data?.data;

  const dashboardQuery = useQuery({
    queryKey: ["financial-dashboard-unified"],
    queryFn: () => financialService.getDashboard(),
    enabled: features.financialUnifiedModule,
  });

  const billings = useMemo(() => boardData?.billings || [], [boardData]);
  const charges = useMemo(() => boardData?.charges || [], [boardData]);
  const invoices = useMemo(() => boardData?.invoices || [], [boardData]);
  const selectedBillings = billings.filter((bill: any) => selectedBillingIds.includes(bill._id));
  const selectedEligibleBillingIds = selectedBillings
    .filter(isBillingEligibleForCharge)
    .map((bill: any) => bill._id);
  const selectedCustomerIds = Array.from(
    new Set(selectedBillings.map((bill: any) => String(bill.customerId?._id || bill.customerId))),
  );
  const hasMixedCustomers = selectedCustomerIds.length > 1;

  const createChargeMutation = useMutation({
    mutationFn: () =>
      chargeService.create({
        billingIds: selectedEligibleBillingIds,
      }),
    onSuccess: () => {
      setSelectedBillingIds([]);
      toast.success("Cobrança criada com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || "Não foi possível criar a cobrança.";
      toast.error(message);
    },
  });

  const payChargeMutation = useMutation({
    mutationFn: async ({
      chargeId,
      amount,
      discount,
      method,
    }: {
      chargeId: string;
      amount: number;
      discount?: number;
      method?: string;
    }) => {
      return chargeService.pay(chargeId, {
        amount,
        discount,
        paymentMethod: method || "manual",
      });
    },
    onSuccess: () => {
      setPaymentValue("");
      setPaymentDiscountValue("");
      toast.success("Baixa registrada com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
      queryClient.invalidateQueries({ queryKey: ["financial-dashboard-unified"] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || "Não foi possível registrar a baixa.";
      toast.error(message);
    },
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async ({ chargeId, billingIds }: { chargeId: string; billingIds: string[] }) => {
      return invoiceService.createInvoiceFromBillings({
        billingIds,
        dueDate: invoiceDueDate || undefined,
        paymentMethod: invoicePaymentMethod || undefined,
      });
    },
    onSuccess: (response) => {
      toast.success(`Fatura ${response.data.invoiceNumber} gerada com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
      queryClient.invalidateQueries({ queryKey: ["financial-dashboard-unified"] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || "Não foi possível gerar a fatura.";
      toast.error(message);
    },
  });

  const printChargeMutation = useMutation({
    mutationFn: (chargeId: string) => chargeService.pdf(chargeId),
    onSuccess: (blob: Blob, chargeId) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `demonstrativo-${chargeId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso.");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || "Não foi possível gerar o PDF da cobrança.";
      toast.error(message);
    },
  });

  const printBillingMutation = useMutation({
    mutationFn: (billingId: string) => billingService.generateBillingPDF(billingId),
    onSuccess: (blob: Blob, billingId) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fechamento-${billingId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("PDF do fechamento gerado.");
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao imprimir fechamento."),
  });

  const editBillingMutation = useMutation({
    mutationFn: ({ billingId, notes }: { billingId: string; notes: string }) =>
      billingService.updateBilling(billingId, { notes }),
    onSuccess: () => {
      toast.success("Fechamento atualizado.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao editar fechamento."),
  });

  const cancelBillingMutation = useMutation({
    mutationFn: (billingId: string) => billingService.cancelBilling(billingId),
    onSuccess: () => {
      toast.success("Fechamento cancelado.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao cancelar fechamento."),
  });

  const refreshBillingMutation = useMutation({
    mutationFn: (billingId: string) => billingService.refreshBilling(billingId),
    onSuccess: () => {
      toast.success("Fechamento atualizado com os dados atuais do aluguel.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
      queryClient.invalidateQueries({ queryKey: ["financial-dashboard-unified"] });
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message || "Falha ao atualizar fechamento."),
  });

  const handlePreviewAndRefreshBilling = async (billingId: string) => {
    try {
      const preview = await billingService.previewRefreshBilling(billingId);
      setRefreshPreviewModal(preview.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Não foi possível carregar o preview do fechamento.");
    }
  };

  const editChargeMutation = useMutation({
    mutationFn: ({
      chargeId,
      notes,
      dueDate,
      total,
      billingIds,
    }: {
      chargeId: string;
      notes?: string;
      dueDate?: string;
      total?: number;
      billingIds?: string[];
    }) => chargeService.update(chargeId, { notes, dueDate, total, billingIds }),
    onSuccess: () => {
      toast.success("Cobrança atualizada.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao editar cobrança."),
  });

  const cancelChargeMutation = useMutation({
    mutationFn: (chargeId: string) => chargeService.cancel(chargeId),
    onSuccess: () => {
      toast.success("Cobrança cancelada.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao cancelar cobrança."),
  });

  const printInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => invoiceService.generateInvoicePDF(invoiceId),
    onSuccess: (blob: Blob, invoiceId) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fatura-${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("PDF da fatura gerado.");
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao imprimir fatura."),
  });

  const editInvoiceMutation = useMutation({
    mutationFn: ({ invoiceId, notes }: { invoiceId: string; notes: string }) =>
      invoiceService.updateInvoice(invoiceId, { notes }),
    onSuccess: () => {
      toast.success("Fatura atualizada.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao editar fatura."),
  });

  const cancelInvoiceMutation = useMutation({
    mutationFn: (invoiceId: string) => invoiceService.updateInvoiceStatus(invoiceId, "cancelled"),
    onSuccess: () => {
      toast.success("Fatura cancelada.");
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || "Falha ao cancelar fatura."),
  });

  const columns = useMemo(() => {
    const filteredBillings = billings.filter((b: any) => billingMatchesBoardFilters(b, filterParams));
    return groupBillingsByFinancialStage(filteredBillings);
  }, [billings, filterParams]);

  const handleFinBillSort = (key: FinBillSortKey) =>
    setFinBillSort((prev) => toggleColumnSort(prev, key));

  const billingsFilteredForTable = useMemo(
    () =>
      billings.filter((b: any) => billingMatchesBoardFilters(b, filterParams)),
    [billings, filterParams],
  );

  const tableBillings = useMemo(() => {
    return sortedTableRows(billingsFilteredForTable, finBillSort, {
      customer: (b: any) => String(b.customerId?.name || "").toLowerCase(),
      period: (b: any) => (b.periodStart ? new Date(b.periodStart).getTime() : 0),
      type: (b: any) =>
        String(
          rentalTypeLabel[String(b.rentalType || "")] || b.rentalType || "",
        ).toLowerCase(),
      items: (b: any) =>
        (b.items || [])
          .map((item: any) => item?.itemId?.name || "")
          .filter(Boolean)
          .join(", ")
          .toLowerCase(),
      work: (b: any) =>
        String(b.rentalId?.workAddress?.workName || "").toLowerCase(),
      stage: (b: any) =>
        String(
          stageLabel[String(b.financialStage)] || b.financialStage || "",
        ).toLowerCase(),
      outstanding: (b: any) => getBillingOutstanding(b),
    });
  }, [billingsFilteredForTable, finBillSort]);

  const billingMatchesGlobalFilter = useCallback(
    (billing: any) => billingMatchesBoardFilters(billing, filterParams),
    [filterParams],
  );

  const filteredCharges = useMemo(() => {
    return charges.filter((charge: any) => {
      const chargeCustomerId = String(charge.customerId?._id || charge.customerId || "");
      const customerMatches = !customerFilter || chargeCustomerId === customerFilter;
      if (!customerMatches) return false;
      const relatedBillings = (charge.billingIds || []).filter((b: any) => !!b);
      if (!relatedBillings.length) return !itemFilter && !obraFilter && !periodStartFilter && !periodEndFilter;
      return relatedBillings.some((billing: any) => billingMatchesGlobalFilter(billing));
    });
  }, [charges, customerFilter, itemFilter, obraFilter, periodStartFilter, periodEndFilter, billingMatchesGlobalFilter]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice: any) => {
      const invoiceCustomerId = String(invoice.customerId?._id || invoice.customerId || "");
      const customerMatches = !customerFilter || invoiceCustomerId === customerFilter;
      if (!customerMatches) return false;
      const relatedBillings = (invoice.billingIds || []).filter((b: any) => !!b);
      if (!relatedBillings.length) return !itemFilter && !obraFilter && !periodStartFilter && !periodEndFilter;
      return relatedBillings.some((billing: any) => billingMatchesGlobalFilter(billing));
    });
  }, [invoices, customerFilter, itemFilter, obraFilter, periodStartFilter, periodEndFilter, billingMatchesGlobalFilter]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const billing of billings) {
      const id = String(billing.customerId?._id || billing.customerId || "");
      const name = String(billing.customerId?.name || "Cliente");
      if (id && !map.has(id)) map.set(id, name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [billings]);

  const availableBillingsForChargeModal = useMemo(() => {
    if (!chargeModal) return [];
    const customerId = String(chargeModal.customerId?._id || chargeModal.customerId || "");
    const currentIds = new Set((chargeModal.billingIds || []).map((b: any) => String(b?._id || b)));
    return billings.filter((bill: any) => {
      const billCustomerId = String(bill.customerId?._id || bill.customerId || "");
      if (billCustomerId !== customerId) return false;
      const billId = String(bill._id);
      if (currentIds.has(billId)) return true;
      return isBillingEligibleForCharge(bill);
    });
  }, [chargeModal, billings]);

  const handleCreateCharge = () => {
    if (selectedBillingIds.length < 1) {
      toast.info("Selecione ao menos um fechamento.");
      return;
    }
    if (selectedEligibleBillingIds.length !== selectedBillingIds.length) {
      toast.warning("Selecione apenas fechamentos pendentes, em aberto e sem cobrança/fatura.");
      setSelectedBillingIds(selectedEligibleBillingIds);
      return;
    }
    if (hasMixedCustomers) {
      toast.warning("Não é permitido agrupar fechamentos de clientes diferentes na mesma cobrança.");
      return;
    }
    createChargeMutation.mutate();
  };

  const handlePayCharge = () => {
    if (!selectedChargeId) {
      toast.info("Selecione uma cobrança para dar baixa.");
      return;
    }
    const selectedCharge = charges.find((charge: any) => charge._id === selectedChargeId);
    const outstanding = Number(selectedCharge?.outstandingAmount || 0);
    const amount = Number(paymentValue || 0);
    const discount = Number(paymentDiscountValue || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.warning("Informe um valor de baixa válido.");
      return;
    }
    if (!Number.isFinite(discount) || discount < 0) {
      toast.warning("Informe um desconto válido.");
      return;
    }
    if (amount + discount <= 0) {
      toast.warning("Informe baixa ou desconto maior que zero.");
      return;
    }
    if (amount + discount - outstanding > 0.01) {
      toast.warning("Baixa + desconto não pode exceder o saldo da cobrança.");
      return;
    }
    payChargeMutation.mutate({
      chargeId: selectedChargeId,
      amount,
      discount: Number.isFinite(discount) && discount > 0 ? discount : 0,
      method: paymentMethod,
    });
  };

  const handleSettleCharge = (charge: any) => {
    const remaining = Number(charge.outstandingAmount || 0);
    if (remaining <= 0) {
      toast.info("Essa cobrança já está quitada.");
      return;
    }
    payChargeMutation.mutate({
      chargeId: charge._id,
      amount: remaining,
      discount: 0,
      method: paymentMethod,
    });
  };

  const handleGenerateInvoiceFromCharge = (charge: any) => {
    const relatedBillings = (charge.billingIds || []).filter((billing: any) => !!billing);
    const billingIds = relatedBillings
      .filter((billing: any) =>
        typeof billing === "string" ? true : isBillingEligibleForInvoice(billing),
      )
      .map((billing: any) => String(billing?._id || billing));
    if (!billingIds.length) {
      toast.warning("Cobrança sem fechamentos elegíveis para gerar fatura.");
      return;
    }
    if (billingIds.length !== relatedBillings.length) {
      toast.warning("A cobrança possui fechamentos já pagos, cancelados ou faturados.");
      return;
    }
    generateInvoiceMutation.mutate({ chargeId: charge._id, billingIds });
  };

  const openChargeModal = (charge: any) => {
    setChargeModal(charge);
    setChargeModalNotes(String(charge.notes || ""));
    setChargeModalDueDate(toDateInputValue(charge.dueDate));
    setChargeModalTotal(String(Number(charge.total || 0)));
    setChargeModalBillingIds((charge.billingIds || []).map((b: any) => String(b?._id || b)));
  };

  const openInvoiceModal = (invoice: any) => {
    setInvoiceModal(invoice);
    setInvoiceModalNotes(String(invoice.notes || ""));
  };

  const handleSaveChargeFromModal = () => {
    if (!chargeModal) return;
    if (chargeModalBillingIds.length === 0) {
      toast.warning("Selecione ao menos um fechamento para a cobrança.");
      return;
    }
    editChargeMutation.mutate(
      {
        chargeId: chargeModal._id,
        notes: chargeModalNotes,
        dueDate: chargeModalDueDate || undefined,
        total: Number(chargeModalTotal),
        billingIds: chargeModalBillingIds,
      } as any,
      {
        onSuccess: () => {
          setChargeModal(null);
        },
      },
    );
  };

  const handleSaveInvoiceFromModal = () => {
    if (!invoiceModal) return;
    editInvoiceMutation.mutate(
      { invoiceId: invoiceModal._id, notes: invoiceModalNotes },
      {
        onSuccess: () => setInvoiceModal(null),
      },
    );
  };

  if (!features.financialUnifiedModule) {
    return (
      <Layout title="Financeiro" backTo="/dashboard">
        <p className="text-sm text-gray-600">Módulo financeiro unificado está desabilitado por feature flag.</p>
      </Layout>
    );
  }

  return (
    <Layout title="Financeiro" backTo="/dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border rounded-md p-4">
            <p className="text-xs text-gray-500">Pendente</p>
            <p className="text-xl font-semibold">
              R$ {(dashboardQuery.data?.data?.totals?.pending || 0).toFixed(2)}
            </p>
          </div>
          <div className="border rounded-md p-4">
            <p className="text-xs text-gray-500">Pago</p>
            <p className="text-xl font-semibold">
              R$ {(dashboardQuery.data?.data?.totals?.paid || 0).toFixed(2)}
            </p>
          </div>
          <div className="border rounded-md p-4">
            <p className="text-xs text-gray-500">Ações rápidas</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Link
                to="/rentals?status=active"
                className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm"
              >
                Devoluções pendentes
              </Link>
              <button
                onClick={handleCreateCharge}
                disabled={selectedEligibleBillingIds.length === 0 || createChargeMutation.isPending}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm disabled:opacity-50"
              >
                Criar cobrança
              </button>
              <select
                value={selectedChargeId}
                onChange={(e) => setSelectedChargeId(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm w-44"
              >
                <option value="">Selecionar cobrança</option>
                {filteredCharges.map((charge: any) => (
                  <option key={charge._id} value={charge._id}>
                    {charge.chargeNumber} ({charge.customerId?.name || "Cliente"})
                  </option>
                ))}
              </select>
              <input
                className="border rounded-md px-2 py-1 text-sm w-28"
                placeholder="Valor baixa"
                value={paymentValue}
                onChange={(e) => setPaymentValue(e.target.value)}
              />
              <input
                className="border rounded-md px-2 py-1 text-sm w-28"
                placeholder="Desconto"
                value={paymentDiscountValue}
                onChange={(e) => setPaymentDiscountValue(e.target.value)}
              />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm w-36"
              >
                <option value="manual">Manual</option>
                <option value="pix">PIX</option>
                <option value="boleto">Boleto</option>
                <option value="cartao">Cartão</option>
                <option value="transferencia">Transferência</option>
              </select>
              <button
                onClick={handlePayCharge}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm"
              >
                Marcar pagamento
              </button>
            </div>
            {hasMixedCustomers && (
              <p className="text-xs text-amber-600 mt-2">
                Você selecionou fechamentos de clientes diferentes. Selecione apenas do mesmo cliente para criar cobrança.
              </p>
            )}
          </div>
        </div>

        <details className="border rounded-md p-4 bg-white dark:bg-gray-800">
          <summary className="cursor-pointer font-semibold">Filtros do Kanban</summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={customerFilter}
              onChange={(e) => updateFilterParam("customer", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
            >
              <option value="">Todos os clientes</option>
              {customerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>

            <input
              value={itemFilter}
              onChange={(e) => updateFilterParam("item", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
              placeholder="Filtrar por item"
            />

            <input
              value={obraFilter}
              onChange={(e) => updateFilterParam("obra", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
              placeholder="Filtrar por obra"
            />

            <input
              type="date"
              value={periodStartFilter}
              onChange={(e) => updateFilterParam("start", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
            />

            <input
              type="date"
              value={periodEndFilter}
              onChange={(e) => updateFilterParam("end", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
            />
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
            >
              Limpar filtros
            </button>
          </div>
        </details>

        <div className="border rounded-md p-2">
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "billings" ? "bg-indigo-600 text-white" : "border"}`}
              onClick={() => setActiveTab("billings")}
            >
              Fechamentos
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "charges" ? "bg-indigo-600 text-white" : "border"}`}
              onClick={() => setActiveTab("charges")}
            >
              Cobranças
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-sm ${activeTab === "invoices" ? "bg-indigo-600 text-white" : "border"}`}
              onClick={() => setActiveTab("invoices")}
            >
              Faturas
            </button>
            {activeTab === "billings" && (
              <Link
                to={{ pathname: "/finance/dashboard-kanban", search: searchParams.toString() }}
                className="ml-auto text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Abrir quadro somente leitura (dashboard)
              </Link>
            )}
          </div>

          {activeTab === "billings" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-sm ${billingsSubView === "lista" ? "bg-slate-700 text-white" : "border border-gray-300 dark:border-gray-600"}`}
                  onClick={() => setBillingsSubView("lista")}
                >
                  Lista (cobranças)
                </button>
                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-sm ${billingsSubView === "quadro" ? "bg-slate-700 text-white" : "border border-gray-300 dark:border-gray-600"}`}
                  onClick={() => setBillingsSubView("quadro")}
                >
                  Quadro (kanban)
                </button>
              </div>

              {billingsSubView === "lista" && (
                <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                  <table className="min-w-[960px] w-full text-sm text-left">
                    <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                      <tr>
                        <th className="px-2 py-2 w-10 text-center">Sel.</th>
                        <SortableTh<FinBillSortKey>
                          columnKey="customer"
                          label="Cliente"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                        />
                        <SortableTh<FinBillSortKey>
                          columnKey="period"
                          label="Período"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                        />
                        <SortableTh<FinBillSortKey>
                          columnKey="type"
                          label="Tipo"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                        />
                        <SortableTh<FinBillSortKey>
                          columnKey="items"
                          label="Itens"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 min-w-[140px] text-sm font-medium text-gray-700 dark:text-gray-200"
                        />
                        <SortableTh<FinBillSortKey>
                          columnKey="work"
                          label="Obra"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 min-w-[120px] text-sm font-medium text-gray-700 dark:text-gray-200"
                        />
                        <SortableTh<FinBillSortKey>
                          columnKey="stage"
                          label="Etapa"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-200"
                        />
                        <SortableTh<FinBillSortKey>
                          columnKey="outstanding"
                          label="Em aberto"
                          align="right"
                          sort={finBillSort}
                          onSort={handleFinBillSort}
                          thClassName="px-2 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap"
                        />
                        <th className="px-2 py-2 min-w-[200px] text-sm font-medium text-gray-700 dark:text-gray-200">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                      {tableBillings.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-6 text-center text-gray-500">
                            Nenhum fechamento com os filtros atuais.
                          </td>
                        </tr>
                      ) : (
                        tableBillings.map((bill: any) => {
                          const rentalIdStr = String(bill.rentalId?._id || bill.rentalId || "");
                          const itemNames =
                            (bill.items || []).length > 0
                              ? bill.items
                                  .map((item: any) => item?.itemId?.name || "Item")
                                  .filter((name: string, index: number, arr: string[]) => arr.indexOf(name) === index)
                              : [];
                          const tipo =
                            rentalTypeLabel[String(bill.rentalType || "")] || bill.rentalType || "—";
                          const canSelectForCharge = isBillingEligibleForCharge(bill);
                          return (
                            <tr key={bill._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                              <td className="px-2 py-2 text-center">
                                {canSelectForCharge ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedBillingIds.includes(bill._id)}
                                    onChange={(e) => {
                                      setSelectedBillingIds((current) =>
                                        e.target.checked
                                          ? [...current, bill._id]
                                          : current.filter((id) => id !== bill._id),
                                      );
                                    }}
                                    aria-label={`Selecionar fechamento ${bill.billingNumber || bill._id}`}
                                  />
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 font-medium">{bill.customerId?.name || "Cliente"}</td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                {bill.periodStart
                                  ? formatDateNoTimezoneShift(bill.periodStart)
                                  : "—"}{" "}
                                –{" "}
                                {bill.periodEnd
                                  ? formatDateNoTimezoneShift(bill.periodEnd)
                                  : "—"}
                              </td>
                              <td className="px-2 py-2 whitespace-nowrap">{tipo}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300 max-w-[220px]">
                                {itemNames.length > 0 ? (
                                  <div className="max-h-16 overflow-y-auto pr-1 space-y-0.5 text-[11px] leading-tight">
                                    {itemNames.map((name: string) => (
                                      <div key={name} className="truncate" title={name}>
                                        {name}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span>—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 max-w-[160px] truncate" title={bill.rentalId?.workAddress?.workName || ""}>
                                {bill.rentalId?.workAddress?.workName || "—"}
                              </td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                {stageLabel[String(bill.financialStage)] || bill.financialStage || "—"}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap">
                                R$ {getBillingOutstanding(bill).toFixed(2)}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {rentalIdStr ? (
                                    <Link
                                      to={`/rentals/${rentalIdStr}`}
                                      className="px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                                    >
                                      Aluguel
                                    </Link>
                                  ) : null}
                                  {rentalIdStr ? (
                                    <button
                                      type="button"
                                      className="px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                      onClick={() => setDeliveryModalRentalId(rentalIdStr)}
                                    >
                                      Devoluções
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="px-2 py-0.5 border rounded text-xs"
                                    onClick={() => printBillingMutation.mutate(bill._id)}
                                  >
                                    PDF
                                  </button>
                                  <button
                                    type="button"
                                    className="px-2 py-0.5 border rounded text-xs"
                                    onClick={() => {
                                      const notes = window.prompt("Editar observações do fechamento:", bill.notes || "");
                                      if (notes !== null) editBillingMutation.mutate({ billingId: bill._id, notes });
                                    }}
                                  >
                                    Obs.
                                  </button>
                                  <button
                                    type="button"
                                    className="px-2 py-0.5 border rounded text-xs text-red-600"
                                    onClick={() => cancelBillingMutation.mutate(bill._id)}
                                  >
                                    Cancelar
                                  </button>
                                  {bill.status !== "paid" && bill.status !== "cancelled" && (
                                    <button
                                      type="button"
                                      className="px-2 py-0.5 border rounded text-xs"
                                      onClick={() => void handlePreviewAndRefreshBilling(bill._id)}
                                    >
                                      Atualizar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {billingsSubView === "quadro" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                  {Object.entries(columns).map(([stage, items]) => (
                    <div key={stage} className="border rounded-md p-3 bg-gray-50 dark:bg-gray-900/40">
                      <h3 className="font-semibold mb-3">{stageLabel[stage]}</h3>
                      <div className="space-y-2">
                        {(items as any[]).map((bill) => (
                          <label key={bill._id} className="block border rounded-md p-2 bg-white dark:bg-gray-800">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{bill.customerId?.name || "Cliente"}</span>
                              <span>R$ {getBillingOutstanding(bill).toFixed(2)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Período:{" "}
                              {bill.periodStart ? formatDateNoTimezoneShift(bill.periodStart) : "-"} até{" "}
                              {bill.periodEnd ? formatDateNoTimezoneShift(bill.periodEnd) : "-"}
                            </p>
                            <div className="text-[11px] text-gray-500">
                              <span className="font-medium">Itens:</span>
                              {(bill.items || []).length > 0 ? (
                                <div className="mt-0.5 max-h-16 overflow-y-auto pr-1 space-y-0.5">
                                  {bill.items
                                    .map((item: any) => item?.itemId?.name || "Item")
                                    .filter((name: string, index: number, arr: string[]) => arr.indexOf(name) === index)
                                    .map((name: string) => (
                                      <div key={name} className="truncate" title={name}>
                                        {name}
                                      </div>
                                    ))}
                                </div>
                              ) : (
                                <span> -</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">Obra: {bill.rentalId?.workAddress?.workName || "-"}</p>
                            <p className="text-[11px] text-gray-400 mt-1">Fechamento: {bill.billingNumber || bill._id}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <button
                                type="button"
                                className="px-2 py-1 border rounded text-xs"
                                onClick={() => printBillingMutation.mutate(bill._id)}
                              >
                                Imprimir
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 border rounded text-xs"
                                onClick={() => {
                                  const notes = window.prompt("Editar observações do fechamento:", bill.notes || "");
                                  if (notes !== null) editBillingMutation.mutate({ billingId: bill._id, notes });
                                }}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 border rounded text-xs text-red-600"
                                onClick={() => cancelBillingMutation.mutate(bill._id)}
                              >
                                Cancelar
                              </button>
                              {bill.status !== "paid" && bill.status !== "cancelled" && (
                                <button
                                  type="button"
                                  className="px-2 py-1 border rounded text-xs"
                                  onClick={() => void handlePreviewAndRefreshBilling(bill._id)}
                                >
                                  Atualizar fechamento
                                </button>
                              )}
                              {isBillingEligibleForCharge(bill) && (
                                <input
                                  type="checkbox"
                                  checked={selectedBillingIds.includes(bill._id)}
                                  onChange={(e) => {
                                    setSelectedBillingIds((current) =>
                                      e.target.checked
                                        ? [...current, bill._id]
                                        : current.filter((id) => id !== bill._id),
                                    );
                                  }}
                                />
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "charges" && (
            <div className="border rounded-md p-4">
              <h3 className="font-semibold mb-1">Cobranças</h3>
              <p className="text-xs text-gray-500 mb-3">
                Duplo clique em uma cobrança para abrir detalhes completos e ações.
              </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input
              type="date"
              value={invoiceDueDate}
              onChange={(e) => setInvoiceDueDate(e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
              placeholder="Vencimento da fatura (opcional)"
            />
            <select
              value={invoicePaymentMethod}
              onChange={(e) => setInvoicePaymentMethod(e.target.value)}
              className="border rounded-md px-2 py-2 text-sm"
            >
              <option value="boleto/PIX">Boleto/PIX</option>
              <option value="PIX">PIX</option>
              <option value="Boleto">Boleto</option>
              <option value="Transferência">Transferência</option>
            </select>
          </div>
          {filteredCharges.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma cobrança criada ainda.</p>
          ) : (
            <div className="space-y-2">
              {filteredCharges.map((charge: any) => (
                <div
                  key={charge._id}
                  className="border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                  onDoubleClick={() => openChargeModal(charge)}
                  title="Duplo clique para abrir detalhes"
                >
                  <div>
                    <p className="font-medium">{charge.chargeNumber}</p>
                    <p className="text-xs text-gray-500">
                      Cliente: {charge.customerId?.name || "Cliente"} | Status: {chargeStatusLabel[String(charge.status)] || charge.status} | Em aberto: R${" "}
                      {Number(charge.outstandingAmount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openChargeModal(charge)}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    >
                      Abrir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
            </div>
          )}

          {activeTab === "invoices" && (
            <div className="border rounded-md p-4">
              <h3 className="font-semibold mb-1">Faturas</h3>
              <p className="text-xs text-gray-500 mb-3">
                Duplo clique em uma fatura para abrir detalhes completos e ações.
              </p>
              {filteredInvoices.length === 0 ? (
                <p className="text-sm text-gray-600">Nenhuma fatura gerada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {filteredInvoices.map((invoice: any) => (
                    <div
                      key={invoice._id}
                      className="border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60"
                      onDoubleClick={() => openInvoiceModal(invoice)}
                      title="Duplo clique para abrir detalhes"
                    >
                      <div>
                        <p className="font-medium">Fatura {invoice.invoiceNumber}</p>
                        <p className="text-xs text-gray-500">
                          Cliente: {invoice.customerId?.name || "Cliente"} | Status: {invoiceStatusLabel[String(invoice.status)] || invoice.status} | Total: R${" "}
                          {Number(invoice.total || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                          onClick={() => openInvoiceModal(invoice)}
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border rounded-md p-4">
          <h3 className="font-semibold mb-2">Fluxo recomendado nesta tela</h3>
          <p className="text-sm text-gray-600">
            Use as abas para operar todo o fluxo em uma única tela: <strong>Fechamentos</strong> para seleção/edição,
            <strong>Cobranças</strong> para baixa/impressão/cancelamento e <strong>Faturas</strong> para gestão final.
          </p>
        </div>
      </div>

      <RentalDeliveryQuickModal rentalId={deliveryModalRentalId} onClose={() => setDeliveryModalRentalId(null)} />

      {chargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Cobrança {chargeModal.chargeNumber}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Cliente: {chargeModal.customerId?.name || "Cliente"} | Status:{" "}
                  {chargeStatusLabel[String(chargeModal.status)] || chargeModal.status}
                </p>
              </div>
              <button
                type="button"
                className="px-2 py-1 border rounded text-sm"
                onClick={() => setChargeModal(null)}
              >
                Fechar
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="date"
                  className="border rounded-md px-2 py-2 text-sm"
                  value={chargeModalDueDate}
                  onChange={(e) => setChargeModalDueDate(e.target.value)}
                />
                <input
                  className="border rounded-md px-2 py-2 text-sm"
                  value={chargeModalTotal}
                  onChange={(e) => setChargeModalTotal(e.target.value)}
                  placeholder="Valor total"
                />
                <input
                  className="border rounded-md px-2 py-2 text-sm"
                  value={chargeModalNotes}
                  onChange={(e) => setChargeModalNotes(e.target.value)}
                  placeholder="Observações"
                />
              </div>

              <div className="border rounded-md p-3">
                <h4 className="font-medium text-sm mb-2">
                  Fechamentos da cobrança (mesmo cliente e sem outra cobrança/fatura)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableBillingsForChargeModal.map((bill: any) => {
                    const billId = String(bill._id);
                    return (
                      <label key={billId} className="flex items-start gap-2 text-sm border rounded p-2">
                        <input
                          type="checkbox"
                          checked={chargeModalBillingIds.includes(billId)}
                          onChange={(e) => {
                            setChargeModalBillingIds((curr) =>
                              e.target.checked ? [...curr, billId] : curr.filter((id) => id !== billId),
                            );
                          }}
                        />
                        <span>
                          <strong>{bill.billingNumber || bill._id}</strong> -{" "}
                          {bill.periodStart ? formatDateNoTimezoneShift(bill.periodStart) : "-"} ate{" "}
                          {bill.periodEnd ? formatDateNoTimezoneShift(bill.periodEnd) : "-"} | R${" "}
                          {getBillingOutstanding(bill).toFixed(2)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm"
                  onClick={handleSaveChargeFromModal}
                >
                  Salvar cobrança
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  onClick={() => printChargeMutation.mutate(chargeModal._id)}
                >
                  Imprimir PDF
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm"
                  onClick={() => handleGenerateInvoiceFromCharge(chargeModal)}
                >
                  Gerar fatura
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-emerald-700 text-white rounded-md text-sm"
                  onClick={() => handleSettleCharge(chargeModal)}
                >
                  Baixa total
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm"
                  onClick={() => {
                    setSelectedChargeId(chargeModal._id);
                    setChargeModal(null);
                    toast.info(`Cobrança ${chargeModal.chargeNumber} selecionada para baixa parcial.`);
                  }}
                >
                  Baixa parcial
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 border border-red-300 text-red-600 rounded-md text-sm"
                  onClick={() => cancelChargeMutation.mutate(chargeModal._id)}
                >
                  Cancelar cobrança
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Fatura {invoiceModal.invoiceNumber}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Cliente: {invoiceModal.customerId?.name || "Cliente"} | Status:{" "}
                  {invoiceStatusLabel[String(invoiceModal.status)] || invoiceModal.status}
                </p>
              </div>
              <button
                type="button"
                className="px-2 py-1 border rounded text-sm"
                onClick={() => setInvoiceModal(null)}
              >
                Fechar
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="border rounded p-2">Total: R$ {Number(invoiceModal.total || 0).toFixed(2)}</div>
                <div className="border rounded p-2">
                  Emissao: {invoiceModal.issueDate ? formatDateNoTimezoneShift(invoiceModal.issueDate) : "-"}
                </div>
                <div className="border rounded p-2">
                  Vencimento: {invoiceModal.dueDate ? formatDateNoTimezoneShift(invoiceModal.dueDate) : "-"}
                </div>
              </div>
              <textarea
                className="w-full border rounded-md px-2 py-2 text-sm min-h-24"
                value={invoiceModalNotes}
                onChange={(e) => setInvoiceModalNotes(e.target.value)}
                placeholder="Observações"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm"
                  onClick={handleSaveInvoiceFromModal}
                >
                  Salvar fatura
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  onClick={() => printInvoiceMutation.mutate(invoiceModal._id)}
                >
                  Imprimir PDF
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 border border-red-300 text-red-600 rounded-md text-sm"
                  onClick={() => cancelInvoiceMutation.mutate(invoiceModal._id)}
                >
                  Cancelar fatura
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {refreshPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Confirmar atualização do fechamento
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {refreshPreviewModal.billingNumber} - {refreshPreviewModal.customerName}
              </p>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="font-medium text-gray-600 dark:text-gray-300">Campo</div>
                <div className="font-medium text-gray-600 dark:text-gray-300">Atual</div>
                <div className="font-medium text-gray-600 dark:text-gray-300">Novo</div>

                <div className="text-gray-700 dark:text-gray-200">Total</div>
                <div className="text-gray-700 dark:text-gray-200">
                  R$ {refreshPreviewModal.current.total.toFixed(2)}
                </div>
                <div className="text-gray-900 dark:text-white font-semibold">
                  R$ {refreshPreviewModal.next.total.toFixed(2)}
                </div>

                <div className="text-gray-700 dark:text-gray-200">Em aberto</div>
                <div className="text-gray-700 dark:text-gray-200">
                  R$ {refreshPreviewModal.current.outstandingAmount.toFixed(2)}
                </div>
                <div className="text-gray-900 dark:text-white font-semibold">
                  R$ {refreshPreviewModal.next.outstandingAmount.toFixed(2)}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div
                  className={`rounded-md p-3 text-sm ${
                    refreshPreviewModal.diff.total >= 0
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}
                >
                  Diferença no total: R$ {refreshPreviewModal.diff.total.toFixed(2)}
                </div>
                <div
                  className={`rounded-md p-3 text-sm ${
                    refreshPreviewModal.diff.outstandingAmount >= 0
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}
                >
                  Diferença em aberto: R$ {refreshPreviewModal.diff.outstandingAmount.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefreshPreviewModal(null)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const billingId = refreshPreviewModal.billingId;
                  setRefreshPreviewModal(null);
                  refreshBillingMutation.mutate(billingId);
                }}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm"
              >
                Confirmar atualização
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default FinancialCenterPage;

