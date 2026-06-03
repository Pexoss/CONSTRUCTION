import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import { useAuth } from "../../hooks/useAuth";
import { features } from "../../config/features";
import { canManageFinancial } from "../../utils/financialAccess";
import { financialService } from "./financial.service";
import { chargeService } from "../charges/charge.service";
import { invoiceService } from "../invoices/invoice.service";
import { billingService } from "../billings/billing.service";
import { customerService } from "../customers/customer.service";
import {
  billingMatchesBoardFilters,
  FinancialBoardUrlFilters,
  isWithoutChargeOnlyFromSearchParams,
  WITHOUT_CHARGE_FILTER_PARAM,
} from "./financialBoardFilters";
import {
  companyService,
  EMPTY_COMPANY_INVOICE_ISSUERS,
  type CompanyInvoiceIssuerRow,
} from "../company/company.service";
import { rentalTypeLabel } from "../../utils/statusLabels";
import {
  formatDateNoTimezoneShift,
  formatDateTimeForDisplay,
  formatDocumentForDisplay,
  formatCurrencyBr,
  formatMoneyInputBrLive,
  formatMoneyInputBr,
  getBillingOutstandingAmount,
  parseMoneyBr,
  toDateInputValue,
} from "../../utils/formatters";
import { selectInputText } from "../../utils/selectInputText";
import SortableTh from "../../components/SortableTh";
import {
  ColumnSort,
  sortedTableRows,
  toggleColumnSort,
} from "../../utils/tableSort";
import { getBillingCompositionRowsOrdered } from "../../utils/billingDisplayOrder";

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

/** Maior `paidAt` entre as baixas registradas na cobrança (para lista). */
const getChargeLatestPaymentPaidAtIso = (charge: any): string | undefined => {
  const list = charge?.payments;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  let bestMs = 0;
  let bestIso: string | undefined;
  for (const p of list) {
    if (!p?.paidAt) continue;
    const t = new Date(p.paidAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= bestMs) {
      bestMs = t;
      bestIso = String(p.paidAt);
    }
  }
  return bestIso;
};

const isChargeEditLocked = (charge: any): boolean =>
  charge?.status === "paid" || charge?.status === "cancelled";

const invoiceStatusLabel: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  paid: "Paga",
  cancelled: "Cancelada",
};

const formatInvoiceHeading = (invoice: {
  invoiceNumber?: string;
  issuerCnpj?: string;
}): string => {
  const number = invoice.invoiceNumber?.trim() || "—";
  const cnpj = invoice.issuerCnpj?.trim()
    ? formatDocumentForDisplay(invoice.issuerCnpj)
    : "";
  return cnpj ? `${cnpj} · Fatura ${number}` : `Fatura ${number}`;
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
  const { user } = useAuth();
  const canManageFinancialUser = canManageFinancial(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"billings" | "charges" | "invoices">("billings");
  const [finBillSort, setFinBillSort] = useState<ColumnSort<FinBillSortKey> | null>({
    key: "period",
    dir: "desc",
  });
  const [boardCustomerSearch, setBoardCustomerSearch] = useState("");
  const [showBoardCustomerDropdown, setShowBoardCustomerDropdown] = useState(false);
  /** Campos para registrar baixa no modal da cobrança (aba Cobranças). */
  const [chargePartialAmount, setChargePartialAmount] = useState<string>("");
  const [chargePartialDiscount, setChargePartialDiscount] = useState<string>("");
  /** Saldo em aberto usado como base da baixa (valor + desconto = abatimento nesta operação). */
  const [chargePartialSettleBase, setChargePartialSettleBase] = useState<number>(0);
  /** Desconto reduz valor a partir do saldo total (não do valor já reduzido). */
  const chargePartialDiscountLinksAmountRef = useRef(false);
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
  const [chargeModalBillingsEditMode, setChargeModalBillingsEditMode] = useState(false);
  const [chargeModalBillingIdsSnapshot, setChargeModalBillingIdsSnapshot] = useState<
    string[]
  >([]);
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
  const withoutChargeOnlyFilter = isWithoutChargeOnlyFromSearchParams(searchParams);
  const emitenteInvoiceBoardFilter = searchParams.get("emitente") || "";

  const [invoiceBillingIssuerForCreate, setInvoiceBillingIssuerForCreate] = useState<string>("");

  const filterParamsShared: Omit<FinancialBoardUrlFilters, "withoutChargeOnly"> = useMemo(
    () => ({
      customerId: customerFilter,
      itemText: itemFilter,
      obraText: obraFilter,
      periodStart: periodStartFilter,
      periodEnd: periodEndFilter,
    }),
    [customerFilter, itemFilter, obraFilter, periodStartFilter, periodEndFilter],
  );

  const filterParamsBillings: FinancialBoardUrlFilters = useMemo(
    () => ({
      ...filterParamsShared,
      withoutChargeOnly: withoutChargeOnlyFilter,
    }),
    [filterParamsShared, withoutChargeOnlyFilter],
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

  const { data: invoiceIssuerBoardOptionsRaw } = useQuery<
    CompanyInvoiceIssuerRow[]
  >({
    queryKey: ["company-invoice-issuers"],
    queryFn: () => companyService.getInvoiceIssuers(),
    enabled: features.financialUnifiedModule,
  });
  const invoiceIssuerBoardOptions: CompanyInvoiceIssuerRow[] =
    invoiceIssuerBoardOptionsRaw ?? EMPTY_COMPANY_INVOICE_ISSUERS;

  useEffect(() => {
    if (invoiceIssuerBoardOptions.length > 0 && !invoiceBillingIssuerForCreate) {
      setInvoiceBillingIssuerForCreate(invoiceIssuerBoardOptions[0].id);
    }
  }, [invoiceIssuerBoardOptions, invoiceBillingIssuerForCreate]);

  const financialBoardQueryKey = useMemo(
    () =>
      [
        "financial-board",
        customerFilter,
        itemFilter,
        obraFilter,
        periodStartFilter,
        periodEndFilter,
        emitenteInvoiceBoardFilter,
      ] as const,
    [
      customerFilter,
      itemFilter,
      obraFilter,
      periodStartFilter,
      periodEndFilter,
      emitenteInvoiceBoardFilter,
    ],
  );

  const fetchFinancialBoard = useCallback(
    () =>
      financialService.getBoard({
        customerId: customerFilter || undefined,
        startDate: periodStartFilter || undefined,
        endDate: periodEndFilter || undefined,
        billingIssuerId: emitenteInvoiceBoardFilter || undefined,
      }),
    [
      customerFilter,
      periodStartFilter,
      periodEndFilter,
      emitenteInvoiceBoardFilter,
    ],
  );

  const applyChargeModalState = useCallback((charge: any) => {
    setChargeModal(charge);
    setChargeModalBillingsEditMode(false);
    setChargeModalNotes(String(charge.notes || ""));
    setChargeModalDueDate(toDateInputValue(charge.dueDate));
    setChargeModalTotal(formatMoneyInputBr(Number(charge.total || 0)));
    setChargeModalBillingIds((charge.billingIds || []).map((b: any) => String(b?._id || b)));
    const outstanding = Math.max(0, Number(charge.outstandingAmount || 0));
    setChargePartialSettleBase(outstanding);
    setChargePartialAmount(formatMoneyInputBr(outstanding));
    setChargePartialDiscount(formatMoneyInputBr(0));
    chargePartialDiscountLinksAmountRef.current = false;
    setChargePartialMethod("manual");
  }, []);

  const boardQuery = useQuery({
    queryKey: financialBoardQueryKey,
    queryFn: fetchFinancialBoard,
    enabled: features.financialUnifiedModule,
  });
  const boardData = boardQuery.data?.data;

  const billings = useMemo(() => boardData?.billings || [], [boardData]);
  const charges = useMemo(() => boardData?.charges || [], [boardData]);
  const invoices = useMemo(() => boardData?.invoices || [], [boardData]);

  const {
    data: boardCustomersCatalog,
    isLoading: boardCustomersCatalogLoading,
  } = useQuery({
    queryKey: ["financial-board-customers-catalog"],
    queryFn: () => customerService.getCustomers({ limit: 500, page: 1 }),
    enabled: features.financialUnifiedModule,
  });

  const customerPickerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cpfCnpj?: string }>();
    for (const c of boardCustomersCatalog?.data ?? []) {
      map.set(String(c._id), {
        id: String(c._id),
        name: c.name?.trim() || "Cliente",
        cpfCnpj: c.cpfCnpj,
      });
    }
    for (const billing of billings) {
      const id = String(billing.customerId?._id || billing.customerId || "");
      const name = String(billing.customerId?.name || "Cliente").trim() || "Cliente";
      if (id && !map.has(id)) {
        map.set(id, { id, name });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [boardCustomersCatalog, billings]);

  const selectedBoardCustomerLabel = useMemo(() => {
    if (!customerFilter) return "";
    const found = customerPickerOptions.find((o) => o.id === customerFilter);
    return found?.name ?? `Cliente (${customerFilter.slice(-8)})`;
  }, [customerFilter, customerPickerOptions]);

  const filteredBoardCustomers = useMemo(() => {
    const raw = boardCustomerSearch.trim().toLowerCase();
    const qDigits = raw.replace(/\D/g, "");
    if (!raw.trim() && qDigits.length === 0) {
      return [];
    }
    return customerPickerOptions.filter((c) => {
      const name = c.name.toLowerCase();
      const docDigits = String(c.cpfCnpj || "").replace(/\D/g, "");
      const matchesName = name.includes(raw);
      const matchesDoc = qDigits.length > 0 && docDigits.includes(qDigits);
      return matchesName || matchesDoc;
    });
  }, [boardCustomerSearch, customerPickerOptions]);
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
    onSuccess: async (_result, { chargeId }) => {
      toast.success("Baixa registrada com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["financial-board"] });
      const boardResult = await queryClient.fetchQuery({
        queryKey: financialBoardQueryKey,
        queryFn: fetchFinancialBoard,
      });
      const updatedCharge = (boardResult?.data?.charges || []).find(
        (c: any) => String(c._id) === String(chargeId),
      );
      if (
        !updatedCharge ||
        Number(updatedCharge.outstandingAmount || 0) <= 0.01 ||
        updatedCharge.status === "paid"
      ) {
        setChargeModal(null);
        setChargeModalBillingsEditMode(false);
        return;
      }
      applyChargeModalState(updatedCharge);
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
        billingIssuerId:
          invoiceIssuerBoardOptions.length > 0
            ? invoiceBillingIssuerForCreate || undefined
            : undefined,
      });
    },
    onSuccess: (response) => {
      toast.success(`Fatura ${response.data.invoiceNumber} gerada com sucesso.`);
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
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

  const handleFinBillSort = (key: FinBillSortKey) =>
    setFinBillSort((prev) => toggleColumnSort(prev, key));

  const billingsFilteredForTable = useMemo(
    () =>
      billings.filter((b: any) => billingMatchesBoardFilters(b, filterParamsBillings)),
    [billings, filterParamsBillings],
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
    (billing: any) => billingMatchesBoardFilters(billing, filterParamsShared),
    [filterParamsShared],
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
    const amount = parseMoneyBr(chargePartialAmount);
    const discount = parseMoneyBr(chargePartialDiscount);
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

  const handleGenerateInvoiceFromCharge = (charge: any) => {
    if (invoiceIssuerBoardOptions.length > 0 && !invoiceBillingIssuerForCreate.trim()) {
      toast.warning("Selecione o CNPJ emissor da fatura.");
      return;
    }
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
    applyChargeModalState(charge);
  };

  const chargePartialAmountIsFullSettle = (amount: number) =>
    Math.abs(amount - chargePartialSettleBase) < 0.01;

  const applyChargePartialDiscount = (
    discountRaw: string,
    amountRawForCheck: string,
    finalize: boolean,
  ) => {
    const discountFormatted = finalize
      ? formatMoneyInputBr(parseMoneyBr(discountRaw))
      : formatMoneyInputBrLive(discountRaw);
    const discount = parseMoneyBr(discountFormatted);
    const currentAmount = parseMoneyBr(amountRawForCheck);
    const safeAmount = Number.isFinite(currentAmount) ? Math.max(0, currentAmount) : 0;

    if (!Number.isFinite(discount)) {
      setChargePartialDiscount(discountFormatted);
      return;
    }

    if (chargePartialAmountIsFullSettle(safeAmount)) {
      chargePartialDiscountLinksAmountRef.current = true;
    }

    if (chargePartialDiscountLinksAmountRef.current) {
      const cappedDiscount = Math.min(Math.max(0, discount), chargePartialSettleBase);
      const nextAmount = Math.max(0, chargePartialSettleBase - cappedDiscount);
      setChargePartialDiscount(
        finalize
          ? formatMoneyInputBr(cappedDiscount)
          : cappedDiscount !== discount
            ? formatMoneyInputBr(cappedDiscount)
            : discountFormatted,
      );
      setChargePartialAmount(formatMoneyInputBr(nextAmount));
      return;
    }

    const maxDiscount = Math.max(0, chargePartialSettleBase - safeAmount);
    const cappedDiscount = Math.min(Math.max(0, discount), maxDiscount);
    setChargePartialDiscount(
      finalize
        ? formatMoneyInputBr(cappedDiscount)
        : cappedDiscount !== discount
          ? formatMoneyInputBr(cappedDiscount)
          : discountFormatted,
    );
  };

  const syncChargePartialFromDiscount = (discountRaw: string) => {
    applyChargePartialDiscount(discountRaw, chargePartialAmount, false);
  };

  const finalizeChargePartialFromDiscount = (discountRaw: string) => {
    applyChargePartialDiscount(discountRaw, chargePartialAmount, true);
  };

  const syncChargePartialFromAmount = (amountRaw: string) => {
    chargePartialDiscountLinksAmountRef.current = false;
    setChargePartialAmount(formatMoneyInputBrLive(amountRaw));
  };

  const finalizeChargePartialFromAmount = (amountRaw: string) => {
    chargePartialDiscountLinksAmountRef.current = false;
    const amount = parseMoneyBr(amountRaw);
    const cappedAmount = Number.isFinite(amount)
      ? Math.min(Math.max(0, amount), chargePartialSettleBase)
      : 0;
    setChargePartialAmount(formatMoneyInputBr(cappedAmount));
  };

  const chargeModalLinkedBillings = useMemo(() => {
    if (!chargeModal) return [];
    const idSet = new Set(chargeModalBillingIds);
    const fromBoard = billings.filter((b: any) => idSet.has(String(b._id)));
    if (fromBoard.length >= idSet.size) return fromBoard;
    const boardIds = new Set(fromBoard.map((b: any) => String(b._id)));
    const fromCharge = (chargeModal.billingIds || []).filter(
      (b: any) => b && typeof b === "object" && idSet.has(String(b._id)) && !boardIds.has(String(b._id)),
    );
    return [...fromBoard, ...fromCharge];
  }, [chargeModal, chargeModalBillingIds, billings]);

  const startChargeModalBillingsEdit = () => {
    setChargeModalBillingIdsSnapshot([...chargeModalBillingIds]);
    setChargeModalBillingsEditMode(true);
  };

  const cancelChargeModalBillingsEdit = () => {
    setChargeModalBillingIds(chargeModalBillingIdsSnapshot);
    setChargeModalBillingsEditMode(false);
  };

  const finishChargeModalBillingsEdit = () => {
    setChargeModalBillingsEditMode(false);
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
        total: parseMoneyBr(chargeModalTotal),
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

  const chargeModalViewOnly =
    !canManageFinancialUser ||
    Boolean(chargeModal && isChargeEditLocked(chargeModal));
  /** Cobrança cancelada não gera NF a partir deste fluxo; quitada (paga) pode — só gestores. */
  const chargeModalShowInvoiceSection = Boolean(
    canManageFinancialUser &&
      chargeModal &&
      chargeModal.status !== "cancelled",
  );
  const invoiceModalReadOnly = !canManageFinancialUser;

  /** Soma dos fechamentos marcados no modal da cobrança — atualiza o valor total antes de salvar. */
  const chargeModalSelectedBillingsTotal = useMemo(() => {
    if (!chargeModal) return 0;
    const idSet = new Set(chargeModalBillingIds);
    return billings
      .filter((b: any) => idSet.has(String(b._id)))
      .reduce((acc: number, b: any) => acc + getBillingOutstanding(b), 0);
  }, [billings, chargeModal, chargeModalBillingIds]);

  useEffect(() => {
    if (!chargeModal || chargeModalViewOnly) return;
    setChargeModalTotal(formatMoneyInputBr(chargeModalSelectedBillingsTotal));
  }, [chargeModal, chargeModalSelectedBillingsTotal, chargeModalViewOnly]);

  const chargePartialBaixaSummary = useMemo(() => {
    const outstanding = Math.max(0, Number(chargeModal?.outstandingAmount || 0));
    const amount = parseMoneyBr(chargePartialAmount);
    const discount = parseMoneyBr(chargePartialDiscount);
    const received = Number.isFinite(amount) && amount > 0 ? amount : 0;
    const discountValue = Number.isFinite(discount) && discount > 0 ? discount : 0;
    const totalSettled = Math.round((received + discountValue) * 100) / 100;
    const remaining = Math.max(0, Math.round((outstanding - totalSettled) * 100) / 100);
    return { outstanding, received, discountValue, totalSettled, remaining };
  }, [chargeModal, chargePartialAmount, chargePartialDiscount]);

  const selectBoardCustomerFilter = (id: string) => {
    updateFilterParam("customer", id);
    setBoardCustomerSearch("");
    setShowBoardCustomerDropdown(false);
  };

  const clearBoardCustomerFilter = () => {
    updateFilterParam("customer", "");
    setBoardCustomerSearch("");
    setShowBoardCustomerDropdown(false);
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
        {!canManageFinancialUser ? (
          <div
            className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100"
            role="status"
          >
            Modo consulta: você pode filtrar listas e gerar PDF de fechamentos, cobranças e
            faturas. Alterações financeiras são restritas a administradores.
          </div>
        ) : null}

        <details className="border rounded-md p-4 bg-white dark:bg-gray-800">
          <summary className="cursor-pointer font-semibold">
            Filtros (cliente, item, obra e período — todas as abas)
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative min-w-0">
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                Cliente
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={
                    boardCustomersCatalogLoading
                      ? "Carregando clientes..."
                      : "Nome ou documento — digite para filtrar"
                  }
                  disabled={boardCustomersCatalogLoading}
                  value={customerFilter ? selectedBoardCustomerLabel : boardCustomerSearch}
                  onChange={(e) => {
                    if (customerFilter) return;
                    setBoardCustomerSearch(e.target.value);
                    setShowBoardCustomerDropdown(true);
                  }}
                  onFocus={() => {
                    if (!customerFilter) setShowBoardCustomerDropdown(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setShowBoardCustomerDropdown(false), 200);
                  }}
                  className="w-full border rounded-md px-2 py-2 pr-9 text-sm bg-white dark:bg-gray-900"
                />
                {customerFilter ? (
                  <button
                    type="button"
                    aria-label="Limpar filtro de cliente"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearBoardCustomerFilter}
                  >
                    ✕
                  </button>
                ) : null}
                {showBoardCustomerDropdown &&
                !customerFilter &&
                filteredBoardCustomers.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                    {filteredBoardCustomers.slice(0, 25).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectBoardCustomerFilter(c.id)}
                      >
                        <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                        {c.cpfCnpj ? (
                          <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
                            {formatDocumentForDisplay(String(c.cpfCnpj))}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <input
              value={itemFilter}
              onChange={(e) => updateFilterParam("item", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900"
              placeholder="Filtrar por item"
            />

            <input
              value={obraFilter}
              onChange={(e) => updateFilterParam("obra", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900"
              placeholder="Filtrar por obra"
            />

            <input
              type="date"
              value={periodStartFilter}
              onChange={(e) => updateFilterParam("start", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900"
            />

            <input
              type="date"
              value={periodEndFilter}
              onChange={(e) => updateFilterParam("end", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900"
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={withoutChargeOnlyFilter}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.checked) {
                  next.delete(WITHOUT_CHARGE_FILTER_PARAM);
                } else {
                  next.set(WITHOUT_CHARGE_FILTER_PARAM, "0");
                }
                setSearchParams(next, { replace: true });
              }}
            />
            <span>
              Na aba Fechamentos: apenas sem cobrança gerada (não afeta Cobranças nem Faturas)
            </span>
          </label>

          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setBoardCustomerSearch("");
                setShowBoardCustomerDropdown(false);
                setSearchParams({}, { replace: true });
              }}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
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
          </div>

          {activeTab === "billings" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-[200px]">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Lista de fechamentos</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {canManageFinancialUser
                      ? "Marque linhas elegíveis e use Criar cobrança."
                      : "Consulte os fechamentos e use o botão PDF em cada linha."}
                  </p>
                </div>
                {canManageFinancialUser ? (
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
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                  <table className="min-w-[960px] w-full text-sm text-left">
                    <thead className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                      <tr>
                        {canManageFinancialUser ? (
                          <th className="px-2 py-2 w-10 text-center">Sel.</th>
                        ) : null}
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
                          <td
                            colSpan={canManageFinancialUser ? 9 : 8}
                            className="px-3 py-6 text-center text-gray-500"
                          >
                            Nenhum fechamento com os filtros atuais.
                          </td>
                        </tr>
                      ) : (
                        tableBillings.map((bill: any) => {
                          const rentalIdStr = String(bill.rentalId?._id || bill.rentalId || "");
                          const compositionRows = getBillingCompositionRowsOrdered(
                            { items: bill.items ?? [], services: bill.services ?? [] },
                            (it: any) =>
                              typeof it.itemId === "object" && it.itemId?.name ? it.itemId.name : "Item",
                          );
                          const itemNames: string[] =
                            compositionRows.length > 0
                              ? (() => {
                                  const seen = new Set<string>();
                                  const out: string[] = [];
                                  for (const row of compositionRows) {
                                    const label =
                                      row.kind === "item"
                                        ? typeof row.item.itemId === "object" && row.item.itemId?.name
                                          ? row.item.itemId.name
                                          : "Item"
                                        : row.service.description || "Serviço";
                                    if (seen.has(label)) continue;
                                    seen.add(label);
                                    out.push(label);
                                  }
                                  return out;
                                })()
                              : [];
                          const tipo =
                            rentalTypeLabel[String(bill.rentalType || "")] || bill.rentalType || "—";
                          const canSelectForCharge = isBillingEligibleForCharge(bill);
                          return (
                            <tr key={bill._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                              {canManageFinancialUser ? (
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
                              ) : null}
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
                                {formatCurrencyBr(getBillingOutstanding(bill))}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {rentalIdStr ? (
                                    <Link
                                      to={`/rentals/${rentalIdStr}`}
                                      className="px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                                      title="Abrir o aluguel (consulta, edição e devoluções de itens)"
                                    >
                                      Aluguel / devoluções
                                    </Link>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="px-2 py-0.5 border rounded text-xs"
                                    onClick={() => printBillingMutation.mutate(bill._id)}
                                  >
                                    PDF
                                  </button>
                                  {canManageFinancialUser ? (
                                    <>
                                      <button
                                        type="button"
                                        className="px-2 py-0.5 border rounded text-xs"
                                        onClick={() => {
                                          const notes = window.prompt(
                                            "Editar observações do fechamento:",
                                            bill.notes || "",
                                          );
                                          if (notes !== null)
                                            editBillingMutation.mutate({ billingId: bill._id, notes });
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
                                      {bill.status !== "paid" && bill.status !== "cancelled" ? (
                                        <button
                                          type="button"
                                          className="px-2 py-0.5 border rounded text-xs"
                                          onClick={() => void handlePreviewAndRefreshBilling(bill._id)}
                                        >
                                          Atualizar
                                        </button>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
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
                      className={`border rounded-md p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2 cursor-pointer ${
                        charge.status === "paid"
                          ? "bg-emerald-50 border-emerald-200/90 dark:bg-emerald-950/40 dark:border-emerald-800/50 hover:bg-emerald-100/90 dark:hover:bg-emerald-900/45"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
                      }`}
                      onDoubleClick={() => openChargeModal(charge)}
                      title="Duplo clique para abrir detalhes"
                    >
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900 dark:text-white truncate">
                          {charge.customerId?.name || "Cliente"}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          <span className="text-gray-600 dark:text-gray-300 font-medium tabular-nums">
                            {charge.chargeNumber}
                          </span>
                          {" · "}
                          {chargeStatusLabel[String(charge.status)] || charge.status}
                          {" · "}
                          Em aberto{" "}
                          <span className="tabular-nums font-medium">
                            {formatCurrencyBr(charge.outstandingAmount || 0)}
                          </span>
                          {Number(charge.paidAmount || 0) > 0.01 ? (
                            <>
                              {" · "}
                              Pago{" "}
                              <span className="tabular-nums font-medium text-gray-700 dark:text-gray-200">
                                {formatCurrencyBr(charge.paidAmount || 0)}
                              </span>
                              {(() => {
                                const lastIso = getChargeLatestPaymentPaidAtIso(charge);
                                const lastLabel = lastIso ? formatDateTimeForDisplay(lastIso) : "";
                                return lastLabel ? (
                                  <>
                                    {" · "}Última baixa:{" "}
                                    <span className="tabular-nums">{lastLabel}</span>
                                  </>
                                ) : null;
                              })()}
                            </>
                          ) : null}
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
                        <button
                          type="button"
                          onClick={() => printChargeMutation.mutate(charge._id)}
                          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                        >
                          PDF
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Duplo clique em uma fatura para abrir detalhes completos e ações.
              </p>
              <div className="mb-4 max-w-xs">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  CNPJ gerador
                </label>
                <select
                  value={emitenteInvoiceBoardFilter}
                  onChange={(e) => updateFilterParam("emitente", e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-900"
                >
                  <option value="">Todos</option>
                  <option value="legacy">Sem emitente cadastrado (antigas)</option>
                  {invoiceIssuerBoardOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label} · {formatDocumentForDisplay(row.cnpj)}
                    </option>
                  ))}
                </select>
              </div>
              {filteredInvoices.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {invoices.length === 0
                    ? "Nenhuma fatura gerada ainda."
                    : "Nenhuma fatura com os filtros atuais."}
                </p>
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
                        <p className="font-medium">{formatInvoiceHeading(invoice)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Cliente: {invoice.customerId?.name || "Cliente"}
                          {invoice.issuerLabel ? (
                            <> | Emitente: {invoice.issuerLabel}</>
                          ) : null}{" "}
                          | Status: {invoiceStatusLabel[String(invoice.status)] || invoice.status} |
                          Total: {formatCurrencyBr(invoice.total || 0)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                          onClick={() => openInvoiceModal(invoice)}
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                          onClick={() => printInvoiceMutation.mutate(invoice._id)}
                        >
                          PDF
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
            {canManageFinancialUser ? (
              <>
                Selecione fechamentos elegíveis na lista abaixo e use <strong>Criar cobrança</strong>. Em seguida, na
                aba <strong>Cobranças</strong>, abra a cobrança para registrar baixa (valor + desconto opcional), PDF ou
                cancelamento; em <strong>Faturas</strong>, trate o documento fiscal.
              </>
            ) : (
              <>
                Consulte fechamentos, cobranças e faturas nas abas acima. Use o botão <strong>PDF</strong> em cada
                linha ou dentro do detalhe para imprimir os documentos.
              </>
            )}
          </p>
        </div>
      </div>

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
                className="shrink-0 px-4 py-2.5 rounded-lg border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-bold shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
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
                  {!canManageFinancialUser
                    ? "Modo consulta: você pode visualizar os dados e imprimir o PDF. Alterações são restritas a administradores."
                    : chargeModal.status === "paid"
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
                    {formatCurrencyBr(chargeModal.total || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Recebido
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-white">
                    {formatCurrencyBr(chargeModal.paidAmount || 0)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3 col-span-2 lg:col-span-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Em aberto
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                    {formatCurrencyBr(chargeModal.outstandingAmount || 0)}
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
                        onFocus={selectInputText}
                        onClick={selectInputText}
                        onChange={(e) => setChargeModalTotal(formatMoneyInputBrLive(e.target.value))}
                        onBlur={(e) =>
                          setChargeModalTotal(formatMoneyInputBr(e.target.value))
                        }
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
                <div className="bg-gray-50/90 dark:bg-gray-800/60 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Fechamentos vinculados
                    </h4>
                    {chargeModalBillingsEditMode && !chargeModalViewOnly ? (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Mesmo cliente: marque ou desmarque fechamentos e use Concluir; depois
                        salve a cobrança.
                      </p>
                    ) : null}
                  </div>
                  {!chargeModalViewOnly && !chargeModalBillingsEditMode ? (
                    <button
                      type="button"
                      className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-indigo-300 text-indigo-700 dark:border-indigo-600 dark:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      onClick={startChargeModalBillingsEdit}
                    >
                      Editar fechamentos
                    </button>
                  ) : null}
                  {chargeModalBillingsEditMode && !chargeModalViewOnly ? (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                        onClick={cancelChargeModalBillingsEdit}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                        onClick={finishChargeModalBillingsEdit}
                      >
                        Concluir edição
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="p-3 max-h-64 overflow-y-auto space-y-2">
                  {chargeModalBillingsEditMode && !chargeModalViewOnly ? (
                    availableBillingsForChargeModal.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
                        Nenhum outro fechamento elegível para este cliente.
                      </p>
                    ) : (
                      availableBillingsForChargeModal.map((bill: any) => {
                        const billId = String(bill._id);
                        const itemNames = getBillingItemNamesLabel(bill);
                        return (
                          <label
                            key={billId}
                            className="flex items-start gap-3 text-sm rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-white dark:bg-gray-900/40 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600"
                          >
                            <input
                              type="checkbox"
                              className="mt-1 rounded border-gray-300"
                              checked={chargeModalBillingIds.includes(billId)}
                              onChange={(e) => {
                                setChargeModalBillingIds((curr) =>
                                  e.target.checked
                                    ? [...curr, billId]
                                    : curr.filter((id) => id !== billId),
                                );
                              }}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-gray-900 dark:text-white">
                                {bill.billingNumber || bill._id}
                              </span>
                              {itemNames ? (
                                <span className="text-gray-600 dark:text-gray-300">
                                  {" "}
                                  — {itemNames}
                                </span>
                              ) : null}
                              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {bill.periodStart
                                  ? formatDateNoTimezoneShift(bill.periodStart)
                                  : "-"}{" "}
                                até{" "}
                                {bill.periodEnd
                                  ? formatDateNoTimezoneShift(bill.periodEnd)
                                  : "-"}{" "}
                                ·{" "}
                                <span className="tabular-nums font-medium">
                                  {formatCurrencyBr(getBillingOutstanding(bill))}
                                </span>
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )
                  ) : chargeModalLinkedBillings.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 px-1">
                      Nenhum fechamento vinculado a esta cobrança.
                    </p>
                  ) : (
                    chargeModalLinkedBillings.map((bill: any) => {
                      const billId = String(bill._id);
                      const itemNames = getBillingItemNamesLabel(bill);
                      return (
                        <div
                          key={billId}
                          className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-white dark:bg-gray-900/40"
                        >
                          <span className="font-medium text-gray-900 dark:text-white">
                            {bill.billingNumber || bill._id}
                          </span>
                          {itemNames ? (
                            <span className="text-gray-600 dark:text-gray-300"> — {itemNames}</span>
                          ) : null}
                          <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {bill.periodStart
                              ? formatDateNoTimezoneShift(bill.periodStart)
                              : "-"}{" "}
                            até{" "}
                            {bill.periodEnd
                              ? formatDateNoTimezoneShift(bill.periodEnd)
                              : "-"}{" "}
                            ·{" "}
                            <span className="tabular-nums font-medium">
                              {formatCurrencyBr(getBillingOutstanding(bill))}
                            </span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {!chargeModalViewOnly && Number(chargeModal.outstandingAmount || 0) > 0.01 ? (
                <section>
                  <div className="mb-2 px-0.5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Registrar baixa
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Alterar o valor não muda o desconto. O desconto só reduz o valor quando ele
                      estiver igual ao saldo em aberto ({formatCurrencyBr(chargePartialSettleBase)}).
                      Valor + desconto abatem o saldo (baixa parcial ou total).
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-slate-50/80 dark:bg-gray-800/40 overflow-hidden flex flex-col max-w-full lg:max-w-3xl">
                    <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        Valores da baixa
                      </h4>
                    </div>
                    <div className="p-4 space-y-3 flex-1 flex flex-col">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Valor (R$)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 tabular-nums"
                            placeholder="0,00"
                            value={chargePartialAmount}
                            onFocus={selectInputText}
                            onClick={selectInputText}
                            onChange={(e) => syncChargePartialFromAmount(e.target.value)}
                            onBlur={(e) => finalizeChargePartialFromAmount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Desconto (R$)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900 tabular-nums"
                            placeholder="0,00"
                            value={chargePartialDiscount}
                            onFocus={selectInputText}
                            onClick={selectInputText}
                            onChange={(e) => syncChargePartialFromDiscount(e.target.value)}
                            onBlur={(e) => finalizeChargePartialFromDiscount(e.target.value)}
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
                        {payChargeMutation.isPending ? "Registrando…" : "Registrar baixa"}
                      </button>
                      <div className="rounded-md border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/50 px-3 py-2.5 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <p>
                          Total desta baixa (valor + desconto):{" "}
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                            {formatCurrencyBr(chargePartialBaixaSummary.totalSettled)}
                          </span>
                        </p>
                        {chargePartialBaixaSummary.remaining > 0.01 ? (
                          <p>
                            Saldo remanescente após esta baixa:{" "}
                            <span className="font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">
                              {formatCurrencyBr(chargePartialBaixaSummary.remaining)}
                            </span>
                          </p>
                        ) : chargePartialBaixaSummary.totalSettled > 0.01 ? (
                          <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                            Esta baixa quita o saldo em aberto da cobrança.
                          </p>
                        ) : null}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-0.5 border-t border-gray-100 dark:border-gray-700">
                          Saldo em aberto antes da baixa:{" "}
                          <span className="tabular-nums font-medium">
                            {formatCurrencyBr(chargePartialBaixaSummary.outstanding)}
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
                    {invoiceIssuerBoardOptions.length > 0 ? (
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          CNPJ emissor na fatura (obrigatório)
                        </label>
                        <select
                          value={invoiceBillingIssuerForCreate}
                          onChange={(e) => setInvoiceBillingIssuerForCreate(e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-900"
                        >
                          {invoiceIssuerBoardOptions.map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.label} · {formatDocumentForDisplay(row.cnpj)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 sm:col-span-2">
                        Cadastre os CNPJs emissores em{" "}
                        <Link to="/company/settings" className="underline font-medium">
                          Configurações da empresa
                        </Link>{" "}
                        para escolher o emitente ao gerar a fatura e numerar por CNPJ.
                      </p>
                    )}
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
                        className="px-4 py-2 border border-red-300 text-red-600 dark:border-red-800 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          const ok = window.confirm(
                            "Tem certeza que deseja cancelar esta cobrança?\n\nEla deixará de constar como ativa; os vínculos com os fechamentos serão atualizados conforme as regras do sistema.",
                          );
                          if (!ok) return;
                          cancelChargeMutation.mutate(chargeModal._id);
                        }}
                        disabled={cancelChargeMutation.isPending}
                      >
                        {cancelChargeMutation.isPending ? "Cancelando…" : "Cancelar cobrança"}
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
                  {formatInvoiceHeading(invoiceModal)}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Cliente: {invoiceModal.customerId?.name || "Cliente"}
                  {invoiceModal.issuerLabel ? (
                    <> | Emitente: {invoiceModal.issuerLabel}</>
                  ) : null}{" "}
                  | Status:{" "}
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
                <div className="border rounded p-2">Total: {formatCurrencyBr(invoiceModal.total || 0)}</div>
                <div className="border rounded p-2">
                  Emissao: {invoiceModal.issueDate ? formatDateNoTimezoneShift(invoiceModal.issueDate) : "-"}
                </div>
                <div className="border rounded p-2">
                  Vencimento: {invoiceModal.dueDate ? formatDateNoTimezoneShift(invoiceModal.dueDate) : "-"}
                </div>
              </div>
              <textarea
                className="w-full border rounded-md px-2 py-2 text-sm min-h-24 disabled:opacity-70 disabled:cursor-not-allowed"
                value={invoiceModalNotes}
                onChange={(e) => setInvoiceModalNotes(e.target.value)}
                placeholder="Observações"
                readOnly={invoiceModalReadOnly}
                disabled={invoiceModalReadOnly}
              />
              <div className="flex flex-wrap gap-2">
                {!invoiceModalReadOnly ? (
                  <>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm"
                      onClick={handleSaveInvoiceFromModal}
                    >
                      Salvar fatura
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 border border-red-300 text-red-600 rounded-md text-sm"
                      onClick={() => cancelInvoiceMutation.mutate(invoiceModal._id)}
                    >
                      Cancelar fatura
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                  onClick={() => printInvoiceMutation.mutate(invoiceModal._id)}
                >
                  Imprimir PDF
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
                  {formatCurrencyBr(refreshPreviewModal.current.total)}
                </div>
                <div className="text-gray-900 dark:text-white font-semibold">
                  {formatCurrencyBr(refreshPreviewModal.next.total)}
                </div>

                <div className="text-gray-700 dark:text-gray-200">Em aberto</div>
                <div className="text-gray-700 dark:text-gray-200">
                  {formatCurrencyBr(refreshPreviewModal.current.outstandingAmount)}
                </div>
                <div className="text-gray-900 dark:text-white font-semibold">
                  {formatCurrencyBr(refreshPreviewModal.next.outstandingAmount)}
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
                  Diferença no total: {formatCurrencyBr(refreshPreviewModal.diff.total)}
                </div>
                <div
                  className={`rounded-md p-3 text-sm ${
                    refreshPreviewModal.diff.outstandingAmount >= 0
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}
                >
                  Diferença em aberto: {formatCurrencyBr(refreshPreviewModal.diff.outstandingAmount)}
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

