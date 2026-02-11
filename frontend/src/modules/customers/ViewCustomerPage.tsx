// modules/customers/ViewCustomerPage.tsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { customerService } from "./customer.service";
import { Customer, CustomerAddress } from "../../types/customer.types";

const ViewCustomerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => customerService.getCustomerById(id!),
    enabled: !!id,
  });

  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (data?.data) setCustomer(data.data);
  }, [data]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => customerService.deleteCustomer(id),
    onSuccess: () => {
      navigate("/customers");
    },
  });

  if (isLoading) {
    return (
      <Layout title="Visualizar Cliente" backTo="/customers">
        <div className="flex justify-center items-center h-64">
          Carregando...
        </div>
      </Layout>
    );
  }

  const handleDelete = () => {
    if (!customer?._id) return;
    deleteMutation.mutate(customer._id);
  };

  if (isError || !customer) {
    return (
      <Layout title="Visualizar Cliente" backTo="/customers">
        <div className="text-red-600 dark:text-red-400 p-4">
          Erro ao carregar cliente ou cliente não encontrado.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Cliente: ${customer.name}`} backTo="/customers">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/customers"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 inline-flex items-center"
            >
              <svg
                className="h-4 w-4 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
                />
              </svg>
              Voltar para Clientes
            </Link>
          </div>

          {/* Cabeçalho da Página */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {customer.name}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Detalhes e informações do cliente
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to={`/customers/${customer._id}/edit`}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 dark:hover:bg-gray-600 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow transition-all duration-200 gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                  />
                </svg>
                Editar Cliente
              </Link>

              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 rounded-lg text-sm font-medium transition-colors gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteMutation.isPending ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Excluindo...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                    Excluir Cliente
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Layout principal: duas colunas no desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Informações do Cliente */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center">
                  <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg mr-3">
                    <svg
                      className="w-5 h-5 text-gray-700 dark:text-gray-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Informações do Cliente
                  </h2>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Nome
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {customer.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      CPF/CNPJ
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white font-mono">
                      {customer.cpfCnpj}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Email
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {customer.email || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Telefone
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {customer.phone || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                      Observações
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white whitespace-pre-wrap">
                      {customer.notes || "-"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Endereços */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg mr-3">
                      <svg
                        className="w-5 h-5 text-gray-700 dark:text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                        />
                      </svg>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Endereços
                    </h2>
                  </div>
                  <Link
                    to={`/customers/${customer._id}/edit`}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Adicionar
                  </Link>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {(customer.addresses ?? []).length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="1.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                        />
                      </svg>
                      <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        Nenhum endereço registrado
                      </p>
                      <Link
                        to={`/customers/${customer._id}/edit`}
                        className="mt-2 inline-flex items-center text-sm text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 font-medium"
                      >
                        <svg
                          className="w-4 h-4 mr-1"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Adicionar endereço
                      </Link>
                    </div>
                  ) : (
                    (customer.addresses ?? []).map(
                      (address: CustomerAddress, index: number) => (
                        <div
                          key={index}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors bg-white dark:bg-gray-800"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center">
                              <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg mr-2">
                                <svg
                                  className="w-4 h-4 text-gray-600 dark:text-gray-400"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                                  />
                                </svg>
                              </div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {address.addressName?.trim()
                                  ? address.addressName
                                  : address.type === "main"
                                    ? "Endereço Principal"
                                    : address.type === "billing"
                                      ? "Endereço de Cobrança"
                                      : address.type === "work"
                                        ? `Endereço da Obra ${index + 1}`
                                        : `Endereço ${index + 1}`}
                              </p>
                            </div>
                            {address.type === "main" && (
                              <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-600">
                                Principal
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                Rua:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.street || "-"}
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                Número:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.number || "-"}
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                Complemento:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.complement || "-"}
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                Bairro:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.neighborhood || "-"}
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                Cidade:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.city || "-"}
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                Estado:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.state || "-"}
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16">
                                CEP:
                              </span>
                              <span className="text-gray-900 dark:text-white">
                                {address.zipCode || "-"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Histórico de Aluguéis - Placeholder para futura implementação */}
          <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center">
                <div className="p-2 bg-gray-200 dark:bg-gray-700 rounded-lg mr-3">
                  <svg
                    className="w-5 h-5 text-gray-700 dark:text-gray-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 7.5l-.8 2.8a2.25 2.25 0 0 1-2.15 1.6H6.7a2.25 2.25 0 0 1-2.15-1.6l-.8-2.8m16 0v.58a2.25 2.25 0 0 1-1.28 2.03l-3.7 1.62c-.55.24-.92.77-.92 1.37v1.14c0 .87-.47 1.64-1.16 2.03a6.752 6.752 0 0 1-3.02.68 6.75 6.75 0 0 1-3.02-.68 2.35 2.35 0 0 1-1.16-2.03v-1.14c0-.6-.37-1.13-.92-1.37l-3.7-1.62A2.25 2.25 0 0 1 3 8.08v-.58m16 0H5"
                    />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Histórico de Aluguéis
                </h2>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center py-8">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
                <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                  Histórico de aluguéis será implementado em breve
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ViewCustomerPage;
