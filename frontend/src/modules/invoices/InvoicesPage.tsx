import React, { useState } from "react";
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
} from "lucide-react";

const InvoicesPage: React.FC = () => {
  const [filters, setFilters] = useState<InvoiceFilters>({
    page: 1,
    limit: 20,
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");

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
    const labels = {
      draft: "Rascunho",
      sent: "Enviada",
      paid: "Paga",
      cancelled: "Cancelada",
    };
    return labels[status];
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
  // Formatação de valores
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };

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

  const getItemsSummary = (items: any[]) => {
    if (!items?.length) return "0 itens";
    const total = items.length;
    return `${total} item${total > 1 ? "s" : ""}`;
  };

  // Calcular totalizadores
  const calculateTotals = (invoices: any[]) => {
    return {
      total: invoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
      paid: invoices
        .filter((inv) => inv.status === "paid")
        .reduce((sum, inv) => sum + (inv.total || 0), 0),
      pending: invoices
        .filter((inv) => inv.status !== "paid" && inv.status !== "cancelled")
        .reduce((sum, inv) => sum + (inv.total || 0), 0),
      canceled: invoices
        .filter((inv) => inv.status === "cancelled")
        .reduce((sum, inv) => sum + (inv.total || 0), 0),
    };
  };

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

  const invoices = data?.data || [];
  const pagination = data?.pagination;
  const totals = calculateTotals(invoices);

  // Filtrar por termo de busca
  const filteredInvoices = invoices.filter((invoice: any) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      invoice.invoiceNumber?.toLowerCase().includes(searchLower) ||
      (typeof invoice.customerId === "object" &&
        invoice.customerId?.name?.toLowerCase().includes(searchLower))
    );
  });

  return (
    <Layout title="Faturas" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Faturas
                </h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Gerencie todas as faturas emitidas
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        {/* KPIs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                    {formatCurrency(totals.total)}
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
                    {formatCurrency(totals.pending)}
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
                    {formatCurrency(totals.paid)}
                  </p>
                </div>
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Filtros e Busca */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {filteredInvoices.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Nenhuma fatura encontrada
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchTerm || statusFilter
                  ? "Tente ajustar seus filtros"
                  : "Comece criando uma nova fatura"}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Número
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Cliente
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Emissão
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Vencimento
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Valor
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Ações
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredInvoices.map((invoice: any) => {
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
                              {formatCurrency(invoice.total)}
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
