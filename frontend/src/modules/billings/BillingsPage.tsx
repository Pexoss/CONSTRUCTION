import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import Skeleton from "../../components/Skeleton";
import { billingService } from "./billing.service";
import { customerService } from "../customers/customer.service";
import { Billing, BillingStatus } from "../../types/billing.types";
import { useAuth } from "../../hooks/useAuth";
import { toast } from "react-toastify";
import { billingStatusLabel } from "../../utils/statusLabels";

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
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDiscount, setPaymentDiscount] = useState("");
  const [paymentDiscountReason, setPaymentDiscountReason] = useState("");

  const { data: customersData } = useQuery({
    queryKey: ["customers", "billing-list"],
    queryFn: () => customerService.getCustomers({ limit: 200 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: [
      "billings",
      { status, customerId, startDate, endDate, onlyOverdue, page, limit },
    ],
    queryFn: () =>
      billingService.getBillings({
        status: status || undefined,
        customerId: customerId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        onlyOverdue,
        page,
        limit,
      }),
  });

  const syncMissingMutation = useMutation({
    mutationFn: () => billingService.syncMissingRentals(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["billings"] });
      const d = res?.data;
      if (d && d.rentalsProcessed > 0) {
        toast.success(
          `Sincronizado: ${d.rentalsProcessed} aluguel(is), ${d.created} fechamento(s) criado(s).`,
        );
      } else {
        toast.info("Nenhum aluguel em aberto sem fechamento encontrado.");
      }
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message || "Erro ao gerar fechamentos em falta";
      toast.error(message);
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      paymentMethod: string;
      paymentDate?: string;
      amount?: number;
      discount?: number;
      discountReason?: string;
    }) =>
      billingService.markAsPaid(payload.id, {
        paymentMethod: payload.paymentMethod,
        paymentDate: payload.paymentDate,
        amount: payload.amount,
        discount: payload.discount,
        discountReason: payload.discountReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billings"] });
      toast.success("Fechamento marcado como recebido.");
      setShowPaidModal(false);
      setSelectedBilling(null);
      setPaymentAmount("");
    },
    onError: (err: any) => {
      const message =
        err.response?.data?.message || "Erro ao marcar como recebido";
      toast.error(message);
    },
  });

  const billings = useMemo(() => (data?.data?.billings || []) as Billing[], [data?.data?.billings]);
  const total = data?.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleWeekFilter = () => {
    const now = new Date();
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diff);
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

  const billingOriginLabel = (notes?: string) => {
    const text = (notes || "").toLowerCase();
    if (text.includes("devolução parcial")) return "Devolução parcial";
    if (text.includes("devolução")) return "Devolução";
    if (text.includes("mudança de tipo") || text.includes("alteração de tipo"))
      return "Mudança de tipo";
    return "";
  };

  const collectionBadge = (billing: Billing) => {
    const total = Number(billing.calculation?.total || 0);
    const outstanding = Number(billing.outstandingAmount ?? total);
    if (billing.status === "paid" || outstanding <= 0) return "Pago";
    if (outstanding < total) return "Parcial";
    return "A receber";
  };

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
              onClick={() => {
                setOnlyOverdue((prev) => !prev);
                setPage(1);
              }}
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
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-50"
              disabled={syncMissingMutation.isPending}
              onClick={() => syncMissingMutation.mutate()}
            >
              {syncMissingMutation.isPending
                ? "Gerando…"
                : "Gerar fechamentos em falta"}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Saldo em aberto
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {billings.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400"
                          colSpan={8}
                        >
                          Nenhum fechamento encontrado.
                        </td>
                      </tr>
                    ) : (
                      billings.map((billing) => (
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
                            {billingOriginLabel(billing.notes) && (
                              <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                                {billingOriginLabel(billing.notes)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {formatDate(billing.billingDate)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                              <span>{billingStatusLabel[billing.status] || "Fechamento"}</span>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                                collectionBadge(billing) === "Pago"
                                  ? "bg-green-100 text-green-800"
                                  : collectionBadge(billing) === "Parcial"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-800"
                              }`}>
                                {collectionBadge(billing)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                            {formatCurrency(billing.calculation?.total)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                            {formatCurrency(
                              Number(
                                billing.outstandingAmount ??
                                  billing.calculation?.total ??
                                  0,
                              ),
                            )}
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
                                  setPaymentAmount(
                                    String(
                                      Number(
                                        billing.outstandingAmount ??
                                          billing.calculation?.total ??
                                          0,
                                      ).toFixed(2),
                                    ),
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
                  Valor recebido (R$)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Em aberto: {formatCurrency(
                    Number(
                      selectedBilling.outstandingAmount ??
                        selectedBilling.calculation?.total ??
                        0,
                    ),
                  )}
                </p>
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
                  setPaymentAmount("");
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
                      amount:
                        paymentAmount.trim() === ""
                          ? undefined
                          : Number(paymentAmount),
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
