import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { partnerService } from "./partner.service";
import { Partner } from "../../types/partner.types";
import { toast } from "react-toastify";

const PartnersPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["partners", search],
    queryFn: () =>
      partnerService.getPartners({
        search: search.trim() || undefined,
        limit: 100,
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => partnerService.deletePartner(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast.success("Parceiro excluído");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || "Erro ao excluir parceiro");
    },
  });

  const partners: Partner[] = data?.data ?? [];

  return (
    <Layout title="Parceiros" backTo="/dashboard">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="app-container">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Parceiros
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Cadastro de fornecedores de equipamentos de terceiros
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/partners/loans"
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Controle de empréstimos
              </Link>
              <Link
                to="/partners/new"
                className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm font-medium"
              >
                Novo parceiro
              </Link>
            </div>
          </div>

          <div className="mb-4 max-w-md">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, documento ou telefone"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-500">Carregando...</p>
          ) : error ? (
            <p className="text-sm text-red-600">Erro ao carregar parceiros</p>
          ) : partners.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Nenhum parceiro cadastrado.
            </p>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Nome
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Contato
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {partners.map((partner) => (
                    <tr key={partner._id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {partner.name}
                        {partner.document ? (
                          <div className="text-xs text-gray-500 font-normal">
                            {partner.document}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {[partner.phone, partner.email].filter(Boolean).join(" · ") ||
                          "—"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            partner.isActive
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {partner.isActive ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm space-x-2">
                        <Link
                          to={`/partners/${partner._id}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Ver
                        </Link>
                        <Link
                          to={`/partners/${partner._id}/edit`}
                          className="text-gray-700 dark:text-gray-300 hover:underline"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Excluir parceiro "${partner.name}"?`,
                              )
                            ) {
                              deleteMutation.mutate(partner._id);
                            }
                          }}
                        >
                          Excluir
                        </button>
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

export default PartnersPage;
