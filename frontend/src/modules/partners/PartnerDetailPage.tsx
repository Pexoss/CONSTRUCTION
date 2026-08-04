import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { partnerService } from "./partner.service";
import { formatCurrencyBr } from "../../utils/formatters";

const PartnerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["partner", id],
    queryFn: () => partnerService.getPartnerById(id!),
    enabled: !!id,
  });

  const { data: loansData } = useQuery({
    queryKey: ["partner-loans", id],
    queryFn: () =>
      partnerService.getLoans({ partnerId: id, limit: 20 }),
    enabled: !!id,
  });

  const partner = data?.data;

  if (isLoading) {
    return (
      <Layout title="Parceiro" backTo="/partners">
        <p className="p-8 text-sm text-gray-500">Carregando...</p>
      </Layout>
    );
  }

  if (error || !partner) {
    return (
      <Layout title="Parceiro" backTo="/partners">
        <p className="p-8 text-sm text-red-600">Parceiro não encontrado</p>
      </Layout>
    );
  }

  return (
    <Layout title={partner.name} backTo="/partners">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="app-container space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {partner.name}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {partner.isActive ? "Ativo" : "Inativo"}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/partners/loans?partnerId=${partner._id}`}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                Empréstimos
              </Link>
              <Link
                to={`/partners/${partner._id}/edit`}
                className="px-3 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-sm"
              >
                Editar
              </Link>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border rounded-lg p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-500 uppercase">Telefone</p>
              <p className="text-gray-900 dark:text-white">{partner.phone || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">E-mail</p>
              <p className="text-gray-900 dark:text-white">{partner.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Documento</p>
              <p className="text-gray-900 dark:text-white">
                {partner.document || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase">Observações</p>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                {partner.notes || "—"}
              </p>
            </div>
          </div>

          {loansData?.summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500">Com cliente</p>
                <p className="text-xl font-semibold">
                  {loansData.summary.withCustomerQty}
                </p>
              </div>
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500">Aguardando devolução</p>
                <p className="text-xl font-semibold">
                  {loansData.summary.awaitingPartnerReturnQty}
                </p>
              </div>
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500">Custo interno pendente</p>
                <p className="text-xl font-semibold">
                  {formatCurrencyBr(loansData.summary.pendingAgreedCost)}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Layout>
  );
};

export default PartnerDetailPage;
