import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { features } from "../../config/features";
import { financialService } from "./financial.service";
import {
  billingMatchesBoardFilters,
  groupBillingsByFinancialStage,
  FinancialBoardUrlFilters,
} from "./financialBoardFilters";
import { formatCurrencyBr } from "../../utils/formatters";

const stageLabel: Record<string, string> = {
  pending: "Pendentes",
  charge: "Cobrança",
  invoiced: "Faturado",
  paid: "Pago",
  cancelled: "Cancelado",
};

/**
 * Quadro de fechamentos somente leitura (mesmos filtros da tela financeira).
 */
const FinancialKanbanDashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const customerFilter = searchParams.get("customer") || "";
  const itemFilter = searchParams.get("item") || "";
  const obraFilter = searchParams.get("obra") || "";
  const periodStartFilter = searchParams.get("start") || "";
  const periodEndFilter = searchParams.get("end") || "";

  const filterParams: FinancialBoardUrlFilters = useMemo(
    () => ({
      customerId: customerFilter,
      itemText: itemFilter,
      obraText: obraFilter,
      periodStart: periodStartFilter,
      periodEnd: periodEndFilter,
    }),
    [customerFilter, itemFilter, obraFilter, periodStartFilter, periodEndFilter],
  );

  const updateFilterParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) {
      next.set(key, value.trim());
    } else {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const boardQuery = useQuery({
    queryKey: ["financial-board"],
    queryFn: () => financialService.getBoard(),
    enabled: features.financialUnifiedModule,
  });

  const boardData = boardQuery.data?.data;
  const billings = useMemo(() => boardData?.billings || [], [boardData]);

  const columns = useMemo(() => {
    const filtered = billings.filter((b: any) => billingMatchesBoardFilters(b, filterParams));
    return groupBillingsByFinancialStage(filtered);
  }, [billings, filterParams]);

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const billing of billings) {
      const id = String(billing.customerId?._id || billing.customerId || "");
      const name = String(billing.customerId?.name || "Cliente");
      if (id && !map.has(id)) map.set(id, name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [billings]);

  if (!features.financialUnifiedModule) {
    return (
      <Layout title="Quadro de fechamentos" backTo="/dashboard">
        <p className="text-sm text-gray-600">Módulo financeiro unificado está desabilitado por feature flag.</p>
      </Layout>
    );
  }

  return (
    <Layout title="Quadro de fechamentos" backTo="/dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xl">
            Visualização somente leitura do fluxo de fechamentos. Para selecionar fechamentos, criar cobranças e dar
            baixas, use a{" "}
            <Link
              to={{ pathname: "/finance", search: searchParams.toString() }}
              className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
            >
              tela de operação financeira
            </Link>
            .
          </p>
        </div>

        <details className="border rounded-md p-4 bg-white dark:bg-gray-800" open>
          <summary className="cursor-pointer font-semibold">Filtros do quadro</summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={customerFilter}
              onChange={(e) => updateFilterParam("customer", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm dark:bg-gray-900 dark:border-gray-600"
            >
              <option value="">Todos os clientes</option>
              {customerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>

            <input
              value={itemFilter}
              onChange={(e) => updateFilterParam("item", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm dark:bg-gray-900 dark:border-gray-600"
              placeholder="Filtrar por item"
            />

            <input
              value={obraFilter}
              onChange={(e) => updateFilterParam("obra", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm dark:bg-gray-900 dark:border-gray-600"
              placeholder="Filtrar por obra"
            />

            <input
              type="date"
              value={periodStartFilter}
              onChange={(e) => updateFilterParam("start", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm dark:bg-gray-900 dark:border-gray-600"
            />

            <input
              type="date"
              value={periodEndFilter}
              onChange={(e) => updateFilterParam("end", e.target.value)}
              className="border rounded-md px-2 py-2 text-sm dark:bg-gray-900 dark:border-gray-600"
            />
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
            >
              Limpar filtros
            </button>
          </div>
        </details>

        {boardQuery.isLoading && <p className="text-sm text-gray-600">Carregando quadro…</p>}
        {boardQuery.isError && (
          <p className="text-sm text-red-600">Não foi possível carregar os fechamentos.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {Object.entries(columns).map(([stage, items]) => (
            <div key={stage} className="border rounded-md p-3 bg-gray-50 dark:bg-gray-900/40">
              <h3 className="font-semibold mb-3">{stageLabel[stage] || stage}</h3>
              <div className="space-y-2">
                {(items as any[]).map((bill) => (
                  <div key={bill._id} className="block border rounded-md p-2 bg-white dark:bg-gray-800">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{bill.customerId?.name || "Cliente"}</span>
                      <span>{formatCurrencyBr(bill.outstandingAmount ?? bill.calculation?.total ?? 0)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Período:{" "}
                      {bill.periodStart ? new Date(bill.periodStart).toLocaleDateString("pt-BR") : "-"} até{" "}
                      {bill.periodEnd ? new Date(bill.periodEnd).toLocaleDateString("pt-BR") : "-"}
                    </p>
                    <p className="text-xs text-gray-500">
                      Itens:{" "}
                      {(bill.items || []).length > 0
                        ? bill.items
                            .map((item: any) => item?.itemId?.name || "Item")
                            .filter((name: string, index: number, arr: string[]) => arr.indexOf(name) === index)
                            .join(", ")
                        : "-"}
                    </p>
                    <p className="text-xs text-gray-500">Obra: {bill.rentalId?.workAddress?.workName || "-"}</p>
                    <p className="text-[11px] text-gray-400 mt-1">Fechamento: {bill.billingNumber || bill._id}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default FinancialKanbanDashboardPage;
