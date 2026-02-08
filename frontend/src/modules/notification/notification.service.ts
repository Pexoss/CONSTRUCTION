import { UpdateRentalStatusResponse } from 'types/rental.types';
import api from '../../config/api';
import { NotificationUser } from './notification.types';

export class NotificationService {
  async list(): Promise<NotificationUser[]> {
    const { data } = await api.get<NotificationUser[]>(
      '/notifications'
    );
    return data;
  }

  async unreadCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>(
      '/notifications/unread-count'
    );

    return data.count;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await api.patch(
      `/notifications/${notificationId}/read`
    );
  }

  async approveStatus(notificationId: string): Promise<UpdateRentalStatusResponse> {
    const { data } = await api.post(`/notifications/${notificationId}/approve`);
    return data;
  }

  async rejectStatus(notificationId: string) {
    const response = await api.post(
      `/notifications/${notificationId}/reject`
    );

    return response.data;
  }
}

export const notificationService = new NotificationService();
