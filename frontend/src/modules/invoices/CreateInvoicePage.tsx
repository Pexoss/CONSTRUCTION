import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { customerService } from "../customers/customer.service";
import { billingService } from "../billings/billing.service";
import { invoiceService } from "./invoice.service";
import {
  companyService,
  EMPTY_COMPANY_INVOICE_ISSUERS,
  type CompanyInvoiceIssuerRow,
} from "../company/company.service";
import { toast } from "react-toastify";
import { ArrowLeft, FilePlus2 } from "lucide-react";
import type { CustomerAddress } from "../../types/customer.types";
import {
  formatCurrencyBr,
  formatDocumentForDisplay,
  formatMoneyInputBr,
  parseMoneyBr,
} from "../../utils/formatters";
import { billingStatusLabel } from "../../utils/statusLabels";
import SortableTh from "../../components/SortableTh";
import {
  ColumnSort,
  sortedTableRows,
  toggleColumnSort,
} from "../../utils/tableSort";
import { getBillingCompositionRowsOrdered, sortBillingDocumentsFreteClosureGroupLastStable } from "../../utils/billingDisplayOrder";

type CreateInvoiceBillingSortKey =
  | "closure"
  | "period"
  | "items"
  | "status"
  | "total";
const CreateInvoicePage: React.FC = () => {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<any>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [issueDate, setIssueDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentMethod, setPaymentMethod] = useState("boleto/PIX");
  const [obraDescription, setObraDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [tax, setTax] = useState("");
  const [discount, setDiscount] = useState("");
  const [billingIssuerForCreate, setBillingIssuerForCreate] = useState("");
  const [createInvBillingSort, setCreateInvBillingSort] = useState<
    ColumnSort<CreateInvoiceBillingSortKey> | null
  >({
    key: "period",
    dir: "desc",
  });

  const { data: customersRes, isLoading: loadingCustomers } = useQuery({
    queryKey: ["customers-invoice-create"],
    queryFn: () => customerService.getCustomers({ limit: 500, page: 1 }),
  });

  const { data: customerDetailRes, isLoading: loadingCustomerDetail } = useQuery({
    queryKey: ["customer-detail-with-addresses", customerId],
    queryFn: () => customerService.getCustomerById(customerId),
    enabled: !!customerId,
  });

  const { data: billingsRes, isLoading: loadingBillings } = useQuery({
    queryKey: ["billings-for-invoice", customerId],
    queryFn: () =>
      billingService.getBillings({
        customerId,
        limit: 200,
        page: 1,
      }),
    enabled: !!customerId,
  });

  const allCustomers = useMemo(
    () => {
      const list = customersRes?.data ?? [];
      return [...list].sort((a, b) => a.name.localeCompare(b.name));
    },
    [customersRes],
  );

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const search = customerSearch.toLowerCase().trim();
    return allCustomers.filter((customer) => {
      const matchesName = customer.name.toLowerCase().includes(search);
      const matchesCnpj = customer.cpfCnpj?.toLowerCase().includes(search);
      return matchesName || matchesCnpj;
    });
  }, [allCustomers, customerSearch]);

  const selectedCustomer = useMemo(
    () => allCustomers.find((c) => c._id === customerId),
    [allCustomers, customerId],
  );

  const customerDetail = customerDetailRes?.data;
  const customerAddresses = customerDetail?.addresses ?? [];
  const billings = useMemo(() => billingsRes?.data?.billings ?? [], [billingsRes?.data?.billings]);

  const billingsGroupedFreteClosureLast = useMemo(
    () =>
      sortBillingDocumentsFreteClosureGroupLastStable(billings, (it) =>
        typeof it.itemId === "object" && it.itemId?.name ? it.itemId.name : "Item",
      ),
    [billings],
  );

  const sortedBillingsForCreateInv = useMemo(
    () =>
      sortedTableRows(billingsGroupedFreteClosureLast, createInvBillingSort, {
        closure: (b) => String(b.billingNumber ?? "").toLowerCase(),
        period: (b) =>
          b.periodStart ? new Date(b.periodStart).getTime() : 0,
        items: (b: any) => {
          const billingItemLabel = (it: any) =>
            typeof it.itemId === "object" && it.itemId?.name
              ? it.itemId.name
              : "";
          const rows = getBillingCompositionRowsOrdered(
            {
              items: b.items ?? [],
              services: b.services ?? [],
            },
            billingItemLabel,
          );
          const names = rows
            .map((r) =>
              r.kind === "item"
                ? billingItemLabel(r.item)
                : r.service.description || "servico",
            )
            .filter(Boolean)
            .join(", ")
            .toLowerCase();
          return names;
        },
        status: (b: any) =>
          String(billingStatusLabel[b.status as keyof typeof billingStatusLabel] || b.status || ""),
        total: (b) => Number(b.calculation?.total ?? 0),
      }),
    [billingsGroupedFreteClosureLast, createInvBillingSort],
  );

  const { data: invoiceIssuerOptionsRaw } = useQuery<
    CompanyInvoiceIssuerRow[]
  >({
    queryKey: ["company-invoice-issuers-create"],
    queryFn: () => companyService.getInvoiceIssuers(),
  });
  const invoiceIssuerOptions: CompanyInvoiceIssuerRow[] =
    invoiceIssuerOptionsRaw ?? EMPTY_COMPANY_INVOICE_ISSUERS;

  useEffect(() => {
    if (invoiceIssuerOptions.length > 0 && !billingIssuerForCreate) {
      setBillingIssuerForCreate(invoiceIssuerOptions[0].id);
    }
  }, [invoiceIssuerOptions, billingIssuerForCreate]);

  const handleCreateInvBillingSort = (k: CreateInvoiceBillingSortKey) =>
    setCreateInvBillingSort((prev) => toggleColumnSort(prev, k));

  const selectedBillings = useMemo(
    () => billings.filter((b) => selectedIds.has(b._id)),
    [billings, selectedIds],
  );

  const selectedTotal = useMemo(() => {
    return selectedBillings.reduce((sum, b) => sum + (b.calculation?.total ?? 0), 0);
  }, [selectedBillings]);

  // Atualizar data de vencimento automaticamente baseado na data de fechamento do aluguel
  React.useEffect(() => {
    if (selectedBillings.length > 0) {
      // Pega o maior periodEnd (último dia de fechamento)
      const lastPeriodEnd = selectedBillings.reduce((max, b) => {
        const periodEnd = new Date(b.periodEnd).getTime();
        return periodEnd > max ? periodEnd : max;
      }, new Date(selectedBillings[0].periodEnd).getTime());

      const dueDateObj = new Date(lastPeriodEnd);
      const dueDateString = dueDateObj.toISOString().slice(0, 10);
      setDueDate(dueDateString);
    }
  }, [selectedBillings]);

  const createMutation = useMutation({
    mutationFn: () =>
      invoiceService.createInvoiceFromBillings({
        billingIds: Array.from(selectedIds),
        issueDate: new Date(issueDate).toISOString(),
        dueDate: new Date(dueDate).toISOString(),
        paymentMethod: paymentMethod.trim() || undefined,
        obraDescription: obraDescription.trim() || undefined,
        notes: notes.trim() || undefined,
        tax: tax.trim() === "" ? undefined : parseMoneyBr(tax),
        discount: discount.trim() === "" ? undefined : parseMoneyBr(discount),
        billingIssuerId:
          invoiceIssuerOptions.length > 0 ? billingIssuerForCreate || undefined : undefined,
      }),
    onSuccess: (res) => {
      const inv = res.data as { _id: string; invoiceNumber?: string; total?: number };
      setCreatedInvoice(inv);
      setShowSuccessModal(true);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Erro ao criar fatura";
      toast.error(msg);
    },
  });

  const toggleBilling = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === billings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(billings.map((b) => b._id)));
    }
  };

  const getAddressLabel = (addr: CustomerAddress) => {
    const typeMap: Record<string, string> = {
      main: "Principal",
      billing: "Cobrança",
      work: "Obra",
      other: "Outro",
    };
    const addressType = addr.type || "other";
    const typeLabel = typeMap[addressType] || addressType;
    const name = addr.addressName || addr.workName || addr.street || "Sem identificação";
    return `${typeLabel} - ${name}`;
  };

  const formatAddressToDescription = (addr: CustomerAddress) => {
    const parts = [
      addr.workName || addr.addressName || "",
      `${addr.street}${addr.number ? ", " + addr.number : ""}`,
      addr.complement,
      addr.neighborhood,
      `${addr.city} - ${addr.state}`,
      addr.zipCode,
    ];
    return parts.filter(Boolean).join(" • ");
  };

  const handleAddressChange = (addressId: string) => {
    setSelectedAddressId(addressId);
    if (addressId) {
      const selectedAddr = customerAddresses.find((a: CustomerAddress) => a._id === addressId);
      if (selectedAddr) {
        setObraDescription(formatAddressToDescription(selectedAddr));
      }
    } else {
      setObraDescription("");
    }
  };

  const handleCustomerChange = (newCustomerId: string) => {
    setCustomerId(newCustomerId);
    setSelectedIds(new Set());
    setSelectedAddressId("");
    setObraDescription("");
    setShowCustomerDropdown(false);
    const selected = allCustomers.find((c) => c._id === newCustomerId);
    if (selected) {
      setCustomerSearch(""); // Limpa a busca após selecionar
    }
  };

  const getStatusInPortuguese = (status: string): string => {
    const statusMap: Record<string, string> = {
      draft: "Rascunho",
      pending_approval: "Aguardando Aprovação",
      approved: "Aprovado",
      paid: "Pago",
      cancelled: "Cancelado",
    };
    return statusMap[status] || status;
  };

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR");

  return (
    <Layout title="Nova fatura" backTo="/invoices" backLabel="Faturas">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FilePlus2 className="w-6 h-6 text-indigo-600" />
            Nova fatura a partir de fechamentos
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Escolha o cliente e marque um ou mais fechamentos para agrupar na mesma
            fatura. O PDF seguirá o layout da fatura de locação (A4).
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cliente * (Buscar por nome ou CNPJ)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={loadingCustomers ? "Carregando..." : "Digite o nome ou CNPJ do cliente"}
                value={customerId ? (selectedCustomer?.name || "") : customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  if (!customerId) {
                    setShowCustomerDropdown(true);
                  }
                }}
                onFocus={() => {
                  if (!customerId) {
                    setShowCustomerDropdown(true);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowCustomerDropdown(false), 200);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />

              {customerId && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerId("");
                    setCustomerSearch("");
                    setSelectedIds(new Set());
                    setSelectedAddressId("");
                    setObraDescription("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              )}

              {showCustomerDropdown && !customerId && filteredCustomers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-10 max-h-64 overflow-y-auto">
                  {filteredCustomers.slice(0, 20).map((customer) => (
                    <button
                      key={customer._id}
                      type="button"
                      onClick={() => handleCustomerChange(customer._id)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 border-b border-gray-100 dark:border-gray-600 last:border-b-0"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {customer.name}
                      </div>
                      {customer.cpfCnpj && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDocumentForDisplay(customer.cpfCnpj)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {showCustomerDropdown &&
                !customerId &&
                customerSearch.trim() &&
                filteredCustomers.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-10 p-3">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Nenhum cliente encontrado
                    </p>
                  </div>
                )}
            </div>
          </div>

          {customerId && (
            <>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Emissão
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Vencimento
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  />
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Preenchida automaticamente com o último dia dos fechamentos
                  </p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Forma de pagamento
                  </label>
                  <input
                    type="text"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    placeholder="boleto/PIX"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  />
                </div>
              </div>

              {invoiceIssuerOptions.length > 0 ? (
                <div className="max-w-xl space-y-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    CNPJ emissor na fatura *
                  </label>
                  <select
                    value={billingIssuerForCreate}
                    onChange={(e) => setBillingIssuerForCreate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                  >
                    {invoiceIssuerOptions.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label} · {formatDocumentForDisplay(row.cnpj)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    A numeração é sequencial separada por CNPJ cadastrado.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 max-w-xl">
                  Cadastre os CNPJs emissores em{" "}
                  <Link to="/company/settings" className="underline font-medium">
                    Configurações da empresa
                  </Link>{" "}
                  para faturamento com mais de um CNPJ da locadora.
                </p>
              )}

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Endereço
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedAddressId}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    disabled={loadingCustomerDetail || customerAddresses.length === 0}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm disabled:opacity-50"
                  >
                    <option value="">
                      {loadingCustomerDetail
                        ? "Carregando endereços..."
                        : customerAddresses.length === 0
                        ? "Sem endereços"
                        : "Selecione um endereço"}
                    </option>
                    {customerAddresses.map((addr: CustomerAddress) => (
                      <option key={addr._id} value={addr._id}>
                        {getAddressLabel(addr)}
                      </option>
                    ))}
                  </select>
                  <Link
                    to={`/customers/${customerId}`}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm hover:bg-gray-50 dark:hover:bg-gray-600 whitespace-nowrap"
                  >
                    + Novo
                  </Link>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Descrição da obra (preenchida automaticamente ou editar manualmente)
                </label>
                <input
                  type="text"
                  value={obraDescription}
                  onChange={(e) => setObraDescription(e.target.value)}
                  placeholder="Ex.: Rua X, obra Y..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Observação adicional (opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                />
              </div>

              <div className="flex gap-4 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Imposto (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    onBlur={(e) => setTax(formatMoneyInputBr(e.target.value))}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    onBlur={(e) => setDiscount(formatMoneyInputBr(e.target.value))}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm tabular-nums"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {customerId && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-wrap gap-2">
              <span className="font-medium text-gray-900 dark:text-white">
                Fechamentos do cliente
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {selectedIds.size === billings.length ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>

            {loadingBillings ? (
              <div className="p-8 text-center text-gray-500">Carregando fechamentos...</div>
            ) : billings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Nenhum fechamento encontrado para este cliente.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <SortableTh<CreateInvoiceBillingSortKey>
                        columnKey="closure"
                        label="Fechamento"
                        sort={createInvBillingSort}
                        onSort={handleCreateInvBillingSort}
                        thClassName="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTh<CreateInvoiceBillingSortKey>
                        columnKey="period"
                        label="Período"
                        sort={createInvBillingSort}
                        onSort={handleCreateInvBillingSort}
                        thClassName="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTh<CreateInvoiceBillingSortKey>
                        columnKey="items"
                        label="Itens"
                        sort={createInvBillingSort}
                        onSort={handleCreateInvBillingSort}
                        thClassName="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTh<CreateInvoiceBillingSortKey>
                        columnKey="status"
                        label="Status"
                        sort={createInvBillingSort}
                        onSort={handleCreateInvBillingSort}
                        thClassName="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                      <SortableTh<CreateInvoiceBillingSortKey>
                        columnKey="total"
                        label="Total"
                        align="right"
                        sort={createInvBillingSort}
                        onSort={handleCreateInvBillingSort}
                        thClassName="px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300"
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedBillingsForCreateInv.map((b) => {
                      const total = b.calculation?.total ?? 0;
                      const rentalNo =
                        typeof b.rentalId === "object" && b.rentalId?.rentalNumber
                          ? b.rentalId.rentalNumber
                          : "—";
                      return (
                        <tr
                          key={b._id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                          onClick={() => toggleBilling(b._id)}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(b._id)}
                              onChange={() => toggleBilling(b._id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                            <div className="font-mono font-medium">{b.billingNumber}</div>
                            <div className="text-xs text-gray-500">Aluguel {rentalNo}</div>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                            {fmtDate(b.periodStart)} — {fmtDate(b.periodEnd)}
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                            {(b.items && b.items.length > 0) ||
                            (b.services && b.services.length > 0) ? (
                              <div className="space-y-1">
                                {getBillingCompositionRowsOrdered(
                                  { items: b.items ?? [], services: b.services ?? [] },
                                  (item) =>
                                    typeof item.itemId === "object" && item.itemId?.name
                                      ? item.itemId.name
                                      : typeof item.itemId === "string"
                                        ? `Item ${item.itemId}`
                                        : "Item desconhecido",
                                ).map((row, idx) =>
                                  row.kind === "item" ? (
                                    <div key={`it-${idx}`} className="text-xs">
                                      {typeof row.item.itemId === "object" &&
                                      row.item.itemId?.name
                                        ? row.item.itemId.name
                                        : typeof row.item.itemId === "string"
                                          ? `Item ${row.item.itemId}`
                                          : "Item desconhecido"}{" "}
                                      (qty: {row.item.quantity})
                                    </div>
                                  ) : (
                                    <div key={`sv-${idx}`} className="text-xs">
                                      {row.service.description || "Serviço"} (serviço, qty:{" "}
                                      {row.service.quantity || 1})
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Sem itens</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">{getStatusInPortuguese(b.status)}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium">
                            {formatCurrencyBr(total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {selectedIds.size} fechamento(s) selecionado(s)
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Referência fechamentos: {formatCurrencyBr(selectedTotal)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link
            to="/invoices"
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </Link>
          <button
            type="button"
            disabled={
              !customerId ||
              selectedIds.size === 0 ||
              createMutation.isPending ||
              (invoiceIssuerOptions.length > 0 && !billingIssuerForCreate.trim())
            }
            onClick={() => createMutation.mutate()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? "Gerando..." : "Gerar fatura"}
          </button>
        </div>

        {/* MODAL DE SUCESSO */}
        {showSuccessModal && createdInvoice && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-green-600 dark:text-green-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Fatura Emitida com Sucesso!
                </h2>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Sua fatura <strong>{createdInvoice.invoiceNumber}</strong> foi emitida e está pronta.
                </p>

                {createdInvoice.total && (
                  <div className="w-full bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Valor Total</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {formatCurrencyBr(createdInvoice.total)}
                    </p>
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
                  Você pode marcar essa fatura como paga quando o pagamento for recebido.
                </p>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => {
                      setShowSuccessModal(false);
                      navigate("/invoices");
                    }}
                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    Voltar à Lista
                  </button>
                  <button
                    onClick={() => {
                      setShowSuccessModal(false);
                      navigate(`/invoiceDetails/${createdInvoice._id}`);
                    }}
                    className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
                  >
                    Visualizar Fatura
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CreateInvoicePage;
