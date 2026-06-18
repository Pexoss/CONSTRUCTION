import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { rentalService } from "./rental.service";

type PopulatedUser = {
  _id: string;
  name?: string;
  email?: string;
  role?: string;
};

type PopulatedCustomer = {
  _id: string;
  name?: string;
  cpfCnpj?: string;
};

type CpfBypassPendingItem = {
  _id: string;
  code: string;
  customer: PopulatedCustomer | string;
  requestedBy: PopulatedUser | string;
  expiresAt: string;
  createdAt?: string;
};

const resolveName = (
  value: PopulatedCustomer | PopulatedUser | string | undefined,
  fallback = "—",
) => {
  if (!value) return fallback;
  if (typeof value === "string") return fallback;
  if ("email" in value && value.email) return value.name || value.email;
  return value.name || fallback;
};

const formatDateTime = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
};

const RentalCpfBypassPage: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["rental-cpf-bypass-pending"],
    queryFn: rentalService.getPendingCpfBypassCodes,
    refetchInterval: 30_000,
  });

  const items = useMemo<CpfBypassPendingItem[]>(
    () => data?.data ?? [],
    [data?.data],
  );

  return (
    <Layout title="Autorizações sem CPF" backTo="/dashboard">
      <div className="app-container py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Códigos para aluguel sem CPF/CNPJ
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Solicitações de funcionários aguardando autorização. Os mesmos
              códigos enviados por e-mail aparecem aqui.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-60"
          >
            {isFetching ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-40 text-gray-600 dark:text-gray-400">
            Carregando códigos...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-300 text-sm">
            Não foi possível carregar os códigos. Tente novamente.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
            <p className="text-gray-700 dark:text-gray-300 font-medium">
              Nenhum código pendente no momento
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Quando um funcionário solicitar autorização para alugar sem
              CPF/CNPJ, o código aparecerá aqui e também será enviado por
              e-mail.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      Código
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      Solicitado por
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      Solicitado em
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      Válido até
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {items.map((item) => (
                    <tr key={item._id}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-mono text-lg font-semibold tracking-widest">
                          {item.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {resolveName(item.customer)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        <div>{resolveName(item.requestedBy)}</div>
                        {typeof item.requestedBy === "object" &&
                        item.requestedBy?.email ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {item.requestedBy.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 tabular-nums">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 tabular-nums">
                        {formatDateTime(item.expiresAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          A lista é atualizada automaticamente a cada 30 segundos. Códigos
          expiram em 30 minutos ou após o uso no aluguel.
        </p>
      </div>
    </Layout>
  );
};

export default RentalCpfBypassPage;
