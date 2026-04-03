import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { customerService } from "../customers/customer.service";
import { billingService } from "../billings/billing.service";
import { invoiceService } from "./invoice.service";
import { toast } from "react-toastify";
import { ArrowLeft, FilePlus2 } from "lucide-react";

const CreateInvoicePage: React.FC = () => {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const { data: customersRes, isLoading: loadingCustomers } = useQuery({
    queryKey: ["customers-invoice-create"],
    queryFn: () => customerService.getCustomers({ limit: 500, page: 1 }),
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

  const customers = customersRes?.data ?? [];
  const billings = billingsRes?.data?.billings ?? [];

  const selectedBillings = useMemo(
    () => billings.filter((b) => selectedIds.has(b._id)),
    [billings, selectedIds],
  );

  const selectedTotal = useMemo(() => {
    return selectedBillings.reduce((sum, b) => sum + (b.calculation?.total ?? 0), 0);
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
        tax: tax.trim() === "" ? undefined : Number(tax),
        discount: discount.trim() === "" ? undefined : Number(discount),
      }),
    onSuccess: (res) => {
      toast.success("Fatura criada com sucesso");
      const inv = res.data as { _id: string };
      navigate(`/invoiceDetails/${inv._id}`);
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

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Cliente *
            </label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setSelectedIds(new Set());
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="">
                {loadingCustomers ? "Carregando..." : "Selecione o cliente"}
              </option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
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

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  OBRA (endereço ou nome da obra — opcional)
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
                    type="number"
                    min="0"
                    step="0.01"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
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
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
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
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Fechamento
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Período
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Status
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {billings.map((b) => {
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
                          <td className="px-3 py-2 text-xs">{b.status}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium">
                            {fmtMoney(total)}
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
                  Referência fechamentos: {fmtMoney(selectedTotal)}
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
              createMutation.isPending
            }
            onClick={() => createMutation.mutate()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? "Gerando..." : "Gerar fatura"}
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default CreateInvoicePage;
