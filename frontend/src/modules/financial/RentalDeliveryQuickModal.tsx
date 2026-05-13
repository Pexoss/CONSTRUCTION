import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { rentalService } from "../rentals/rental.service";
import { RentalItem } from "../../types/rental.types";
import { Item } from "../../types/inventory.types";
import { rentalStatusLabel } from "../../utils/statusLabels";

type Props = {
  rentalId: string | null;
  onClose: () => void;
};

function getLineItemId(line: RentalItem): string {
  if (line.itemId && typeof line.itemId === "object" && "_id" in line.itemId) {
    return String((line.itemId as Item)._id);
  }
  return String(line.itemId || "");
}

function getLineItemName(line: RentalItem): string {
  if (line.itemId && typeof line.itemId === "object" && "name" in line.itemId) {
    return String((line.itemId as Item).name || "Item");
  }
  return "Item";
}

export const RentalDeliveryQuickModal: React.FC<Props> = ({ rentalId, onClose }) => {
  const queryClient = useQueryClient();
  const open = !!rentalId;

  const rentalQuery = useQuery({
    queryKey: ["rental", rentalId],
    queryFn: () => rentalService.getRentalById(rentalId!),
    enabled: open,
  });

  const rental = rentalQuery.data?.data;

  const closeItemMutation = useMutation({
    mutationFn: async ({
      itemId,
      unitId,
      lineId,
    }: {
      itemId: string;
      unitId?: string;
      lineId?: string;
    }) => {
      const input = window.prompt(
        "Data da devolução (AAAA-MM-DD), ou deixe em branco para usar hoje:",
        new Date().toISOString().slice(0, 10),
      );
      if (input === null) {
        throw Object.assign(new Error("USER_CANCELLED"), { isUserCancel: true });
      }
      const trimmed = input.trim();
      return rentalService.closeRentalItem(rentalId!, itemId, {
        ...(trimmed ? { returnDate: trimmed } : {}),
        ...(unitId ? { unitId } : {}),
        ...(lineId ? { lineId } : {}),
      });
    },
    onSuccess: () => {
      toast.success("Devolução do item registrada.");
      queryClient.invalidateQueries({ queryKey: ["rental", rentalId] });
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
    },
    onError: (error: any) => {
      if (error?.isUserCancel) return;
      toast.error(error?.response?.data?.message || "Não foi possível registrar a devolução do item.");
    },
  });

  const closeRentalMutation = useMutation({
    mutationFn: () => rentalService.closeRental(rentalId!),
    onSuccess: () => {
      toast.success("Aluguel finalizado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["rental", rentalId] });
      queryClient.invalidateQueries({ queryKey: ["financial-board"] });
      queryClient.invalidateQueries({ queryKey: ["rentals"] });
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Não foi possível finalizar o aluguel.");
    },
  });

  if (!open) return null;

  const status = rental?.status;
  const statusLabel = status ? rentalStatusLabel[status] || status : "—";
  const allItemsReturned = rental?.items?.every((line) => !!line.returnActual) ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Devoluções do aluguel</h3>
            {rental && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {rental.rentalNumber ? `Contrato ${rental.rentalNumber}` : rentalId} · Status: {statusLabel}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 dark:hover:text-white text-sm"
          >
            Fechar
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {rentalId && (
            <Link
              to={`/rentals/${rentalId}`}
              className="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              onClick={onClose}
            >
              Abrir página completa do aluguel (edição e demais ações)
            </Link>
          )}

          {rentalQuery.isLoading && <p className="text-sm text-gray-600 dark:text-gray-300">Carregando…</p>}
          {rentalQuery.isError && (
            <p className="text-sm text-red-600">Não foi possível carregar o aluguel.</p>
          )}

          {rental && (
            <>
              <ul className="space-y-2">
                {rental.items.map((line, idx) => {
                  const itemId = getLineItemId(line);
                  const name = getLineItemName(line);
                  const done = !!line.returnActual;
                  return (
                    <li
                      key={`${itemId}-${idx}`}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-gray-200 dark:border-gray-600 rounded-lg p-3"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Qtd: {line.quantity}
                          {done && line.returnActual
                            ? ` · Devolvido em ${new Date(line.returnActual).toLocaleDateString("pt-BR")}`
                            : " · Pendente de devolução"}
                        </p>
                      </div>
                      {!done && (
                        <button
                          type="button"
                          disabled={closeItemMutation.isPending}
                          onClick={() =>
                            closeItemMutation.mutate({
                              itemId,
                              unitId: line.unitId,
                              lineId:
                                typeof line.lineId === "string" &&
                                line.lineId.trim()
                                  ? line.lineId.trim()
                                  : undefined,
                            })
                          }
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs disabled:opacity-50"
                        >
                          Registrar devolução
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                {status === "ready_to_close" && (
                  <button
                    type="button"
                    disabled={closeRentalMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Confirma a finalização completa do aluguel? Todos os itens devem estar entregues.",
                        )
                      ) {
                        closeRentalMutation.mutate();
                      }
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-sm disabled:opacity-50"
                  >
                    Finalizar aluguel (todas as devoluções concluídas)
                  </button>
                )}
                {status && status !== "ready_to_close" && status !== "completed" && !allItemsReturned && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Finalize a devolução de cada item acima. Quando todos estiverem devolvidos, o status poderá avançar
                    para &quot;Pronto para fechamento&quot; na página do aluguel; então você poderá usar o botão de
                    finalização completa aqui ou naquela tela.
                  </p>
                )}
                {status === "completed" && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">Este aluguel já está finalizado.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
