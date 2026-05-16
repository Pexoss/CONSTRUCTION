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

const isChargeEditLocked = (charge: any): boolean =>
  charge?.status === "paid" || charge?.status === "cancelled";

const invoiceStatusLabel: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  paid: "Paga",
  cancelled: "Cancelada",
};

const getBillingOutstanding = getBillingOutstandingAmount;

/** Nomes dos equipamentos/itens ligados ao fechamento (cadastro já vem populado no board financeiro). */
const getBillingItemNamesLabel = (billing: any): string => {
  const raw = (billing?.items || [])
    .map((it: any) => {
      const ref = it?.itemId;
      if (ref && typeof ref === "object" && ref.name) return String(ref.name).trim();
      return "";
    })
    .filter((s: string): s is string => s.length > 0);
  return raw.filter((name: string, idx: number) => raw.indexOf(name) === idx).join(", ");
};

const isBillingEligibleForCharge = (billing: any): boolean =>
  billing?.financialStage === "pending" &&
  billing?.status !== "paid" &&
  billing?.status !== "cancelled" &&
  !billing?.chargeId &&
  !billing?.invoiceId &&
  getBillingOutstanding(billing) > 0.01;

/** Nova fatura (documento fiscal): permite fechamento já quitado, desde que não cancelado nem já vinculado a NF. */
const isBillingEligibleForInvoiceDocument = (billing: any): boolean =>
  billing?.status !== "cancelled" && !billing?.invoiceId;

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
  const [activeTab, setActiveTab] = useState<"billings" | "charges" | "invoices">("billings");
  const [billingsSubView, setBillingsSubView] = useState<"lista" | "quadro">("lista");
  const [finBillSort, setFinBillSort] = useState<ColumnSort<FinBillSortKey> | null>({
    key: "period",
    dir: "desc",
  });
  const [deliveryModalRentalId, setDeliveryModalRentalId] = useState<string | null>(null);
  /** Baixa parcial no modal da cobrança (fluxo centralizado na aba Cobranças). */
  const [chargePartialAmount, setChargePartialAmount] = useState<string>("");
  const [chargePartialDiscount, setChargePartialDiscount] = useState<string>("");
  /** Desconto na quitação total (saldo quitado = valor recebido + desconto). */
  const [chargeFullSettleDiscount, setChargeFullSettleDiscount] = useState<string>("");
  const [chargePartialMethod, setChargePartialMethod] = useState<string>("manual");
  const [invoiceDueDate, setInvoiceDueDate] = useState<string>("");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<string>("boleto/PIX");
  /** Filtro exclusivo da lista na aba Cobranças */
  const [chargeStatusFilter, setChargeStatusFilter] = useState<string>("");
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
      setChargePartialAmount("");
      setChargePartialDiscount("");
      setChargeFullSettleDiscount("");
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
      if (chargeStatusFilter && String(charge.status || "") !== chargeStatusFilter) {
        return false;
      }
      const chargeCustomerId = String(charge.customerId?._id || charge.customerId || "");
      const customerMatches = !customerFilter || chargeCustomerId === customerFilter;
      if (!customerMatches) return false;
      const relatedBillings = (charge.billingIds || []).filter((b: any) => !!b);
      if (!relatedBillings.length) return !itemFilter && !obraFilter && !periodStartFilter && !periodEndFilter;
      return relatedBillings.some((billing: any) => billingMatchesGlobalFilter(billing));
    });
  }, [
    charges,
    chargeStatusFilter,
    customerFilter,
    itemFilter,
    obraFilter,
    periodStartFilter,
    periodEndFilter,
    billingMatchesGlobalFilter,
  ]);

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

  const handlePayChargePartialFromModal = () => {
    if (!chargeModal) return;
    const outstanding = Number(chargeModal.outstandingAmount || 0);
    const amount = Number(chargePartialAmount || 0);
    const discount = Number(chargePartialDiscount || 0);
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
      chargeId: chargeModal._id,
      amount,
      discount: Number.isFinite(discount) && discount > 0 ? discount : 0,
      method: chargePartialMethod,
    });
  };

  const handleSettleCharge = (charge: any) => {
    const outstanding = Number(charge.outstandingAmount || 0);
    if (outstanding <= 0.01) {
      toast.info("Essa cobrança já está quitada.");
      return;
    }
    const discountParsed = Number(String(chargeFullSettleDiscount || "").replace(",", "."));
    if (!Number.isFinite(discountParsed) || discountParsed < 0) {
      toast.warning("Informe um desconto válido ou deixe em branco/zero.");
      return;
    }
    const discount = Number(discountParsed.toFixed(2));
    if (discount - outstanding > 0.01) {
      toast.warning("O desconto não pode ser maior que o saldo em aberto.");
      return;
    }
    const amount = Number((outstanding - discount).toFixed(2));
    payChargeMutation.mutate({
      chargeId: charge._id,
      amount,
      discount: discount > 0 ? discount : undefined,
      method: "manual",
    });
  };

  const handleGenerateInvoiceFromCharge = (charge: any) => {
    const relatedBillings = (charge.billingIds || []).filter((billing: any) => !!billing);
    const eligibleBillings = relatedBillings.filter((billing: any) =>
      typeof billing === "string" ? true : isBillingEligibleForInvoiceDocument(billing),
    );
    const billingIds = eligibleBillings.map((billing: any) => String(billing?._id || billing));
    if (!billingIds.length) {
      toast.warning(
        "Nenhum fechamento disponível para fatura (cancelados ou já vinculados a uma fatura).",
      );
      return;
    }
    if (eligibleBillings.length < relatedBillings.length) {
      toast.info("A fatura incluirá apenas fechamentos ainda sem nota fiscal vinculada.");
    }
    generateInvoiceMutation.mutate({ chargeId: charge._id, billingIds });
  };

  const openChargeModal = (charge: any) => {
    setChargeModal(charge);
    setChargeModalNotes(String(charge.notes || ""));
    setChargeModalDueDate(toDateInputValue(charge.dueDate));
    setChargeModalTotal(String(Number(charge.total || 0)));
    setChargeModalBillingIds((charge.billingIds || []).map((b: any) => String(b?._id || b)));
    setChargePartialAmount("");
    setChargePartialDiscount("");
    setChargeFullSettleDiscount("");
    setChargePartialMethod("manual");
  };

  const openInvoiceModal = (invoice: any) => {
    setInvoiceModal(invoice);
    setInvoiceModalNotes(String(invoice.notes || ""));
  };

  const handleSaveChargeFromModal = () => {
    if (!chargeModal) return;
    if (isChargeEditLocked(chargeModal)) {
      toast.info("Esta cobrança não pode mais ser alterada.");
      return;
    }
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

  const chargeModalViewOnly = Boolean(chargeModal && isChargeEditLocked(chargeModal));
  /** Cobrança cancelada não gera NF a partir deste fluxo; quitada (paga) pode. */
  const chargeModalShowInvoiceSection = Boolean(
    chargeModal && chargeModal.status !== "cancelled",
  );

  const chargeModalFullSettlePreview = useMemo(() => {
    if (!chargeModal) {
      return { outstanding: 0, discount: 0, received: 0 };
    }
    const os = Number(chargeModal.outstandingAmount || 0);
    const parsed = Number(String(chargeFullSettleDiscount || "").replace(",", "."));
    const discount =
      Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : 0;
    return {
      outstanding: os,
      discount,
      received: Math.max(0, Number((os - discount).toFixed(2))),
    };
  }, [chargeModal, chargeFullSettleDiscount]);

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
            <p className="text-xs text-gray-500">Atalhos</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Link
                to="/rentals?status=active"
                className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm"
              >
                Devoluções pendentes
              </Link>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 leading-relaxed">
              Baixas e recebimentos ficam na aba <strong>Cobranças</strong> (abra a cobrança com duplo clique ou em
              &quot;Abrir&quot;).
            </p>
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
              <div className="flex flex-wrap items-start justify-between gap-3">
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
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={handleCreateCharge}
                    disabled={
                      selectedEligibleBillingIds.length === 0 || createChargeMutation.isPending
                    }
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {createChargeMutation.isPending ? "Criando…" : "Criar cobrança"}
                  </button>
                  {selectedEligibleBillingIds.length > 0 && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 text-right max-w-[220px]">
                      {selectedEligibleBillingIds.length} fechamento(s) elegível(is) para nova cobrança
                    </span>
                  )}
                  {hasMixedCustomers && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 text-right max-w-[260px]">
                      Fechamentos de clientes diferentes — agrupe apenas o mesmo cliente.
                    </p>
                  )}
                </div>
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Duplo clique em uma cobrança para abrir detalhes completos e ações.
              </p>
              <div className="mb-4 max-w-xs">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Status da cobrança
                </label>
                <select
                  value={chargeStatusFilter}
                  onChange={(e) => setChargeStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900"
                >
                  <option value="">Todos</option>
                  {Object.entries(chargeStatusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {filteredCharges.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {charges.length === 0
                    ? "Nenhuma cobrança criada ainda."
                    : "Nenhuma cobrança com os filtros atuais."}
                </p>
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
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Cliente: {charge.customerId?.name || "Cliente"} | Status:{" "}
                          {chargeStatusLabel[String(charge.status)] || charge.status} | Em aberto: R${" "}
                          {Number(charge.outstandingAmount || 0).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openChargeModal(charge)}
                          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
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
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Selecione fechamentos elegíveis na lista ou no quadro e use <strong>Criar cobrança</strong> à direita. Em seguida, na aba{" "}
            <strong>Cobranças</strong>, abra a cobrança para baixa total/parcial, PDF ou cancelamento; em{" "}
            <strong>Faturas</strong>, trate o documento fiscal.
          </p>
        </div>
      </div>

      <RentalDeliveryQuickModal rentalId={deliveryModalRentalId} onClose={() => setDeliveryModalRentalId(null)} />

      {chargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="sticky top-0 z-10 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Cobrança {chargeModal.chargeNumber}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      chargeModal.status === "paid"
                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
                        : chargeModal.status === "partial"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                          : chargeModal.status === "cancelled"
                            ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                            : "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100"
                    }`}
                  >
                    {chargeStatusLabel[String(chargeModal.status)] || chargeModal.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                  {chargeModal.customerId?.name || "Cliente"}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => setChargeModal(null)}
              >
                Fechar
              </button>
            </div>
            <div className="px-5 py-5 space-y-6">
              {chargeModalViewOnly ? (
                <div
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                  role="status"
                >
                  {chargeModal.status === "paid"
                    ? "Esta cobrança está quitada: não é possível alterar dados, fechamentos nem baixas. Você pode gerar a fatura nesta tela se os fechamentos ainda não estiverem em outra nota, ou imprimir o PDF."
                    : "Esta cobrança foi cancelada e não pode ser alterada."}
                </div>
              ) : null}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Total
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                    R$ {Number(chargeModal.total || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Recebido
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                    R$ {Number(chargeModal.paidAmount || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3 col-span-2 lg:col-span-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Em aberto
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                    R$ {Number(chargeModal.outstandingAmount || 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3 col-span-2 lg:col-span-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Vencimento
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {chargeModalDueDate
                      ? formatDateNoTimezoneShift(chargeModalDueDate)
                      : chargeModal.dueDate
                        ? formatDateNoTimezoneShift(chargeModal.dueDate)
                        : "—"}
                  </p>
                </div>
              </div>

              <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gray-50/90 dark:bg-gray-800/60 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Dados da cobrança
                  </h4>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Data de vencimento
                      </label>
                      <input
                        type="date"
                        className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 ${
                          chargeModalViewOnly ? "opacity-70 cursor-not-allowed" : ""
                        }`}
                        disabled={chargeModalViewOnly}
                        value={chargeModalDueDate}
                        onChange={(e) => setChargeModalDueDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Valor total (R$)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 tabular-nums ${
                          chargeModalViewOnly ? "opacity-70 cursor-not-allowed" : ""
                        }`}
                        disabled={chargeModalViewOnly}
                        value={chargeModalTotal}
                        onChange={(e) => setChargeModalTotal(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Observações
                    </label>
                    <textarea
                      rows={3}
                      className={`w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 resize-y min-h-[4.5rem] ${
                        chargeModalViewOnly ? "opacity-70 cursor-not-allowed" : ""
                      }`}
                      disabled={chargeModalViewOnly}
                      value={chargeModalNotes}
                      onChange={(e) => setChargeModalNotes(e.target.value)}
                      placeholder="Notas internas sobre esta cobrança…"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="bg-gray-50/90 dark:bg-gray-800/60 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                    Fechamentos vinculados
                  </h4>
                  {!chargeModalViewOnly ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Mesmo cliente; marque ou desmarque para alterar o agrupamento antes de salvar.
                    </p>
                  ) : null}
                </div>
                <div className="p-3 max-h-64 overflow-y-auto space-y-2">
                  {availableBillingsForChargeModal.map((bill: any) => {
                    const billId = String(bill._id);
                    const itemNames = getBillingItemNamesLabel(bill);
                    return (
                      <label
                        key={billId}
                        className={`flex items-start gap-3 text-sm rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-white dark:bg-gray-900/40 ${
                          chargeModalViewOnly
                            ? "cursor-default"
                            : "cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 rounded border-gray-300"
                          disabled={chargeModalViewOnly}
                          checked={chargeModalBillingIds.includes(billId)}
                          onChange={(e) => {
                            setChargeModalBillingIds((curr) =>
                              e.target.checked ? [...curr, billId] : curr.filter((id) => id !== billId),
                            );
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {bill.billingNumber || bill._id}
                          </span>
                          {itemNames ? (
                            <span className="text-gray-600 dark:text-gray-300"> — {itemNames}</span>
                          ) : null}
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {bill.periodStart ? formatDateNoTimezoneShift(bill.periodStart) : "-"} até{" "}
                            {bill.periodEnd ? formatDateNoTimezoneShift(bill.periodEnd) : "-"} ·{" "}
                            <span className="tabular-nums font-medium">
                              R$ {getBillingOutstanding(bill).toFixed(2)}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>

              {!chargeModalViewOnly && Number(chargeModal.outstandingAmount || 0) > 0.01 ? (
                <section>
                  <div className="mb-2 px-0.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Baixas e quitação
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Quite o saldo inteiro (com desconto opcional) ou registre uma baixa parcial.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/25 overflow-hidden flex flex-col">
                      <div className="px-4 py-2.5 border-b border-emerald-200/80 dark:border-emerald-800/50">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-200">
                          Quitação total
                        </h4>
                      </div>
                      <div className="p-4 space-y-3 flex-1 flex flex-col">
                        <div className="space-y-1.5 max-w-full sm:max-w-[200px]">
                          <label className="text-xs font-medium text-emerald-900/90 dark:text-emerald-200/90">
                            Desconto (opcional), R$
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="w-full border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 tabular-nums"
                            placeholder="0,00"
                            value={chargeFullSettleDiscount}
                            onChange={(e) => setChargeFullSettleDiscount(e.target.value)}
                          />
                        </div>
                        <p className="text-xs text-emerald-900/85 dark:text-emerald-100/90 leading-relaxed rounded-lg bg-white/60 dark:bg-gray-900/30 px-3 py-2.5 border border-emerald-100 dark:border-emerald-900/40">
                          Saldo em aberto{" "}
                          <span className="font-semibold tabular-nums">
                            R$ {chargeModalFullSettlePreview.outstanding.toFixed(2)}
                          </span>
                          . Serão registrados recebimento de{" "}
                          <span className="font-semibold tabular-nums">
                            R$ {chargeModalFullSettlePreview.received.toFixed(2)}
                          </span>
                          {chargeModalFullSettlePreview.discount > 0.005 ? (
                            <>
                              {" "}
                              + desconto{" "}
                              <span className="font-semibold tabular-nums">
                                R$ {chargeModalFullSettlePreview.discount.toFixed(2)}
                              </span>
                            </>
                          ) : null}
                          .
                        </p>
                        <button
                          type="button"
                          disabled={payChargeMutation.isPending}
                          className="w-full sm:w-auto px-4 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-emerald-800"
                          onClick={() => handleSettleCharge(chargeModal)}
                        >
                          {payChargeMutation.isPending ? "Registrando…" : "Registrar baixa total"}
                        </button>
                        <p className="text-xs text-emerald-800/75 dark:text-emerald-200/80 mt-auto">
                          Saldo em aberto nesta cobrança:{" "}
                          <span className="font-semibold tabular-nums">
                            R$ {Number(chargeModal.outstandingAmount || 0).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50/80 dark:bg-gray-800/40 overflow-hidden flex flex-col">
                      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                          Baixa parcial
                        </h4>
                      </div>
                      <div className="p-4 space-y-3 flex-1 flex flex-col">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                              Valor (R$)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 tabular-nums"
                              placeholder="0,00"
                              value={chargePartialAmount}
                              onChange={(e) => setChargePartialAmount(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                              Desconto (R$)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 tabular-nums"
                              placeholder="0,00"
                              value={chargePartialDiscount}
                              onChange={(e) => setChargePartialDiscount(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                              Forma
                            </label>
                            <select
                              value={chargePartialMethod}
                              onChange={(e) => setChargePartialMethod(e.target.value)}
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900"
                            >
                              <option value="manual">Manual</option>
                              <option value="pix">PIX</option>
                              <option value="boleto">Boleto</option>
                              <option value="cartao">Cartão</option>
                              <option value="transferencia">Transferência</option>
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={payChargeMutation.isPending}
                          className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-green-700"
                          onClick={() => handlePayChargePartialFromModal()}
                        >
                          {payChargeMutation.isPending ? "Registrando…" : "Registrar baixa parcial"}
                        </button>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-auto">
                          Saldo em aberto nesta cobrança:{" "}
                          <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                            R$ {Number(chargeModal.outstandingAmount || 0).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {chargeModalShowInvoiceSection ? (
                <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="bg-gray-50/90 dark:bg-gray-800/60 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Ao gerar fatura a partir desta cobrança
                    </h4>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Vencimento na fatura (opcional)
                      </label>
                      <input
                        type="date"
                        value={invoiceDueDate}
                        onChange={(e) => setInvoiceDueDate(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Forma de pagamento na fatura
                      </label>
                      <select
                        value={invoicePaymentMethod}
                        onChange={(e) => setInvoicePaymentMethod(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900"
                      >
                        <option value="boleto/PIX">Boleto/PIX</option>
                        <option value="PIX">PIX</option>
                        <option value="Boleto">Boleto</option>
                        <option value="Transferência">Transferência</option>
                      </select>
                    </div>
                  </div>
                </section>
              ) : null}

              <div className="flex flex-col gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Ações
                  </span>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    {!chargeModalViewOnly ? (
                      <button
                        type="button"
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                        onClick={handleSaveChargeFromModal}
                      >
                        Salvar cobrança
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => printChargeMutation.mutate(chargeModal._id)}
                    >
                      Imprimir PDF
                    </button>
                    {chargeModalShowInvoiceSection ? (
                      <button
                        type="button"
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                        onClick={() => handleGenerateInvoiceFromCharge(chargeModal)}
                      >
                        Gerar fatura
                      </button>
                    ) : null}
                    {!chargeModalViewOnly ? (
                      <button
                        type="button"
                        className="px-4 py-2 border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => cancelChargeMutation.mutate(chargeModal._id)}
                      >
                        Cancelar cobrança
                      </button>
                    ) : null}
                  </div>
                </div>
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

