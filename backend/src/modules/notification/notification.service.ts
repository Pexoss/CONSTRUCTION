import { RentalStatus } from "../rentals/rental.types";
import { User } from "../users/user.model";
import { NotificationType } from "./notification.types";
import { NotificationModel, NotificationUserModel } from "./notification.validator";


export class NotificationService {
  async notifyStatusChangeRequest(params: {
    title: string;
    message: string;
    companyId: string;
    createdByUserId: string;
    referenceId: string;
    requestedStatus: RentalStatus;
  }) {
    const notification = await NotificationModel.create({
      title: params.title,
      message: params.message,
      type: NotificationType.STATUS_CHANGE_REQUEST,
      companyId: params.companyId,
      createdByUserId: params.createdByUserId,
      referenceId: params.referenceId,
      requestedStatus: params.requestedStatus,
    });

    const users = await User.find(
      {
        companyId: params.companyId,
        role: { $in: ["operator", "admin", "superadmin"] },
        _id: { $ne: params.createdByUserId }, // comente isso
      },
    );

    if (users.length === 0) return;

    await NotificationUserModel.insertMany(
      users.map((user) => ({
        notificationId: notification._id,
        userId: user._id,
        isRead: false,
      }))
    );
  }

  async getStatusChangeRequests(rentalId: string) {
    // busca no banco só as notificações do tipo STATUS_CHANGE_REQUEST com referenceId igual ao rentalId
    return NotificationModel.find({
      type: NotificationType.STATUS_CHANGE_REQUEST,
      referenceId: rentalId,
    }).exec();
  }

  async rejectStatusChange(notificationId: string, adminId: string) {
    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      throw new Error("Notificação não encontrada");
    }

    if (notification.resolved) {
      const error: any = new Error("Essa solicitação já foi resolvida.");
      error.status = 409;
      throw error;
    }

    notification.resolved = true;
    notification.resolution = "approved";
    notification.resolvedAt = new Date();
    await notification.save();

    return notification;
  }

}

export const notificationService = new NotificationService();