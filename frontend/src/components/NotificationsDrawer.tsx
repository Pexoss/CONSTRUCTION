import { X } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import { useAuthStore } from '../../src/store/auth.store';
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationService } from "modules/notification/notification.service";
import { toast } from "react-toastify";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const NotificationsDrawer = ({ open, onClose }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const {
    notifications,
    loadNotifications,
    markAsRead,
    loadUnreadCount,
  } = useNotifications();

  useEffect(() => {
    if (!open) return;

    loadNotifications();
  }, [open]);

  useEffect(() => {
  }, [notifications]);

  const approveMutation = useMutation({
    mutationFn: (notificationId: string) =>
      notificationService.approveStatus(notificationId),

    onSuccess: (response) => {
      toast.success("Status aprovado com sucesso");

      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      queryClient.invalidateQueries({
        queryKey: ["rental", response.rental._id],
      });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (notificationId: string) =>
      notificationService.rejectStatus(notificationId),
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ||
        "Essa solicitação já foi resolvida.";

      toast.error(message);
    },
    onSuccess: () => {
      toast.success("Solicitação resolvida");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  if (!open) return null;

  const handleClickNotification = async (id: string, isRead: boolean) => {
    if (!isRead) {
      await markAsRead(id);
      await loadUnreadCount();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* overlay */}
      <div
        className="flex-1 bg-black bg-opacity-40"
        onClick={onClose}
      />

      {/* drawer */}
      <div className="w-96 max-w-full h-full bg-white dark:bg-gray-800 shadow-xl p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Notificações</h2>
          <button onClick={onClose}>
            <X />
          </button>
        </div>

        {notifications.length === 0 && (
          <p className="text-sm text-gray-500">
            Nenhuma notificação
          </p>
        )}

        <ul className="space-y-3">
          {notifications.map((item) => (
            <li
              key={item._id}
              onClick={() => handleClickNotification(item._id, item.isRead)}
              className={`p-3 rounded-md cursor-pointer transition ${item.isRead
                ? "bg-gray-100 dark:bg-gray-700"
                : "bg-indigo-50 dark:bg-indigo-900"
                }`}
            >
              <p className="text-sm font-medium">
                {item.notificationId?.title || "Sem título"}
              </p>

              <p className="text-xs text-gray-600 dark:text-gray-300">
                {item.notificationId?.message || "Sem mensagem"}
              </p>
              <p>ID do aluguel: {item.notificationId.referenceId}</p>
              <p>Status solicitado: {item.notificationId.requestedStatus}</p>

              {/* BOTÃO APROVAR — SÓ ADMIN */}
              {user?.role === "admin" || user?.role === "superadmin" ? (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => approveMutation.mutate(item._id)}
                    className="px-3 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700"
                  >
                    Aprovar
                  </button>

                  <button
                    onClick={() => rejectMutation.mutate(item._id)}
                    className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Recusar
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/rentals/${item.notificationId.referenceId}`);
                    }}
                    className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Analisar
                  </button>

                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
