import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import { useAuth } from "../../hooks/useAuth";

import { inventoryService } from "../inventory/inventory.service";
import { rentalService } from "../rentals/rental.service";
import { maintenanceService } from "../maintenance/maintenance.service";

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  const [inventorySummary, setInventorySummary] = useState<any>(null);
  const [activeRentals, setActiveRentals] = useState<number | null>(null);
  const [upcomingExpirations, setUpcomingExpirations] = useState<number | null>(
    null,
  );
  const [pendingMaintenances, setPendingMaintenances] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [invRes, rentRes, maintRes] = await Promise.all([
          inventoryService.getInformationsItens(),
          rentalService.getExpirationDashboard(),
          maintenanceService.getMaintenanceStatistics(),
        ]);

        setInventorySummary(invRes ?? null);

        const rentData = rentRes?.data ?? {};

        setActiveRentals(rentData?.summary?.totalActive ?? 0);
        setUpcomingExpirations(rentData?.summary?.totalExpiringSoon ?? 0);

        const maintStats = maintRes?.data ?? {};

        setPendingMaintenances(
          (maintStats?.scheduled ?? 0) + (maintStats?.inProgress ?? 0),
        );
      } catch (err) {
        console.error("Erro ao carregar dashboard", err);
      }
    };

    fetchData();
  }, []);

  const cardSections = [
    {
      title: "Operações",
      cards: [
        {
          title: "Inventário",
          description: "Gerencie equipamentos, categorias e disponibilidade",
          to: "/inventory/items",
        },

        {
          title: "Clientes",
          description: "Cadastro de clientes e histórico",
          to: "/customers",
        },

        {
          title: "Manutenções",
          description: "Manutenção preventiva e corretiva",
          to: "/maintenance",
        },
      ],
    },

    {
      title: "Gestão",
      cards: [
        {
          title: "Financeiro",
          description: "Faturamento e fluxo de caixa",
          to: "/finance",
        },

        {
          title: "Relatórios",
          description: "Análises e métricas da operação",
          to: "/reports",
        },
        {
          title: "Equipe",
          description: "Gerencie funcionários e permissões",
          to: "/employes",
        },
      ],
    },

    {
      title: "Administração",
      cards: [
        {
          title: "Administração",
          description: "Configurações do sistema",
          to: "/admin",
        },
      ],
    },
  ];

  return (
    <Layout title="Dashboard" showBackButton={false}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* HEADER */}

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Dashboard
            </h1>

            <p className="text-gray-600 dark:text-gray-400">
              Bem vindo,
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {" "}
                {user?.name}
              </span>
            </p>
          </div>

          {/* HERO - NOVO ALUGUEL */}
          <div className="mb-8">
            <div
              className="
      bg-gradient-to-r from-blue-50 to-sky-50
      rounded-xl
      p-6
      border border-blue-100
      shadow-sm
      flex flex-col lg:flex-row
      lg:items-center
      lg:justify-between
      gap-6
    "
            >
              <div>
                <h2 className="text-2xl font-semibold text-gray-800 mt-2 mb-1">
                  Controle de Aluguéis
                </h2>

                <p className="text-gray-600">
                  Gerencie equipamentos, contratos e prazos da sua{" "}
                  <strong>empresa</strong>
                </p>

                <div className="flex gap-4 mt-6">
                  {/* Aluguéis ativos */}
                  <Link
                    to="/billings"
                    className="
            flex items-center gap-3
            bg-white/80
            backdrop-blur-sm
            px-5 py-3
            rounded-lg
            border border-blue-100
            shadow-sm
            hover:bg-white
            transition-colors
          "
                  >
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <svg
                        className="w-5 h-5 text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 17l6-6 4 4 8-8M21 7h-6"
                        />
                      </svg>
                    </div>

                    <div>
                      <p className="text-xl font-semibold text-gray-800">
                        {activeRentals ?? "-"}
                      </p>
                      <p className="text-sm text-gray-500">Aluguéis ativos</p>
                    </div>
                  </Link>

                  {/* Vencimentos */}
                  <div
                    className="
            flex items-center gap-3
            bg-white/80
            backdrop-blur-sm
            px-5 py-3
            rounded-lg
            border border-blue-100
            shadow-sm
          "
                  >
                    <div className="bg-amber-100 p-2 rounded-lg">
                      <svg
                        className="w-5 h-5 text-amber-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7V3M16 7V3M4 11h16M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>

                    <div>
                      <p className="text-xl font-semibold text-gray-800">
                        {upcomingExpirations ?? "-"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Vencimentos próximos
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <Link
                to="/rentals"
                className="
        bg-blue-600 text-white
        px-6 py-3
        rounded-lg
        font-medium
        shadow-md shadow-blue-200
        hover:bg-blue-700
        transition-all
        flex items-center gap-2
        group
        self-start lg:self-center
      "
              >
                <span>Acessar aluguéis</span>
                <svg
                  className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          </div>

          {/* SEÇÕES DE CARDS */}

          <div className="space-y-10">
            {cardSections.map((section, sectionIndex) => {
              const filteredCards = section.cards.filter((card) => {
                // Administração apenas superadmin
                if (
                  card.title === "Administração" &&
                  user?.role !== "superadmin"
                ) {
                  return false;
                }

                // Equipe apenas admin e superadmin
                if (
                  card.title === "Equipe" &&
                  user?.role !== "admin" &&
                  user?.role !== "superadmin"
                ) {
                  return false;
                }

                if (
                  card.title === "Financeiro" &&
                  user?.role !== "admin" &&
                  user?.role !== "superadmin"
                ) {
                  return false;
                }

                if (
                  card.title === "Relatórios" &&
                  user?.role !== "admin" &&
                  user?.role !== "superadmin"
                ) {
                  return false;
                }

                return true;
              });

              if (filteredCards.length === 0) return null;

              return (
                <div key={sectionIndex}>
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                    {section.title}
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredCards.map((card, index) => (
                      <Link
                        key={index}
                        to={card.to}
                        className="
  group
  bg-white dark:bg-gray-800
  border border-gray-200 dark:border-gray-700
  rounded-xl
  p-6
  shadow-sm
  hover:shadow-lg
  hover:-translate-y-1
  transition
  block
"
                      >
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                          {card.title}
                        </h3>

                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {card.description}
                        </p>

                        <div className="mt-4 text-sm font-medium text-indigo-600 group-hover:underline">
                          Acessar →
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ESTATÍSTICAS */}

          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Visão Geral
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Itens em estoque
                </p>
                <p className="text-2xl font-bold">
                  {inventorySummary?.inStock ?? "-"}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Aluguéis ativos
                </p>
                <p className="text-2xl font-bold">{activeRentals ?? "-"}</p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Vencimentos próximos
                </p>
                <p className="text-2xl font-bold">
                  {upcomingExpirations ?? "-"}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manutenções pendentes
                </p>
                <p className="text-2xl font-bold">
                  {pendingMaintenances ?? "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
