export type NotificationType =
  | "STATUS_CHANGE_REQUEST"
  | "STATUS_CHANGE_APPROVED"
  | "STATUS_CHANGE_REJECTED"
  | "INFO"
  | "WARNING";

export interface Notification {
  _id: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string; // ou Date
  createdByUserId?: { name: string; role: string };
  referenceId?: string;       
  requestedStatus?: string;
}


export interface NotificationUser {
  _id: string;
  isRead: boolean;
  readAt?: string;
  notificationId: Notification; // já populat
}

export interface FormattedNotificationUser {
  id: string;
  isRead: boolean;
  readAt?: Date;
  notification: {
    id: string;
    title: string;
    message: string;
    type: string;
    createdAt: string | Date;
    createdBy?: string;
  };
}
