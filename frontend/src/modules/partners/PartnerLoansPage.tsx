import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { partnerService } from "./partner.service";
import {
  Partner,
  PartnerLoan,
  PartnerLoanStatus,
} from "../../types/partner.types";
import { formatCurrencyBr } from "../../utils/formatters";
import { toast } from "react-toastify";
import { useAuth } from "../../hooks/useAuth";

const statusLabel: Record<PartnerLoanStatus, string> = {
  with_customer: "Com cliente",
  awaiting_partner_return: "Aguardando devolução ao parceiro",
  returned_to_partner: "Devolvido ao parceiro",
  cancelled: "Cancelado",
};

const PartnerLoansPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin =
    user?.role === "admin" || user?.role === "superadmin";
  const [searchParams, setSearchParams] = useSearchParams();
  const partnerIdFilter = searchParams.get("partnerId") || "";
  const [status, setStatus] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const queryClient = useQueryClient();

  const { data: partnersData } = useQuery({
    queryKey: ["partners-active"],
    queryFn: () => partnerService.getPartners({ isActive: true, limit: 200 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["partner-loans", partnerIdFilter, status, startDate, endDate],
    queryFn: () =>
      partnerService.getLoans({
        partnerId: partnerIdFilter || undefined,
        status: (status as PartnerLoanStatus) || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 100,
      }),
    enabled: isAdmin,
  });

  const returnMutation = useMutation({
    mutationFn: (loanId: string) => partnerService.returnLoanToPartner(loanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-loans"] });
      toast.success("Devolução ao parceiro registrada");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Erro ao registrar devolução");
    },
  });

  const loans: PartnerLoan[] = data?.data ?? [];
  const summary = data?.summary;

  const partnerName = (loan: PartnerLoan) =>
    typeof loan.partnerId === "object" ? loan.partnerId.name : "—";
  const itemName = (loan: PartnerLoan) =>
    typeof loan.itemId === "object" ? loan.itemId.name : "—";
  const rentalNumber = (loan: PartnerLoan) =>
    typeof loan.rentalId === "object"
      ? loan.rentalId.rentalNumber || String(loan.rentalId._id).slice(-6)
      : String(loan.rentalId).slice(-6);
  const rentalId = (loan: PartnerLoan) =>
    typeof loan.rentalId === "object" ? loan.rentalId._id : loan.rentalId;

  const partners: Partner[] = useMemo(
    () => partnersData?.data ?? [],
    [partnersData],
  );

  if (!isAdmin) {
    return (
      <Layout title="Empréstimos de parceiros" backTo="/partners">
        <p className="p-8 text-sm text-amber-700">
          Somente administradores podem acessar o controle de empréstimos.
        </p>
      </Layout>
    );
  }

  return (
    <Layout title="Empréstimos de parceiros" backTo="/partners">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="app-container space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Controle de empréstimos
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Equipamentos de terceiros em aluguel e devoluções ao parceiro
              </p>
            </div>
            <Link to="/partners" className="text-sm text-indigo-600 hover:underline">
              Cadastro de parceiros
            </Link>
          </div>

          {summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500">Com cliente</p>
                <p className="text-xl font-semibold">{summary.withCustomerQty}</p>
              </div>
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500">Aguardando devolução</p>
                <p className="text-xl font-semibold">
                  {summary.awaitingPartnerReturnQty}
                </p>
              </div>
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500">Custo interno pendente</p>
                <p className="text-xl font-semibold">
                  {formatCurrencyBr(summary.pendingAgreedCost)}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <select
              value={partnerIdFilter}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.value) next.set("partnerId", e.target.value);
                else next.delete("partnerId");
                setSearchParams(next);
              }}
              className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600"
            >
              <option value="">Todos os parceiros</option>
              {partners.map((p: Partner) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600"
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600"
              title="Período — de"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-800 dark:border-gray-600"
              title="Período — até"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-500">Carregando...</p>
          ) : loans.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Nenhum empréstimo encontrado.
            </p>
          ) : (
            <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                      Parceiro
                    </th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                      Item
                    </th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                      Aluguel
                    </th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                      Qtd
                    </th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                      Custo
                    </th>
                    <th className="px-3 py-2 text-left text-xs uppercase text-gray-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-xs uppercase text-gray-500">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {loans.map((loan) => (
                    <tr key={loan._id}>
                      <td className="px-3 py-2">{partnerName(loan)}</td>
                      <td className="px-3 py-2">{itemName(loan)}</td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/rentals/${rentalId(loan)}`}
                          className="text-indigo-600 hover:underline"
                        >
                          {rentalNumber(loan)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {loan.quantity}
                        {loan.quantityWithCustomer > 0
                          ? ` (${loan.quantityWithCustomer} c/ cliente)`
                          : ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {loan.agreedCost != null
                          ? formatCurrencyBr(loan.agreedCost)
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {statusLabel[loan.status] || loan.status}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {loan.status === "awaiting_partner_return" ? (
                          <button
                            type="button"
                            className="text-emerald-700 dark:text-emerald-400 hover:underline"
                            disabled={returnMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Confirmar devolução total ao parceiro?",
                                )
                              ) {
                                returnMutation.mutate(loan._id);
                              }
                            }}
                          >
                            Devolver ao parceiro
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default PartnerLoansPage;
