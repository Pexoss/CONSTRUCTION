import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { invoiceService } from "./invoice.service";
import { InvoiceFilters, InvoiceStatus } from "../../types/invoice.types";
import Layout from "../../components/Layout";
import { toast } from "react-toastify";
import {
  FileText,
  Send,
  CheckCircle,
  XCircle,
  BarChart3,
  DollarSign,
  Clock,
  PlusCircle,
} from "lucide-react";
import { invoiceStatusLabel } from "../../utils/statusLabels";
import SortableTh from "../../components/SortableTh";
import { formatDocumentForDisplay, formatCurrencyBr } from "../../utils/formatters";
import { companyService } from "../company/company.service";
import {
  ColumnSort,
  sortedTableRows,
  toggleColumnSort,
} from "../../utils/tableSort";

type InvoiceSortKey =
  | "number"
  | "emitter"
  | "customer"
  | "issue"
  | "due"
  | "total"
  | "status";
const InvoicesPage: React.FC = () => {
  const [filters, setFilters] = useState<InvoiceFilters>({
    page: 1,
    limit: 20,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [invSort, setInvSort] = useState<ColumnSort<InvoiceSortKey> | null>({
    key: "issue",
    dir: "desc",
  });

  const { data: invoiceIssuerFilterOptions = [] } = useQuery({
    queryKey: ["company-invoice-issuers-invoices-page"],
    queryFn: () => companyService.getInvoiceIssuers(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", filters, statusFilter],
    queryFn: () =>
      invoiceService.getInvoices({
        ...filters,
        status: statusFilter || undefined,
      }),
  });

  const downloadPDFMutation = useMutation({
    mutationFn: (id: string) => invoiceService.generateInvoicePDF(id),
    onSuccess: (blob, id) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("PDF baixado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao baixar PDF");
    },
  });

  const getStatusColor = (status: InvoiceStatus) => {
    const colors = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return colors[status];
  };

  const getStatusLabel = (status: InvoiceStatus) => {
    return invoiceStatusLabel[status] || status;
  };

  const getStatusIcon = (status: InvoiceStatus) => {
    const icons = {
      draft: <FileText size={16} />,
      sent: <Send size={16} />,
      paid: <CheckCircle size={16} />,
      cancelled: <XCircle size={16} />,
    };

    return icons[status];
  };
  // Formatação de datas
  const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getDaysUntilDue = (dueDate: string) => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    const diff = Math.ceil(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    return diff;
  };

  // Calcular totalizadores
  const calculateTotals = (invoiceList: any[]) => {
    return {
      total: invoiceList.reduce((sum, inv) => sum + (inv.total || 0), 0),
      paid: invoiceList
        .filter((inv) => inv.status === "paid")
        .reduce((sum, inv) => sum + (inv.total || 0), 0),
      pending: invoiceList
        .filter((inv) => inv.status !== "paid" && inv.status !== "cancelled")
        .reduce((sum, inv) => sum + (inv.total || 0), 0),
      canceled: invoiceList
        .filter((inv) => inv.status === "cancelled")
        .reduce((sum, inv) => sum + (inv.total || 0), 0),
    };
  };

  const invoices = useMemo(() => data?.data || [], [data?.data]);
  const pagination = data?.pagination;
  const totals = calculateTotals(invoices);

  const filteredInvoices = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return invoices.filter((invoice: any) => {
      return (
        invoice.invoiceNumber?.toLowerCase().includes(searchLower) ||
        (typeof invoice.customerId === "object" &&
          invoice.customerId?.name?.toLowerCase().includes(searchLower))
      );
    });
  }, [invoices, searchTerm]);

  const sortedInvoiceRows = useMemo(
    () =>
      sortedTableRows(filteredInvoices, invSort, {
        number: (i: any) => String(i.invoiceNumber ?? "").toLowerCase(),
        emitter: (i: any) =>
          `${i.issuerLabel || ""} ${i.issuerCnpj || ""}`
            .trim()
            .toLowerCase(),
        customer: (i: any) =>
          String(
            typeof i.customerId === "object"
              ? i.customerId?.name || ""
              : "",
          ).toLowerCase(),
        issue: (i: any) =>
          i.issueDate ? new Date(i.issueDate).getTime() : 0,
        due: (i: any) => (i.dueDate ? new Date(i.dueDate).getTime() : 0),
        total: (i: any) => Number(i.total ?? 0),
        status: (i: any) =>
          String(invoiceStatusLabel[i.status] || i.status || ""),
      }),
    [filteredInvoices, invSort],
  );

  const handleInvoiceSort = (key: InvoiceSortKey) =>
    setInvSort((prev) => toggleColumnSort(prev, key));

  if (isLoading) {
    return (
      <Layout title="Faturas" backTo="/dashboard">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600 dark:text-gray-400">
            Carregando faturas...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Faturas" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="app-container py-6">
            <div className="flex justify-between items-start gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Faturas
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Gerencie todas as faturas emitidas
                </p>
              </div>
              <Link
                to="/invoices/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
              >
                <PlusCircle className="w-5 h-5" />
                Nova fatura
              </Link>
            </div>
          </div>
        </div>

        {/* KPIs */}
        {/* KPIs */}
        <div className="app-container py-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {/* Total de Faturas */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    Total de Faturas
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {invoices.length}
                  </p>
                </div>
                <BarChart3 className="w-7 h-7 text-gray-500" />
              </div>
            </div>

            {/* Valor Total */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    Valor Total
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatCurrencyBr(totals.total)}
                  </p>
                </div>
                <DollarSign className="w-7 h-7 text-green-500" />
              </div>
            </div>

            {/* Pendentes */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    Pendentes
                  </p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                    {formatCurrencyBr(totals.pending)}
                  </p>
                </div>
                <Clock className="w-7 h-7 text-orange-500" />
              </div>
            </div>

            {/* Pagas */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    Pagas
                  </p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {formatCurrencyBr(totals.paid)}
                  </p>
                </div>
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Filtros e Busca */}
        <div className="app-container py-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Buscar por nº da fatura ou cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as InvoiceStatus | "")
                }
                className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              >
                <option value="">Todos os Status</option>
                <option value="draft">Rascunho</option>
                <option value="sent">Enviada</option>
                <option value="paid">Paga</option>
                <option value="cancelled">Cancelada</option>
              </select>
              <select
                value={filters.billingIssuerId || ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    page: 1,
                    billingIssuerId: e.target.value || undefined,
                  }))
                }
                className="px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm min-w-[200px]"
              >
                <option value="">CNPJ emitente · todos</option>
                <option value="legacy">Sem emitente (antigas)</option>
                {invoiceIssuerFilterOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} · {formatDocumentForDisplay(row.cnpj)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="app-container py-6">
          {filteredInvoices.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nenhuma fatura encontrada
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchTerm || statusFilter || filters.billingIssuerId
                  ? "Tente ajustar seus filtros"
                  : "Comece criando uma nova fatura a partir dos fechamentos."}
              </p>
              {!searchTerm && !statusFilter && !filters.billingIssuerId && (
                <Link
                  to="/invoices/new"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  <PlusCircle className="w-4 h-4" />
                  Nova fatura
                </Link>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <SortableTh<InvoiceSortKey>
                        columnKey="number"
                        label="Número"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<InvoiceSortKey>
                        columnKey="emitter"
                        label="Emitente (CNPJ)"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<InvoiceSortKey>
                        columnKey="customer"
                        label="Cliente"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<InvoiceSortKey>
                        columnKey="issue"
                        label="Emissão"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<InvoiceSortKey>
                        columnKey="due"
                        label="Vencimento"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<InvoiceSortKey>
                        columnKey="total"
                        label="Valor"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <SortableTh<InvoiceSortKey>
                        columnKey="status"
                        label="Status"
                        sort={invSort}
                        onSort={handleInvoiceSort}
                        thClassName="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
                      />
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {sortedInvoiceRows.map((invoice: any) => {
                      const customer =
                        typeof invoice.customerId === "object"
                          ? invoice.customerId
                          : null;
                      const daysUntilDue = getDaysUntilDue(invoice.dueDate);
                      const isOverdue =
                        daysUntilDue !== null &&
                        daysUntilDue < 0 &&
                        invoice.status !== "paid";

                      return (
                        <tr
                          key={invoice._id}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          {/* Número */}
                          <td className="px-6 py-4">
                            <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                              {invoice.invoiceNumber}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            {invoice.issuerLabel || invoice.issuerCnpj ? (
                              <div>
                                <div className="text-sm text-gray-900 dark:text-white">
                                  {invoice.issuerLabel || "—"}
                                </div>
                                {invoice.issuerCnpj ? (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {formatDocumentForDisplay(invoice.issuerCnpj)}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Antigo / não definido</span>
                            )}
                          </td>

                          {/* Cliente */}
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              {customer?.name || "—"}
                            </span>
                          </td>

                          {/* Emissão */}
                          <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(invoice.issueDate)}
                          </td>

                          {/* Vencimento */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {formatDate(invoice.dueDate)}
                              </span>
                              {isOverdue && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                  Atrasada
                                </span>
                              )}
                              {daysUntilDue !== null &&
                                daysUntilDue >= 0 &&
                                daysUntilDue <= 7 &&
                                invoice.status !== "paid" && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                                    Próximo
                                  </span>
                                )}
                            </div>
                          </td>

                          {/* Valor */}
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {formatCurrencyBr(invoice.total)}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(
                                invoice.status,
                              )}`}
                            >
                              <span>{getStatusIcon(invoice.status)}</span>
                              {getStatusLabel(invoice.status)}
                            </span>
                          </td>

                          {/* Ações */}
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() =>
                                  downloadPDFMutation.mutate(invoice._id)
                                }
                                disabled={downloadPDFMutation.isPending}
                                className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition disabled:opacity-50"
                                title="Baixar PDF"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                  />
                                </svg>
                              </button>

                              <Link
                                to={`/invoiceDetails/${invoice._id}`}
                                className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                                title="Ver detalhes"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {pagination && pagination.totalPages > 1 && (
                <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Página {pagination.page} de {pagination.totalPages} (
                    {pagination.total} faturas no total)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          page: Math.max(1, f.page! - 1),
                        }))
                      }
                      disabled={pagination.page === 1}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          page: Math.min(pagination.totalPages, f.page! + 1),
                        }))
                      }
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default InvoicesPage;
