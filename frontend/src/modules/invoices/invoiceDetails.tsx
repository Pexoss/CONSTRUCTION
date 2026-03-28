import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceService } from "./invoice.service";
import Layout from "../../components/Layout";
import { toast } from "react-toastify";

const InvoiceDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoiceService.getInvoiceById(id!),
    enabled: !!id,
  });

  const invoice = data?.data;

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
      toast.error("Erro ao gerar PDF");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      invoiceService.updateInvoiceStatus(id!, status as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success("Status atualizado com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    },
  });

  // Utilitários de formatação
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };

  const formatDate = (date: string) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      cancelled:
        "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };

    const labels = {
      draft: "📝 Rascunho",
      sent: "📤 Enviada",
      paid: "✅ Paga",
      cancelled: "❌ Cancelada",
    };

    return {
      style: (styles as any)[status] || styles.draft,
      label: (labels as any)[status] || "Desconhecido",
    };
  };

  const getDaysUntilDue = (dueDate: string) => {
    if (!dueDate) return null;
    const now = new Date();
    const due = new Date(dueDate);
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (isLoading) {
    return (
      <Layout title="Fatura" backTo="/invoices">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-600 dark:text-gray-400">
            Carregando fatura...
          </div>
        </div>
      </Layout>
    );
  }

  if (isError || !invoice) {
    return (
      <Layout title="Fatura" backTo="/invoices">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            Erro ao carregar fatura
          </div>
        </div>
      </Layout>
    );
  }

  const customer =
    typeof invoice.customerId === "object" ? invoice.customerId : null;
  const rental =
    typeof invoice.rentalId === "object" ? invoice.rentalId : null;
  const daysUntilDue = getDaysUntilDue(invoice.dueDate);
  const statusBadge = getStatusBadge(invoice.status);
  const isOverdue =
    daysUntilDue !== null &&
    daysUntilDue < 0 &&
    invoice.status !== "paid" &&
    invoice.status !== "cancelled";

  return (
    <Layout title={`Fatura ${invoice.invoiceNumber}`} backTo="/invoices">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* TOP BAR */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {invoice.invoiceNumber}
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Emitida em {formatDate(invoice.issueDate)}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <button
                  onClick={() => downloadPDFMutation.mutate(invoice._id)}
                  disabled={downloadPDFMutation.isPending}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition disabled:opacity-50 font-medium text-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  {downloadPDFMutation.isPending ? "Gerando..." : "PDF"}
                </button>

                {invoice.status !== "paid" && invoice.status !== "cancelled" && (
                  <button
                    onClick={() => updateStatusMutation.mutate("paid")}
                    disabled={updateStatusMutation.isPending}
                    className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition disabled:opacity-50 font-medium text-sm"
                  >
                    {updateStatusMutation.isPending
                      ? "Processando..."
                      : "Marcar como Paga"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CONTEÚDO PRINCIPAL */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ALERTA DE ATRASO */}
          {isOverdue && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-red-600 dark:text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">
                  Fatura Atrasada
                </p>
                <p className="text-sm text-red-700 dark:text-red-400">
                  Vencida há {Math.abs(daysUntilDue!)} dia(s)
                </p>
              </div>
            </div>
          )}

          {/* GRID 2 COLUNAS */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* EMITENTE */}
            <div className="md:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-4">
                  De
                </h3>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    Sistema de Locação
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Contato: suporte@sistema.com
                  </p>
                </div>
              </div>
            </div>

            {/* CLIENTE */}
            <div className="md:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-4">
                  Cliente
                </h3>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {customer?.name || "—"}
                  </p>
                  {customer?.email && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {customer.email}
                    </p>
                  )}
                  {customer?.phone && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {customer.phone}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* STATUS */}
            <div className="md:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-4">
                  Status
                </h3>
                <div className="space-y-3">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${statusBadge.style}`}
                  >
                    {statusBadge.label}
                  </div>
                  {daysUntilDue !== null && invoice.status !== "paid" && (
                    <p
                      className={`text-sm ${
                        isOverdue
                          ? "text-red-600 dark:text-red-400 font-semibold"
                          : "text-orange-600 dark:text-orange-400"
                      }`}
                    >
                      {isOverdue
                        ? `Atrasada por ${Math.abs(daysUntilDue)} dias`
                        : `Vence em ${daysUntilDue} dias`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* DATAS */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                Data de Emissão
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatDate(invoice.issueDate)}
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                Data de Vencimento
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {formatDate(invoice.dueDate)}
              </p>
            </div>

            {invoice.paidDate && invoice.status === "paid" && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 p-6">
                <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">
                  Data de Pagamento
                </p>
                <p className="text-lg font-semibold text-green-700 dark:text-green-300">
                  {formatDate(invoice.paidDate)}
                </p>
              </div>
            )}
          </div>

          {/* ALUGUEL RELACIONADO */}
          {rental && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-8">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                📝 Aluguel Relacionado
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Número:</strong> {rental.rentalNumber || rental._id}
              </p>
            </div>
          )}

          {/* ITENS - TABELA */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Itens
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Descrição
                    </th>
                    <th className="text-right py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Quantidade
                    </th>
                    <th className="text-right py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Valor Unit.
                    </th>
                    <th className="text-right py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {invoice.items.map((item: any, index: number) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 text-gray-900 dark:text-white">
                        {item.description || "Item"}
                      </td>
                      <td className="text-right py-3 text-gray-600 dark:text-gray-400">
                        {item.quantity || 1}
                      </td>
                      <td className="text-right py-3 text-gray-600 dark:text-gray-400">
                        {formatCurrency(item.unitPrice || 0)}
                      </td>
                      <td className="text-right py-3 font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(item.total || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RESUMO FINANCEIRO */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="md:col-span-2"></div>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    Subtotal
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(invoice.subtotal)}
                  </span>
                </div>

                {invoice.tax && invoice.tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      Taxa / Impostos
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(invoice.tax)}
                    </span>
                  </div>
                )}

                {invoice.discount && invoice.discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600 dark:text-green-400">
                      Desconto
                    </span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      -{formatCurrency(invoice.discount)}
                    </span>
                  </div>
                )}

                <div className="border-t border-gray-300 dark:border-gray-600 pt-3 flex justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Total
                  </span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(invoice.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* NOTAS E TERMOS */}
          {(invoice.notes || invoice.terms) && (
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {invoice.notes && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                    Notas
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {invoice.notes}
                  </p>
                </div>
              )}

              {invoice.terms && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                    Condições
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {invoice.terms}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* FOOTER */}
          <div className="text-center text-xs text-gray-600 dark:text-gray-400 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p>
              Sistema de Locação • ID da Fatura: {invoice._id}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default InvoiceDetails;