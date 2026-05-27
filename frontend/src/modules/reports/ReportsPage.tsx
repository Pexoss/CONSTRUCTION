import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportService } from "./report.service";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Layout from "../../components/Layout";
import SortableTh from "../../components/SortableTh";
import {
  ColumnSort,
  sortedTableRows,
  toggleColumnSort,
} from "../../utils/tableSort";
import {
  formatCurrencyBr,
  todayDateInputValue,
  formatDocumentForDisplay,
} from "../../utils/formatters";
import {
  companyService,
  EMPTY_COMPANY_INVOICE_ISSUERS,
  type CompanyInvoiceIssuerRow,
} from "../company/company.service";
import {
  FinancialReport,
  InventoryReport,
  InvoicesGeneratedReport,
  MostRentedItem,
  ReceivablesReport,
  RentalItemsPeriodsReport,
  RentalsReport,
  TopCustomer,
  MaintenanceReport,
} from "../../types/report.types";

type ReportApiResult<T> = { success: boolean; data: T };

type InventoryMostUsedRow = NonNullable<InventoryReport["mostUsedItems"]>[number];
type GeneratedInvoiceRow = InvoicesGeneratedReport["invoices"][number];
type RentalItemsPeriodRow = RentalItemsPeriodsReport["items"][number];
type ReceivablesPaidRow = ReceivablesReport["paidInPeriod"][number];
type ReceivablesPendingRow = ReceivablesReport["pending"][number];

const EMPTY_INVENTORY_MOST_USED: InventoryMostUsedRow[] = [];
const EMPTY_MOST_RENTED: MostRentedItem[] = [];
const EMPTY_GENERATED_INVOICES: GeneratedInvoiceRow[] = [];
const EMPTY_RENTAL_ITEMS_PERIOD: RentalItemsPeriodRow[] = [];
const EMPTY_RECEIVABLES_PAID: ReceivablesPaidRow[] = [];
const EMPTY_RECEIVABLES_PENDING: ReceivablesPendingRow[] = [];
const EMPTY_TOP_CUSTOMERS: TopCustomer[] = [];

type InventoryMostUsedSortKey = "itemName" | "quantity" | "totalValue";

type MostRentedSortKey = "itemName" | "rentalCount" | "totalRevenue";

type InvoicesGeneratedSortKey =
  | "invoiceNumber"
  | "customerName"
  | "issueDate"
  | "dueDate"
  | "status"
  | "total";

type RentalItemsPeriodSortKey =
  | "billingNumber"
  | "rentalNumber"
  | "customerName"
  | "itemLine"
  | "periodStart"
  | "rentalType"
  | "quantity"
  | "equipmentSituation"
  | "subtotal";

type ReceivablesPaidSortKey =
  | "kind"
  | "documentNumber"
  | "customerName"
  | "amount"
  | "paymentDate"
  | "paymentMethod";

type ReceivablesPendingSortKey =
  | "kind"
  | "documentNumber"
  | "customerName"
  | "amount"
  | "dueDate"
  | "status";

type TopCustomersSortKey =
  | "customerName"
  | "rentalCount"
  | "totalSpent";

const ReportsPage: React.FC = () => {
  type ReportType =
    | "rentals"
    | "financial"
    | "rental-items"
    | "invoices"
    | "maintenance"
    | "inventory"
    | "receivables";

  const [reportType, setReportType] = useState<ReportType>("rentals");
  const [startDate, setStartDate] = useState(
    (() => {
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    })(),
  );
  const [endDate, setEndDate] = useState(todayDateInputValue());
  const [invoiceReportIssuerFilter, setInvoiceReportIssuerFilter] = useState("");

  const [inventoryMostUsedSort, setInventoryMostUsedSort] = useState<
    ColumnSort<InventoryMostUsedSortKey> | null
  >(null);
  const [mostRentedSort, setMostRentedSort] = useState<
    ColumnSort<MostRentedSortKey> | null
  >(null);
  const [invoicesGeneratedSort, setInvoicesGeneratedSort] = useState<
    ColumnSort<InvoicesGeneratedSortKey> | null
  >(null);
  const [rentalItemsPeriodSort, setRentalItemsPeriodSort] = useState<
    ColumnSort<RentalItemsPeriodSortKey> | null
  >(null);
  const [receivablesPaidSort, setReceivablesPaidSort] = useState<
    ColumnSort<ReceivablesPaidSortKey> | null
  >(null);
  const [receivablesPendingSort, setReceivablesPendingSort] = useState<
    ColumnSort<ReceivablesPendingSortKey> | null
  >(null);
  const [topCustomersSort, setTopCustomersSort] = useState<
    ColumnSort<TopCustomersSortKey> | null
  >(null);

  const { data: invoiceIssuerRowsForReportRaw } = useQuery<
    CompanyInvoiceIssuerRow[]
  >({
    queryKey: ["company-invoice-issuers-reports"],
    queryFn: () => companyService.getInvoiceIssuers(),
  });
  const invoiceIssuerRowsForReport: CompanyInvoiceIssuerRow[] =
    invoiceIssuerRowsForReportRaw ?? EMPTY_COMPANY_INVOICE_ISSUERS;

  const { data: rentalsReport } = useQuery<ReportApiResult<RentalsReport>>({
    queryKey: ["rentals-report", startDate, endDate],
    queryFn: () => reportService.getRentalsReport(startDate, endDate),
    enabled: reportType === "rentals",
  });

  const { data: financialReport } = useQuery<ReportApiResult<FinancialReport>>({
    queryKey: ["financial-report", startDate, endDate],
    queryFn: () => reportService.getFinancialReport(startDate, endDate),
    enabled: reportType === "financial",
  });

  const { data: invoicesGeneratedReport } = useQuery<
    ReportApiResult<InvoicesGeneratedReport>
  >({
    queryKey: ["invoices-generated-report", startDate, endDate, invoiceReportIssuerFilter],
    queryFn: () =>
      reportService.getInvoicesGeneratedReport(
        startDate,
        endDate,
        invoiceReportIssuerFilter || undefined,
      ),
    enabled: reportType === "invoices",
  });

  const { data: rentalItemsPeriodsReport } = useQuery<
    ReportApiResult<RentalItemsPeriodsReport>
  >({
    queryKey: ["rental-items-periods-report", startDate, endDate],
    queryFn: () =>
      reportService.getRentalItemsPeriodsReport(startDate, endDate),
    enabled: reportType === "rental-items",
  });

  const { data: maintenanceReport } = useQuery<ReportApiResult<MaintenanceReport>>({
    queryKey: ["maintenance-report", startDate, endDate],
    queryFn: () => reportService.getMaintenanceReport(startDate, endDate),
    enabled: reportType === "maintenance",
  });

  const { data: mostRentedItems } = useQuery<ReportApiResult<MostRentedItem[]>>({
    queryKey: ["most-rented-items", startDate, endDate],
    queryFn: () => reportService.getMostRentedItems(startDate, endDate, 10),
  });

  const { data: topCustomers } = useQuery<ReportApiResult<TopCustomer[]>>({
    queryKey: ["top-customers", startDate, endDate],
    queryFn: () => reportService.getTopCustomers(startDate, endDate, 10),
  });

  const { data: inventoryReport } = useQuery<ReportApiResult<InventoryReport>>({
    queryKey: ["inventory-report"],
    queryFn: () => reportService.getInventoryReport(),
    enabled: reportType === "inventory",
  });

  const { data: receivablesReport, isLoading: receivablesLoading } = useQuery<
    ReportApiResult<ReceivablesReport>
  >({
    queryKey: ["receivables-report", startDate, endDate],
    queryFn: () => reportService.getReceivablesReport(startDate, endDate),
    enabled: reportType === "receivables",
  });

  const handleExport = async () => {
    try {
      let blob;

      switch (reportType) {
        case "rentals":
          blob = await reportService.exportRentalsReport(startDate, endDate);
          break;

        case "financial":
          blob = await reportService.exportFinancialReport(startDate, endDate);
          break;

        case "rental-items":
          blob = await reportService.exportRentalItemsPeriodsReport(
            startDate,
            endDate,
          );
          break;

        case "invoices":
          blob = await reportService.exportInvoicesGeneratedReport(
            startDate,
            endDate,
            invoiceReportIssuerFilter || undefined,
          );
          break;

        case "maintenance":
          blob = await reportService.exportMaintenanceReport(
            startDate,
            endDate,
          );
          break;

        case "receivables":
          blob = await reportService.exportReceivablesReport(
            startDate,
            endDate,
          );
          break;

        case "inventory":
          blob = await reportService.exportInventoryReport();
          break;
      }

      if (!blob) return;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${reportType}-${Date.now()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar:", error);
    }
  };

  const getBillingStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      paid: "Pago",
      approved: "A receber",
      pending_approval: "Pendente",
      cancelled: "Cancelado",
      draft: "Rascunho",
      sent: "Enviada",
    };
    return labels[status] || status;
  };

  const getRentalTypeLabel = (rentalType: string): string => {
    const labels: Record<string, string> = {
      daily: "Diário",
      weekly: "Semanal",
      biweekly: "Quinzenal",
      monthly: "Mensal",
    };
    return labels[rentalType] || rentalType;
  };

  const sortedInventoryMostUsed = useMemo(() => {
    const rows: InventoryMostUsedRow[] =
      inventoryReport?.data?.mostUsedItems ?? EMPTY_INVENTORY_MOST_USED;
    return sortedTableRows(rows, inventoryMostUsedSort, {
      itemName: (r) => String(r.itemName || "").toLowerCase(),
      quantity: (r) => Number(r.quantity ?? 0),
      totalValue: (r) => Number(r.totalValue ?? 0),
    });
  }, [inventoryReport?.data?.mostUsedItems, inventoryMostUsedSort]);

  const sortedMostRented = useMemo(() => {
    const rows: MostRentedItem[] = mostRentedItems?.data ?? EMPTY_MOST_RENTED;
    return sortedTableRows(rows, mostRentedSort, {
      itemName: (r) => String(r.itemName || "").toLowerCase(),
      rentalCount: (r) => Number(r.rentalCount ?? 0),
      totalRevenue: (r) => Number(r.totalRevenue ?? 0),
    });
  }, [mostRentedItems?.data, mostRentedSort]);

  const sortedInvoicesGenerated = useMemo(() => {
    const rows: GeneratedInvoiceRow[] =
      invoicesGeneratedReport?.data?.invoices ?? EMPTY_GENERATED_INVOICES;
    return sortedTableRows(rows, invoicesGeneratedSort, {
      invoiceNumber: (r) => String(r.invoiceNumber || "").toLowerCase(),
      customerName: (r) => String(r.customerName || "").toLowerCase(),
      issueDate: (r) =>
        r.issueDate ? new Date(r.issueDate).getTime() : 0,
      dueDate: (r) =>
        r.dueDate ? new Date(r.dueDate).getTime() : 0,
      status: (r) => getBillingStatusLabel(r.status).toLowerCase(),
      total: (r) => Number(r.total ?? 0),
    });
  }, [invoicesGeneratedReport?.data?.invoices, invoicesGeneratedSort]);

  const sortedRentalItemsPeriod = useMemo(() => {
    const rows: RentalItemsPeriodRow[] =
      rentalItemsPeriodsReport?.data?.items ?? EMPTY_RENTAL_ITEMS_PERIOD;
    return sortedTableRows(rows, rentalItemsPeriodSort, {
      billingNumber: (r) => String(r.billingNumber || "").toLowerCase(),
      rentalNumber: (r) => String(r.rentalNumber || "").toLowerCase(),
      customerName: (r) => String(r.customerName || "").toLowerCase(),
      itemLine: (r) =>
        `${r.itemName}${r.unitId ? ` (${r.unitId})` : ""}`.toLowerCase(),
      periodStart: (r) =>
        r.periodStart ? new Date(r.periodStart).getTime() : 0,
      rentalType: (r) =>
        getRentalTypeLabel(r.rentalType).toLowerCase(),
      quantity: (r) => Number(r.quantity ?? 0),
      equipmentSituation: (r) =>
        `${r.equipmentSituationSortKey || ""} ${r.equipmentSituationLabel || ""}`.toLowerCase(),
      subtotal: (r) => Number(r.subtotal ?? 0),
    });
  }, [rentalItemsPeriodsReport?.data?.items, rentalItemsPeriodSort]);

  const sortedReceivablesPaid = useMemo(() => {
    const rows: ReceivablesPaidRow[] =
      receivablesReport?.data?.paidInPeriod ?? EMPTY_RECEIVABLES_PAID;
    return sortedTableRows(rows, receivablesPaidSort, {
      kind: (r) => (r.kind === "fechamento" ? "Fechamento" : "Fatura"),
      documentNumber: (r) => String(r.documentNumber || "").toLowerCase(),
      customerName: (r) => String(r.customerName || "").toLowerCase(),
      amount: (r) => Number(r.amount ?? 0),
      paymentDate: (r) =>
        r.paymentDate ? new Date(r.paymentDate).getTime() : 0,
      paymentMethod: (r) => String(r.paymentMethod || "").toLowerCase(),
    });
  }, [receivablesReport?.data?.paidInPeriod, receivablesPaidSort]);

  const sortedReceivablesPending = useMemo(() => {
    const rows: ReceivablesPendingRow[] =
      receivablesReport?.data?.pending ?? EMPTY_RECEIVABLES_PENDING;
    return sortedTableRows(rows, receivablesPendingSort, {
      kind: (r) =>
        r.kind === "fechamento" ? "Fechamento" : "Fatura",
      documentNumber: (r) => String(r.documentNumber || "").toLowerCase(),
      customerName: (r) => String(r.customerName || "").toLowerCase(),
      amount: (r) => Number(r.amount ?? 0),
      dueDate: (r) =>
        r.dueDate ? new Date(r.dueDate).getTime() : 0,
      status: (r) => getBillingStatusLabel(r.status).toLowerCase(),
    });
  }, [receivablesReport?.data?.pending, receivablesPendingSort]);

  const sortedTopCustomers = useMemo(() => {
    const rows: TopCustomer[] = topCustomers?.data ?? EMPTY_TOP_CUSTOMERS;
    return sortedTableRows(rows, topCustomersSort, {
      customerName: (r) => String(r.customerName || "").toLowerCase(),
      rentalCount: (r) => Number(r.rentalCount ?? 0),
      totalSpent: (r) => Number(r.totalSpent ?? 0),
    });
  }, [topCustomers?.data, topCustomersSort]);

  const handleExportPdf = async () => {
    try {
      let blob: Blob | undefined;

      switch (reportType) {
        case "rentals":
          blob = await reportService.exportRentalsReportPdf(startDate, endDate);
          break;
        case "financial":
          blob = await reportService.exportFinancialReportPdf(
            startDate,
            endDate,
          );
          break;
        case "rental-items":
          blob = await reportService.exportRentalItemsPeriodsReportPdf(
            startDate,
            endDate,
          );
          break;
        case "invoices":
          blob = await reportService.exportInvoicesGeneratedReportPdf(
            startDate,
            endDate,
            invoiceReportIssuerFilter || undefined,
          );
          break;
        case "maintenance":
          blob = await reportService.exportMaintenanceReportPdf(
            startDate,
            endDate,
          );
          break;
        case "receivables":
          blob = await reportService.exportReceivablesReportPdf(
            startDate,
            endDate,
          );
          break;
        case "inventory":
          blob = await reportService.exportInventoryReportPdf();
          break;
      }

      if (!blob) return;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${reportType}-${Date.now()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
    }
  };

  return (
    <Layout title="Relatórios" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="app-container py-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Relatórios
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Visualize e exporte relatórios do sistema
            </p>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="app-container py-8">
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="rentals">Aluguéis</option>
                <option value="financial">Financeiro</option>
                <option value="rental-items">
                  Aluguéis por itens/períodos
                </option>
                <option value="invoices">Faturas geradas</option>
                <option value="maintenance">Manutenções</option>
                <option value="inventory">Inventário</option>
                <option value="receivables">
                  Recebíveis (fechamentos e faturas)
                </option>
              </select>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2"
                >
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
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                    />
                  </svg>
                  Exportar Excel
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2"
                >
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
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                  Exportar PDF
                </button>
              </div>
            </div>
            {reportType === "invoices" && (
              <div className="mt-4 max-w-xl">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  CNPJ emissor (filtrar faturas do relatório)
                </label>
                <select
                  value={invoiceReportIssuerFilter}
                  onChange={(e) => setInvoiceReportIssuerFilter(e.target.value)}
                  className="w-full sm:w-auto min-w-[260px] px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">Todos os emissores</option>
                  <option value="legacy">Sem emitente (antigas)</option>
                  {invoiceIssuerRowsForReport.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label} · {formatDocumentForDisplay(row.cnpj)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Inventory Report */}
          {reportType === "inventory" &&inventoryReport?.data &&
            (console.log("Inventory Report Data:", inventoryReport.data),
            (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Total de Itens
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {inventoryReport.data.totalAvailable}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Itens Ativos
                    </h3>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {inventoryReport.data.totalActive}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                      Valor do Patrimônio
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {formatCurrencyBr(inventoryReport.data.totalInventoryValue ?? inventoryReport.data.totalValue)}
                    </p>
                  </div>
                </div>

                {/* Items by Category Chart */}
                {inventoryReport.data.byCategory && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Itens por Categoria
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={inventoryReport.data.byCategory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis
                          dataKey="category"
                          stroke="#6B7280"
                          tick={{ fill: "#6B7280" }}
                        />
                        <YAxis stroke="#6B7280" tick={{ fill: "#6B7280" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1F2937",
                            border: "1px solid #374151",
                            borderRadius: "0.5rem",
                            color: "#F9FAFB",
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="quantity"
                          fill="#6B7280"
                          name="Quantidade"
                        />
                        <Bar dataKey="value" fill="#10B981" name="Valor (R$)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Most Rented / Used Items */}
                {inventoryReport.data.mostUsedItems && (
                  <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                      Itens Mais Movimentados
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                          <tr>
                            <SortableTh<
                              | "itemName"
                              | "quantity"
                              | "totalValue"
                            >
                              columnKey="itemName"
                              label="Item"
                              sort={inventoryMostUsedSort}
                              onSort={(k) =>
                                setInventoryMostUsedSort((p) =>
                                  toggleColumnSort(p, k),
                                )
                              }
                              thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                            />
                            <SortableTh<
                              | "itemName"
                              | "quantity"
                              | "totalValue"
                            >
                              columnKey="quantity"
                              label="Quantidade"
                              sort={inventoryMostUsedSort}
                              onSort={(k) =>
                                setInventoryMostUsedSort((p) =>
                                  toggleColumnSort(p, k),
                                )
                              }
                              thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                            />
                            <SortableTh<
                              | "itemName"
                              | "quantity"
                              | "totalValue"
                            >
                              columnKey="totalValue"
                              label="Valor Total"
                              sort={inventoryMostUsedSort}
                              onSort={(k) =>
                                setInventoryMostUsedSort((p) =>
                                  toggleColumnSort(p, k),
                                )
                              }
                              thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                            />
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {sortedInventoryMostUsed.map((item) => (
                            <tr
                              key={item.itemId}
                              className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {item.itemName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {item.quantity}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                                {formatCurrencyBr(item.totalValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {/* Rentals Report */}
          {reportType === "rentals" && rentalsReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Total de Aluguéis
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {rentalsReport.data.totalRentals}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Receita faturada
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrencyBr(rentalsReport.data.billedRevenue ?? rentalsReport.data.totalRevenue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Contratado:{" "}
                    {formatCurrencyBr(rentalsReport.data.contractedRevenue)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Saldo pendente
                  </h3>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrencyBr(rentalsReport.data.pendingRevenue)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Aluguéis por Mês
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={rentalsReport.data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="month"
                      stroke="#6B7280"
                      tick={{ fill: "#6B7280" }}
                    />
                    <YAxis stroke="#6B7280" tick={{ fill: "#6B7280" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                        color: "#F9FAFB",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="count" fill="#6B7280" name="Quantidade" />
                    <Bar dataKey="contractedRevenue" fill="#9CA3AF" name="Contratado (R$)" />
                    <Bar dataKey="revenue" fill="#10B981" name="Faturado (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {mostRentedItems?.data && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Itens Mais Alugados
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr>
                          <SortableTh<
                            | "itemName"
                            | "rentalCount"
                            | "totalRevenue"
                          >
                            columnKey="itemName"
                            label="Item"
                            sort={mostRentedSort}
                            onSort={(k) =>
                              setMostRentedSort((p) => toggleColumnSort(p, k))
                            }
                            thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                          />
                          <SortableTh<
                            | "itemName"
                            | "rentalCount"
                            | "totalRevenue"
                          >
                            columnKey="rentalCount"
                            label="Aluguéis"
                            sort={mostRentedSort}
                            onSort={(k) =>
                              setMostRentedSort((p) => toggleColumnSort(p, k))
                            }
                            thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                          />
                          <SortableTh<
                            | "itemName"
                            | "rentalCount"
                            | "totalRevenue"
                          >
                            columnKey="totalRevenue"
                            label="Receita"
                            sort={mostRentedSort}
                            onSort={(k) =>
                              setMostRentedSort((p) => toggleColumnSort(p, k))
                            }
                            thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                          />
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {sortedMostRented.map((item) => (
                          <tr
                            key={item.itemId}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {item.itemName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {item.rentalCount}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                              {formatCurrencyBr(item.totalRevenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Financial Report */}
          {reportType === "financial" && financialReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Receitas
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrencyBr(financialReport.data.receivedInPeriod ?? financialReport.data.totalIncome)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Lançamentos recebidos no período
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Despesas
                  </h3>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {formatCurrencyBr(financialReport.data.totalExpenses)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Lucro
                  </h3>
                  <p
                    className={`text-3xl font-bold ${
                      financialReport.data.profit >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatCurrencyBr(financialReport.data.profit)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Fechamentos faturados / pendentes
                  </h3>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {formatCurrencyBr(financialReport.data.billedInPeriod)}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Pendente total: {formatCurrencyBr(financialReport.data.pendingTotal)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Fluxo Financeiro por Mês
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={financialReport.data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="month"
                      stroke="#6B7280"
                      tick={{ fill: "#6B7280" }}
                    />
                    <YAxis stroke="#6B7280" tick={{ fill: "#6B7280" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: "0.5rem",
                        color: "#F9FAFB",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="income"
                      stroke="#6B7280"
                      name="Receitas"
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#10B981"
                      name="Despesas"
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="#F59E0B"
                      name="Lucro"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {reportType === "invoices" && invoicesGeneratedReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Faturas geradas
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {invoicesGeneratedReport.data.totalInvoices}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Valor gerado
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {formatCurrencyBr(invoicesGeneratedReport.data.totalAmount)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-800 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                    Pago
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrencyBr(invoicesGeneratedReport.data.paidAmount)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                    Pendente
                  </h3>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrencyBr(invoicesGeneratedReport.data.pendingAmount)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Faturas emitidas no período
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <SortableTh<
                          | "invoiceNumber"
                          | "customerName"
                          | "issueDate"
                          | "dueDate"
                          | "status"
                          | "total"
                        >
                          columnKey="invoiceNumber"
                          label="Número"
                          sort={invoicesGeneratedSort}
                          onSort={(k) =>
                            setInvoicesGeneratedSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                          Emitente
                        </th>
                        <SortableTh<
                          | "invoiceNumber"
                          | "customerName"
                          | "issueDate"
                          | "dueDate"
                          | "status"
                          | "total"
                        >
                          columnKey="customerName"
                          label="Cliente"
                          sort={invoicesGeneratedSort}
                          onSort={(k) =>
                            setInvoicesGeneratedSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<
                          | "invoiceNumber"
                          | "customerName"
                          | "issueDate"
                          | "dueDate"
                          | "status"
                          | "total"
                        >
                          columnKey="issueDate"
                          label="Emissão"
                          sort={invoicesGeneratedSort}
                          onSort={(k) =>
                            setInvoicesGeneratedSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<
                          | "invoiceNumber"
                          | "customerName"
                          | "issueDate"
                          | "dueDate"
                          | "status"
                          | "total"
                        >
                          columnKey="dueDate"
                          label="Vencimento"
                          sort={invoicesGeneratedSort}
                          onSort={(k) =>
                            setInvoicesGeneratedSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<
                          | "invoiceNumber"
                          | "customerName"
                          | "issueDate"
                          | "dueDate"
                          | "status"
                          | "total"
                        >
                          columnKey="status"
                          label="Status"
                          sort={invoicesGeneratedSort}
                          onSort={(k) =>
                            setInvoicesGeneratedSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<
                          | "invoiceNumber"
                          | "customerName"
                          | "issueDate"
                          | "dueDate"
                          | "status"
                          | "total"
                        >
                          columnKey="total"
                          label="Valor"
                          sort={invoicesGeneratedSort}
                          onSort={(k) =>
                            setInvoicesGeneratedSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          align="right"
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {invoicesGeneratedReport.data.invoices.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-4 py-6 text-sm text-gray-500 text-center"
                          >
                            Nenhuma fatura gerada no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        sortedInvoicesGenerated.map((invoice) => (
                          <tr key={invoice.id}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                              {invoice.invoiceNumber}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              <div>{invoice.issuerLabel?.trim() || "—"}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {invoice.issuerCnpjDisplay?.trim() ||
                                  "sem CNPJ no cadastro"}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {invoice.customerName}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {new Date(invoice.issueDate).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {new Date(invoice.dueDate).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {getBillingStatusLabel(invoice.status)}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                              {formatCurrencyBr(invoice.total)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {reportType === "rental-items" && rentalItemsPeriodsReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Linhas detalhadas
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {rentalItemsPeriodsReport.data.totalLines}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Quantidade
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {rentalItemsPeriodsReport.data.totalQuantity}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Valor dos itens
                  </h3>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrencyBr(rentalItemsPeriodsReport.data.totalAmount)}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Itens por período
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="billingNumber"
                          label="Fechamento"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="rentalNumber"
                          label="Contrato"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="customerName"
                          label="Cliente"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="itemLine"
                          label="Item"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="periodStart"
                          label="Período"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="rentalType"
                          label="Tipo"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="quantity"
                          label="Qtd"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          align="right"
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="equipmentSituation"
                          label="Equipamento"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<RentalItemsPeriodSortKey>
                          columnKey="subtotal"
                          label="Subtotal"
                          sort={rentalItemsPeriodSort}
                          onSort={(k) =>
                            setRentalItemsPeriodSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          align="right"
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {rentalItemsPeriodsReport.data.items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            className="px-4 py-6 text-sm text-gray-500 text-center"
                          >
                            Nenhum item faturado no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        sortedRentalItemsPeriod.map((item, idx) => (
                          <tr key={`${item.billingId}-${idx}`}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                              {item.billingNumber}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {item.rentalNumber || "—"}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {item.customerName}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {item.itemName}
                              {item.unitId ? ` (${item.unitId})` : ""}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {new Date(item.periodStart).toLocaleDateString("pt-BR")}{" "}
                              a {new Date(item.periodEnd).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              {getRentalTypeLabel(item.rentalType)}
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-gray-700 dark:text-gray-300">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-normal max-w-[14rem]">
                              {item.equipmentSituationLabel}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                              {formatCurrencyBr(item.subtotal)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Maintenance Report */}
          {reportType === "maintenance" && maintenanceReport?.data && (
            <div className="space-y-6">
              {/* Cards principais */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Total */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    Total de Manutenções
                  </h3>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    {maintenanceReport.data.totalMaintenances}
                  </p>
                </div>

                {/* Agendadas */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
                    Agendadas
                  </h3>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {maintenanceReport.data.byStatus.scheduled}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatCurrencyBr(maintenanceReport.data.scheduledCost)}
                  </p>
                </div>

                {/* Em andamento */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-yellow-200 dark:border-yellow-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-2">
                    Em Andamento
                  </h3>
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {maintenanceReport.data.byStatus.in_progress}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatCurrencyBr(maintenanceReport.data.inProgressCost)}
                  </p>
                </div>

                {/* Concluídas */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-700 shadow-sm p-6">
                  <h3 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2">
                    Concluídas
                  </h3>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {maintenanceReport.data.byStatus.completed}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatCurrencyBr(maintenanceReport.data.completedCost)}
                  </p>
                </div>
              </div>

              {/* Gráfico */}
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Manutenções por Mês
                </h3>

                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={maintenanceReport.data.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#6B7280" />
                    <YAxis stroke="#6B7280" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#6B7280" name="Quantidade" />
                    <Bar dataKey="cost" fill="#10B981" name="Custo (R$)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Recebíveis — fechamentos e faturas */}
          {reportType === "receivables" && receivablesLoading && (
            <p className="text-center text-gray-600 dark:text-gray-400 py-8">
              Carregando relatório…
            </p>
          )}
          {reportType === "receivables" && receivablesReport?.data && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Fechamentos — recebido no período
                  </p>
                  <p className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
                    R${" "}
                    {receivablesReport.data.summary.fechamento.receivedInPeriod.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {receivablesReport.data.summary.fechamento.paidCountInPeriod}{" "}
                    baixa(s)
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 shadow-sm p-5">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                    Fechamentos — a receber
                  </p>
                  <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
                    R${" "}
                    {receivablesReport.data.summary.fechamento.pendingTotal.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {receivablesReport.data.summary.fechamento.pendingCount}{" "}
                    pendente(s)
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Faturas — recebido no período
                  </p>
                  <p className="mt-2 text-2xl font-bold text-green-600 dark:text-green-400">
                    R${" "}
                    {receivablesReport.data.summary.fatura.receivedInPeriod.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {receivablesReport.data.summary.fatura.paidCountInPeriod}{" "}
                    baixa(s)
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 shadow-sm p-5">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                    Faturas — a receber
                  </p>
                  <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
                    R${" "}
                    {receivablesReport.data.summary.fatura.pendingTotal.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {receivablesReport.data.summary.fatura.pendingCount}{" "}
                    pendente(s)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-emerald-200 dark:border-emerald-800 p-5">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total recebido no período (fechamentos + faturas)
                  </p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    R${" "}
                    {receivablesReport.data.summary.totals.receivedInPeriod.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-900 p-5">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total ainda a receber (pendências)
                  </p>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                    R${" "}
                    {receivablesReport.data.summary.totals.pendingTotal.toLocaleString(
                      "pt-BR",
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      },
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Pagos no período (por data de pagamento)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <SortableTh<ReceivablesPaidSortKey>
                          columnKey="kind"
                          label="Tipo"
                          sort={receivablesPaidSort}
                          onSort={(k) =>
                            setReceivablesPaidSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPaidSortKey>
                          columnKey="documentNumber"
                          label="Documento"
                          sort={receivablesPaidSort}
                          onSort={(k) =>
                            setReceivablesPaidSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPaidSortKey>
                          columnKey="customerName"
                          label="Cliente"
                          sort={receivablesPaidSort}
                          onSort={(k) =>
                            setReceivablesPaidSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPaidSortKey>
                          columnKey="amount"
                          label="Valor"
                          sort={receivablesPaidSort}
                          onSort={(k) =>
                            setReceivablesPaidSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          align="right"
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPaidSortKey>
                          columnKey="paymentDate"
                          label="Pagamento"
                          sort={receivablesPaidSort}
                          onSort={(k) =>
                            setReceivablesPaidSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPaidSortKey>
                          columnKey="paymentMethod"
                          label="Forma"
                          sort={receivablesPaidSort}
                          onSort={(k) =>
                            setReceivablesPaidSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {receivablesReport.data.paidInPeriod.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-sm text-gray-500 text-center"
                          >
                            Nenhum pagamento no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        sortedReceivablesPaid.map((row) => (
                          <tr key={`${row.kind}-${row.id}`}>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                              {row.kind === "fechamento"
                                ? "Fechamento"
                                : "Fatura"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {row.documentNumber}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {row.customerName}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400 whitespace-nowrap">
                              R${" "}
                              {row.amount.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {row.paymentDate
                                ? new Date(row.paymentDate).toLocaleDateString(
                                    "pt-BR",
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {row.paymentMethod ?? "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Pendências (fechamentos aprovados e faturas não pagas)
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <SortableTh<ReceivablesPendingSortKey>
                          columnKey="kind"
                          label="Tipo"
                          sort={receivablesPendingSort}
                          onSort={(k) =>
                            setReceivablesPendingSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPendingSortKey>
                          columnKey="documentNumber"
                          label="Documento"
                          sort={receivablesPendingSort}
                          onSort={(k) =>
                            setReceivablesPendingSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPendingSortKey>
                          columnKey="customerName"
                          label="Cliente"
                          sort={receivablesPendingSort}
                          onSort={(k) =>
                            setReceivablesPendingSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPendingSortKey>
                          columnKey="amount"
                          label="Valor"
                          sort={receivablesPendingSort}
                          onSort={(k) =>
                            setReceivablesPendingSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          align="right"
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPendingSortKey>
                          columnKey="dueDate"
                          label="Vencimento"
                          sort={receivablesPendingSort}
                          onSort={(k) =>
                            setReceivablesPendingSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                        <SortableTh<ReceivablesPendingSortKey>
                          columnKey="status"
                          label="Status"
                          sort={receivablesPendingSort}
                          onSort={(k) =>
                            setReceivablesPendingSort((p) =>
                              toggleColumnSort(p, k),
                            )
                          }
                          thClassName="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase"
                        />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {receivablesReport.data.pending.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="px-4 py-6 text-sm text-gray-500 text-center"
                          >
                            Nenhuma pendência.
                          </td>
                        </tr>
                      ) : (
                        sortedReceivablesPending.map((row) => (
                          <tr key={`${row.kind}-p-${row.id}`}>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap">
                              {row.kind === "fechamento"
                                ? "Fechamento"
                                : "Fatura"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {row.documentNumber}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {row.customerName}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-amber-700 dark:text-amber-400 whitespace-nowrap">
                              R${" "}
                              {row.amount.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {row.dueDate
                                ? new Date(row.dueDate).toLocaleDateString(
                                    "pt-BR",
                                  )
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {getBillingStatusLabel(row.status)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Top Customers */}
          {topCustomers?.data && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Top Clientes
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <SortableTh<TopCustomersSortKey>
                        columnKey="customerName"
                        label="Cliente"
                        sort={topCustomersSort}
                        onSort={(k) =>
                          setTopCustomersSort((p) => toggleColumnSort(p, k))
                        }
                        thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<TopCustomersSortKey>
                        columnKey="rentalCount"
                        label="Aluguéis"
                        sort={topCustomersSort}
                        onSort={(k) =>
                          setTopCustomersSort((p) => toggleColumnSort(p, k))
                        }
                        thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<TopCustomersSortKey>
                        columnKey="totalSpent"
                        label="Total Gasto"
                        sort={topCustomersSort}
                        onSort={(k) =>
                          setTopCustomersSort((p) => toggleColumnSort(p, k))
                        }
                        thClassName="px-6 py-3 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedTopCustomers.map((customer) => (
                      <tr
                        key={customer.customerId}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {customer.customerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                          {customer.rentalCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                          {formatCurrencyBr(customer.totalSpent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ReportsPage;
