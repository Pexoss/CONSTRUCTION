import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Layout from "../../components/Layout";
import { employeeService } from "./employe.service";
import { Employee } from "../../types/employe.type";

const ViewEmployeePage: React.FC = () => {

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => employeeService.getEmployeeById(id!),
    enabled: !!id,
  });

  const [employee, setEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (data?.data) setEmployee(data.data);
  }, [data]);

  if (isLoading) {
    return (
      <Layout title="Visualizar Funcionário" backTo="/employes">
        <div className="flex justify-center items-center h-64">
          Carregando...
        </div>
      </Layout>
    );
  }

  if (isError || !employee) {
    return (
      <Layout title="Visualizar Funcionário" backTo="/employes">
        <div className="text-red-600 dark:text-red-400 p-4">
          Erro ao carregar funcionário ou funcionário não encontrado.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={`Funcionário: ${employee.name}`} backTo="/employes">

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Voltar */}
          <div className="mb-6">
            <Link
              to="/employes"
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

              Voltar para Funcionários
            </Link>
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">

            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {employee.name}
              </h1>

              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Detalhes e informações do funcionário
              </p>
            </div>

            <div className="flex items-center gap-3">

              <Link
                to={`/employees/${employee._id}/editEmploye`}
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
                    d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                  />
                </svg>

                Editar Funcionário
              </Link>

            </div>

          </div>

          {/* Informações */}
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
                      d="M15.75 6a3.75 3.75 0 1 1-7.5 0"
                    />

                  </svg>

                </div>

                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Informações do Funcionário
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
                    {employee.name}
                  </p>

                </div>

                <div>

                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Email
                  </p>

                  <p className="font-medium text-gray-900 dark:text-white">
                    {employee.email}
                  </p>

                </div>

                <div>

                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Cargo / Role
                  </p>

                  <p className="font-medium text-gray-900 dark:text-white">
                    {employee.role}
                  </p>

                </div>

                <div>

                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Status
                  </p>

                  <p className="font-medium text-gray-900 dark:text-white">
                    {employee.isActive ? "Ativo" : "Inativo"}
                  </p>

                </div>

                <div>

                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                    Criado em
                  </p>

                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(employee.createdAt).toLocaleDateString()}
                  </p>

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </Layout>
  );

};

export default ViewEmployeePage;