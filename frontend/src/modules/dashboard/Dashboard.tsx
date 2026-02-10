import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../hooks/useAuth';
import { inventoryService } from '../inventory/inventory.service';
import { rentalService } from '../rentals/rental.service';
import { maintenanceService } from '../maintenance/maintenance.service';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [inventorySummary, setInventorySummary] = useState<{totalItems: number;  inStock: number;} | null>(null);
  const [activeRentals, setActiveRentals] = useState<number | null>(null);
  const [upcomingExpirations, setUpcomingExpirations] = useState<number | null>(null);
  const [pendingMaintenances, setPendingMaintenances] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchSummaries = async () => {
      try {
        const [invRes, rentRes, maintRes] = await Promise.all([
          inventoryService.getInformationsItens(),
          rentalService.getExpirationDashboard(),
          maintenanceService.getMaintenanceStatistics(),
        ]);

        if (!mounted) return;

        // inventoryService.getInformationsItens returns direct summary
        setInventorySummary(invRes ?? null);

        // rentalService.getExpirationDashboard returns { success, data }
        const rentData = (rentRes as any)?.data ?? null;
        const totalActive = rentData?.summary?.totalActive ?? rentData?.active ?? 0;
        const totalExpiringSoon = rentData?.summary?.totalExpiringSoon ?? (rentData?.expiringSoon?.length ?? 0);
        setActiveRentals(totalActive ?? 0);
        setUpcomingExpirations(totalExpiringSoon ?? 0);

        // maintenanceService.getMaintenanceStatistics returns { success, data }
        const maintStats = (maintRes as any)?.data ?? null;
        const pending = (maintStats?.scheduled ?? 0) + (maintStats?.inProgress ?? 0);
        setPendingMaintenances(pending ?? 0);
      } catch (err) {
        // silencioso: se falhar, mantemos '-' mostrado
        console.error('Erro ao carregar resumos do dashboard', err);
      }
    };

    fetchSummaries();

    return () => {
      mounted = false;
    };
  }, []);

  // Array de cards organizados por categorias
  const cardSections = [
    {
      title: "Gerenciamento Principal",
      cards: [
        {
          title: "Inventário",
          description: "Gerenciar materiais e equipamentos",
          to: "/inventory/items",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          )
        },
        {
          title: "Aluguéis",
          description: "Gerenciar aluguéis e reservas",
          to: "/rentals",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        },
        {
          title: "Clientes",
          description: "Gerenciar clientes e contatos",
          to: "/customers",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          )
        }
      ]
    },
    {
      title: "Operações",
      cards: [
        {
          title: "Manutenções",
          description: "Manutenções preventivas e corretivas",
          to: "/maintenance",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )
        },
        {
          title: "Faturas",
          description: "Gerenciar faturas e contratos",
          to: "/invoices",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        },
        {
          title: "Vencimentos",
          description: "Contratos vencidos e a vencer",
          to: "/rentals/expiration-dashboard",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          highlight: true
        }
      ]
    },
    {
      title: "Análise e Controle",
      cards: [
        {
          title: "Financeiro",
          description: "Dashboard financeiro e transações",
          to: "/finance",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          )
        },
        {
          title: "Relatórios",
          description: "Relatórios e análises",
          to: "/reports",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        },
        {
          title: "Administração",
          description: "Gestão de empresas e assinaturas",
          to: "/admin",
          icon: (
            <svg className="h-6 w-6 text-gray-800 dark:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )
        }
      ]
    }
  ];

  return (
    <Layout title="Dashboard" showBackButton={false}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Bem-vindo, <span className="font-semibold text-gray-800 dark:text-gray-200">{user?.name}</span>
            </p>
          </div>

          {/* Card Sections */}
          <div className="space-y-10">
            {cardSections.map((section, sectionIndex) => (
              <div key={sectionIndex}>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {section.cards.map((card, cardIndex) => (
                    <Link
                      key={cardIndex}
                      to={card.to}
                      className={`
                        group block p-5 bg-white dark:bg-gray-800 
                        border border-gray-200 dark:border-gray-700 
                        rounded-lg shadow-sm hover:shadow-md 
                        transition-all duration-200 ease-in-out
                        hover:border-gray-300 dark:hover:border-gray-600
                        ${card.highlight ? 'border-l-4 border-l-red-500 dark:border-l-red-600' : ''}
                      `}
                    >
                      <div className="flex items-start">
                        <div className={`
                          flex-shrink-0 rounded-lg p-3 mr-4
                          ${card.highlight 
                            ? 'bg-red-50 dark:bg-red-900/20' 
                            : 'bg-gray-100 dark:bg-gray-700'
                          }
                        `}>
                          <div className={`
                            ${card.highlight 
                              ? 'text-red-600 dark:text-red-400' 
                              : 'text-gray-800 dark:text-gray-200'
                            }
                          `}>
                            {card.icon}
                          </div>
                        </div>
                        <div>
                          <h3 className={`
                            text-lg font-semibold mb-1
                            ${card.highlight 
                              ? 'text-red-700 dark:text-red-400' 
                              : 'text-gray-900 dark:text-white'
                            }
                          `}>
                            {card.title}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {card.description}
                          </p>
                        </div>
                      </div>
                      <div className={`
                        mt-4 pt-3 border-t text-sm font-medium
                        ${card.highlight 
                          ? 'text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/30' 
                          : 'text-gray-700 dark:text-gray-300 border-gray-100 dark:border-gray-700'
                        }
                        transition-colors duration-200
                        group-hover:text-gray-900 dark:group-hover:text-white
                      `}>
                        Acessar →
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Stats (opcional, se quiser adicionar) */}
          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Visão Geral
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">Itens em Estoque</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{inventorySummary?.inStock ?? '-'}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">Aluguéis Ativos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeRentals ?? '-'}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">Vencimentos Próximos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{upcomingExpirations ?? '-'}</p>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">Manutenções Pendentes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{pendingMaintenances ?? '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;