import { NotificationType } from "./notification.types";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  companyId: string;
  createdByUserId: string;
  referenceId?: string;
  createdAt: Date;
}

// NotificationUser agora sabe que notificationId é o objeto populado
export interface NotificationUser {
  id: string;
  notificationId: Notification & { createdByUserId?: { name: string; role: string } };
  userId: string;
  isRead: boolean;
  readAt?: Date;
}

export interface PopulatedNotification {
  _id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: Date;
  createdByUserId?: { name: string; role: string };
}

export interface PopulatedNotificationUser {
  _id: string;
  isRead: boolean;
  readAt?: Date;
  notificationId: PopulatedNotification; 
}
