import { notificationService } from "modules/notification/notification.service";
import { NotificationUser } from "modules/notification/notification.types";
import { useState, useCallback } from "react";


export const useNotifications = () => {
  const [notifications, setNotifications] = useState<NotificationUser[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationService.list();
      setNotifications(data);
    } catch (error) {
      console.error("Erro ao carregar notificações", error);
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await notificationService.unreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error("Erro ao carregar contagem de não lidas", error);
    }
  }, []);

  const markAsRead = useCallback(
    async (id: string) => {
      try {
        await notificationService.markAsRead(id);
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === id ? { ...n, isRead: true } : n
          )
        );
        await loadUnreadCount();
      } catch (error) {
        console.error("Erro ao marcar como lida", error);
      }
    },
    [loadUnreadCount]
  );

  return {
    notifications,
    unreadCount,
    loadNotifications,
    loadUnreadCount,
    markAsRead,
  };
};
