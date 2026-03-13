import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { rentalService } from './rental.service';
import { RentalPendingApproval } from '../../types/rental.types';

const formatRequestLabel = (type: string) => {
  const map: Record<string, string> = {
    status_change: 'Alteração de status',
    rental_type_change: 'Alteração de tipo de aluguel',
    discount: 'Desconto',
    extension: 'Extensão de período',
    service_addition: 'Adição de serviço',
    close_adjustment: 'Fechamento com ajustes',
    rental_update: 'Edição de aluguel',
  };
  return map[type] || type;
};

const formatCurrency = (value?: number) => {
  if (value === undefined || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const renderRequestDetails = (type: string, details: Record<string, any>) => {
  switch (type) {
    case 'status_change':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Status anterior: {details.previousStatus || details.previousValue || '-'}</div>
          <div>Novo status: {details.newStatus || details.newValue || '-'}</div>
        </div>
      );
    case 'rental_type_change':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Tipo anterior: {details.previousRentalType || details.previousValue || '-'}</div>
          <div>Novo tipo: {details.newRentalType || details.newValue || '-'}</div>
        </div>
      );
    case 'discount':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Desconto: {formatCurrency(details.discount)}</div>
          <div>Motivo: {details.reason || '-'}</div>
        </div>
      );
    case 'extension':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Nova devolução: {formatDate(details.newReturnDate)}</div>
        </div>
      );
    case 'service_addition':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Serviço: {details.service?.description || '-'}</div>
          <div>Categoria: {details.service?.category || '-'}</div>
          <div>Quantidade: {details.service?.quantity ?? 1}</div>
          <div>Preço: {formatCurrency(details.service?.price)}</div>
          <div>Subtotal: {formatCurrency(details.service?.subtotal)}</div>
        </div>
      );
    case 'close_adjustment':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Novo status: {details.newStatus || details.newValue || '-'}</div>
          <div>Data de devolução: {formatDate(details.adjustments?.returnDate)}</div>
          <div>Tipo de aluguel: {details.adjustments?.rentalType || '-'}</div>
          <div>
            Subtotal equipamentos: {formatCurrency(details.adjustments?.pricingOverride?.equipmentSubtotal)}
          </div>
          <div>
            Subtotal serviços: {formatCurrency(details.adjustments?.pricingOverride?.servicesSubtotal)}
          </div>
          <div>Desconto: {formatCurrency(details.adjustments?.pricingOverride?.discount)}</div>
          <div>Multa: {formatCurrency(details.adjustments?.pricingOverride?.lateFee)}</div>
          <div>Total: {formatCurrency(details.adjustments?.pricingOverride?.total)}</div>
          <div>Observações: {details.adjustments?.notes || '-'}</div>
        </div>
      );
    case 'rental_update':
      return (
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>Notas: {details.previousNotes || '-'} → {details.newNotes || '-'}</div>
          <div>Desconto: {formatCurrency(details.previousDiscount)} → {formatCurrency(details.newDiscount)}</div>
          <div>
            Retirada: {formatDate(details.previousPickupScheduled)} → {formatDate(details.newPickupScheduled)}
          </div>
          <div>
            Devolução: {formatDate(details.previousReturnScheduled)} → {formatDate(details.newReturnScheduled)}
          </div>
        </div>
      );
    default:
      return (
        <pre className="whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-400">
          {JSON.stringify(details, null, 2)}
        </pre>
      );
  }
};

const RentalApprovalsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: rentals = [], isLoading } = useQuery({
    queryKey: ['rental-approvals'],
    queryFn: () => rentalService.getPendingApprovals(),
  });

  const approveMutation = useMutation({
    mutationFn: ({ rentalId, approvalId, notes }: { rentalId: string; approvalId: string; notes?: string }) =>
      rentalService.approveApproval(rentalId, approvalId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ rentalId, approvalId, notes }: { rentalId: string; approvalId: string; notes: string }) =>
      rentalService.rejectApproval(rentalId, approvalId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rental-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['rentals'] });
    },
  });

  const approvals = rentals.flatMap((rental) =>
    (rental.pendingApprovals || [])
      .filter((approval) => approval.status === 'pending')
      .map((approval) => ({ rental, approval }))
  );

  const filteredApprovals = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return approvals.filter(({ rental, approval }) => {
      if (typeFilter !== 'all' && approval.requestType !== typeFilter) return false;
      if (!normalizedSearch) return true;

      const customer =
        typeof rental.customerId === 'object' ? rental.customerId.name : rental.customerId;
      const haystack = [
        rental.rentalNumber,
        customer,
        approval.requestType,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [approvals, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredApprovals.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedApprovals = filteredApprovals.slice(startIndex, startIndex + pageSize);

  return (
    <Layout title="Aprovações de Aluguel" backTo="/dashboard">
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Pendências para aprovação
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Revise solicitações e aprove ou rejeite.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por cliente, número ou tipo..."
            className="w-full md:max-w-md px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full md:w-56 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="all">Todos os tipos</option>
            <option value="status_change">Alteração de status</option>
            <option value="rental_type_change">Alteração de tipo</option>
            <option value="discount">Desconto</option>
            <option value="extension">Extensão</option>
            <option value="service_addition">Adição de serviço</option>
            <option value="close_adjustment">Fechamento com ajustes</option>
            <option value="rental_update">Edição de aluguel</option>
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="w-full md:w-40 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
          </select>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Carregando...</p>
        ) : filteredApprovals.length === 0 ? (
          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Nenhuma solicitação pendente.
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedApprovals.map(({ rental, approval }) => {
              const approvalId = (approval as RentalPendingApproval)._id;
              const customer =
                typeof rental.customerId === 'object' ? rental.customerId.name : rental.customerId;

              return (
                <div
                  key={approvalId}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatRequestLabel(approval.requestType)}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Aluguel: {rental.rentalNumber} • Cliente: {customer}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Solicitado em: {new Date(approval.requestDate).toLocaleString('pt-BR')}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const notes = window.prompt('Observações para aprovação (opcional):') || undefined;
                          approveMutation.mutate({ rentalId: rental._id, approvalId, notes });
                        }}
                        className="px-3 py-2 text-xs bg-green-600 hover:bg-green-700 text-white rounded-md"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const notes = window.prompt('Informe o motivo da rejeição:');
                          if (!notes) return;
                          rejectMutation.mutate({ rentalId: rental._id, approvalId, notes });
                        }}
                        className="px-3 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 bg-gray-50 dark:bg-gray-900/50 p-2 rounded">
                    {renderRequestDetails(approval.requestType, approval.requestDetails)}
                  </div>
                </div>
              );
            })}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {filteredApprovals.length} solicitações • página {currentPage} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RentalApprovalsPage;
