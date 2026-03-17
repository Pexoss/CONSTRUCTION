import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import Skeleton from "../../components/Skeleton";
import { billingService } from "./billing.service";
import { customerService } from "../customers/customer.service";
import { Billing, BillingStatus } from "../../types/billing.types";
import { useAuth } from "../../hooks/useAuth";
import { toast } from "react-toastify";

const BillingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = ["admin", "superadmin"].includes(user?.role || "");

  const [status, setStatus] = useState<BillingStatus | "">("");
  const [customerId, setCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [showPaidModal, setShowPaidModal] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<Billing | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentDiscount, setPaymentDiscount] = useState("");
  const [paymentDiscountReason, setPaymentDiscountReason] = useState("");

  const { data: customersData } = useQuery({
    queryKey: ["customers", "billing-list"],
    queryFn: () => customerService.getCustomers({ limit: 200 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "billings",
      { status, customerId, startDate, endDate, page, limit },
    ],
    queryFn: () =>
      billingService.getBillings({
        status: status || undefined,
        customerId: customerId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      }),
  });

  const markAsPaidMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      paymentMethod: string;
      paymentDate?: string;
      discount?: number;
      discountReason?: string;
    }) =>
      billingService.markAsPaid(payload.id, {
        paymentMethod: payload.paymentMethod,
        paymentDate: payload.paymentDate,
        discount: payload.discount,
        discountReason: payload.discountReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billings"] });
      toast.success("Fechamento marcado como recebido.");
      setShowPaidModal(false);
      setSelectedBilling(null);
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message || "Erro ao marcar como recebido";
      toast.error(message);
    },
  });

  const billings = (data?.data?.billings || []) as Billing[];
  const total = data?.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const filteredBillings = useMemo(() => {
    if (!onlyOverdue) return billings;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return billings.filter((billing) => {
      const billingDate = new Date(billing.billingDate);
      const isOpen = !["paid", "cancelled"].includes(billing.status);
      return isOpen && billingDate < today;
    });
  }, [billings, onlyOverdue]);

  const handleWeekFilter = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(now.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    setStartDate(weekStart.toISOString().split("T")[0]);
    setEndDate(weekEnd.toISOString().split("T")[0]);
    setPage(1);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  const formatCurrency = (value?: number) =>
    (value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const handleDownloadPDF = async (billingId: string) => {
    const blob = await billingService.generateBillingPDF(billingId);
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fechamento-${billingId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Fechamentos" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                onlyOverdue
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
              onClick={() => setOnlyOverdue((prev) => !prev)}
            >
              Vencidos
            </button>
            <button
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700"
              onClick={handleWeekFilter}
            >
              Semana atual
            </button>
            <button
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700"
              onClick={() => {
                setStatus("");
                setCustomerId("");
                setStartDate("");
                setEndDate("");
                setOnlyOverdue(false);
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as BillingStatus | "");
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Todos</option>
                  <option value="draft">Fechamento previsto</option>
                  <option value="pending_approval">Pendente</option>
                  <option value="approved">A receber</option>
                  <option value="paid">Pago</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Cliente
                </label>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Todos</option>
                  {(customersData?.data || []).map((customer) => (
                    <option key={customer._id} value={customer._id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Início
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Fim
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="w-full h-48" />
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Equipamentos
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Cliente
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Período
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Cobrança
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredBillings.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400"
                          colSpan={7}
                        >
                          Nenhum fechamento encontrado.
                        </td>
                      </tr>
                    ) : (
                      filteredBillings.map((billing) => (
                        <tr key={billing._id}>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                            {billing.items && billing.items.length > 0
                              ? billing.items
                                  .map((item) =>
                                    typeof item.itemId === "object"
                                      ? item.itemId.name || "Item"
                                      : "Item",
                                  )
                                  .join(", ")
                              : "Sem itens"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                            {typeof billing.customerId === "object"
                              ? billing.customerId.name || "Cliente"
                              : "Cliente"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(billing.periodStart)} →{" "}
                            {formatDate(billing.periodEnd)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(billing.billingDate)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {billing.status === "paid"
                              ? "Pago"
                              : billing.status === "approved"
                                ? "A receber"
                                : billing.status === "pending_approval"
                                  ? "Pendente"
                                  : billing.status === "cancelled"
                                    ? "Cancelado"
                                    : "Fechamento previsto"}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                            {formatCurrency(billing.calculation?.total)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <button
                              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mr-3"
                              onClick={() => handleDownloadPDF(billing._id)}
                            >
                              PDF
                            </button>
                            {isAdmin && billing.status === "approved" && (
                              <button
                                className="text-green-700 hover:text-green-800"
                                onClick={() => {
                                  setSelectedBilling(billing);
                                  setPaymentDate(
                                    new Date().toISOString().split("T")[0],
                                  );
                                setPaymentDiscount("");
                                setPaymentDiscountReason("");
                                  setShowPaidModal(true);
                                }}
                              >
                                Dar baixa
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mt-4 text-sm text-gray-600 dark:text-gray-400">
            <span>
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 border rounded"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                className="px-3 py-1 border rounded"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPaidModal && selectedBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500/75 dark:bg-gray-900/75">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Dar baixa no recebimento
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Método de pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao">Cartão</option>
                  <option value="transferencia">Transferência</option>
                  <option value="boleto">Boleto</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Data do recebimento
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Desconto (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentDiscount}
                  onChange={(e) => setPaymentDiscount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  Motivo do desconto
                </label>
                <input
                  type="text"
                  value={paymentDiscountReason}
                  onChange={(e) => setPaymentDiscountReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 border rounded"
                onClick={() => {
                  setShowPaidModal(false);
                  setSelectedBilling(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="px-4 py-2 bg-gray-900 text-white rounded"
                onClick={() =>
                  markAsPaidMutation.mutate({
                    id: selectedBilling._id,
                    paymentMethod,
                    paymentDate: paymentDate
                      ? new Date(paymentDate).toISOString()
                      : undefined,
                      discount:
                        paymentDiscount.trim() === ""
                          ? undefined
                          : Number(paymentDiscount),
                      discountReason: paymentDiscountReason.trim() || undefined,
                  })
                }
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default BillingsPage;
