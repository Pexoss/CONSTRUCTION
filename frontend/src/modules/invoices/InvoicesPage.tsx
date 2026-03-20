import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { invoiceService } from "./invoice.service";
import { InvoiceFilters, InvoiceStatus } from "../../types/invoice.types";
import Layout from "../../components/Layout";

const InvoicesPage: React.FC = () => {
  const [filters] = useState<InvoiceFilters>({
    page: 1,
    limit: 20,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", filters],
    queryFn: () => invoiceService.getInvoices(filters),
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
    },
  });

  const getStatusColor = (status: InvoiceStatus) => {
    const colors = {
      draft: "bg-gray-100 text-gray-800",
      sent: "bg-blue-100 text-blue-800",
      paid: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
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

  // 🟢 Formatar data
  const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getInvoicePeriod = (invoice: any) => {
    if (!invoice?.issueDate) return "-";

    const start = new Date(invoice.issueDate);
    const end = invoice?.dueDate ? new Date(invoice.dueDate) : null;

    return `${start.toLocaleDateString()} ${
      end ? `→ ${end.toLocaleDateString()}` : ""
    }`;
  };
  // 🟢 Resumo de itens
  const getItemsSummary = (items: any[]) => {
    if (!items?.length) return "0 itens";

    const total = items.length;
    return `${total} item${total > 1 ? "s" : ""}`;
  };

  if (isLoading) {
    return (
      <Layout title="Faturas" backTo="/dashboard">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600">Carregando faturas...</div>
        </div>
      </Layout>
    );
  }

  const invoices = data?.data || [];
  const pagination = data?.pagination;

  return (
    <Layout title="Faturas" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Faturas
            </h1>
          </div>
        </div>

        {/* Lista */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Gerado em
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Itens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {invoices.map((invoice: any) => {
                  const customer =
                    typeof invoice.customerId === "object"
                      ? invoice.customerId
                      : null;

                  return (
                    <tr
                      key={invoice._id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      {/* Número */}
                      <td className="px-6 py-4">
                        <span className="text-sm font-mono font-medium">
                          {invoice.invoiceNumber || invoice.rentalNumber}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="px-6 py-4">
                        <span className="text-sm">
                          {customer?.name || "Cliente"}
                        </span>
                      </td>

                      {/* Período */}
                      <td className="px-6 py-4 text-sm">
                        {new Date(invoice.createdAt).toLocaleDateString(
                          "pt-BR",
                        )}
                      </td>
                      {/* Itens */}
                      <td className="px-6 py-4 text-sm">
                        {getItemsSummary(invoice.items)}
                      </td>

                      {/* Valor */}
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium">
                          R$ {invoice.total?.toFixed(2) || "0.00"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <span
                          className={`px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusColor(
                            invoice.status,
                          )}`}
                        >
                          {getStatusLabel(invoice.status)}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          {/* PDF */}
                          <button
                            onClick={() =>
                              downloadPDFMutation.mutate(invoice._id)
                            }
                            className="relative group p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                          >
                            {/* Ícone download */}
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
                                d="M12 3v12m0 0l-4-4m4 4l4-4m-9 8h10"
                              />
                            </svg>

                            {/* Tooltip */}
                            <span className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                              Baixar PDF
                            </span>
                          </button>

                          {/* Ver */}
                          <Link
                            to={`/invoiceDetails/${invoice._id}`}
                            className="relative group p-2 border rounded-lg hover:bg-gray-50 transition"
                          >
                            {/* Ícone olho */}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="w-4 h-4 text-gray-700"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-.001.003-.002.005-.003.008-.001.003-.002.005-.003.008C20.263 16.057 16.472 19 12 19c-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>

                            {/* Tooltip */}
                            <span className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                              Ver fatura
                            </span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default InvoicesPage;
