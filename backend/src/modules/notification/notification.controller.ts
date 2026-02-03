import { NextFunction, Request, Response } from "express";
import { NotificationModel, NotificationUserModel } from "./notification.validator";
import { Types } from "mongoose";
import { RentalStatus } from "../rentals/rental.types";
import { rentalService } from "../rentals/rental.service";
import { notificationService } from "./notification.service";

class NotificationController {
  async list(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Usuário não logado" });
      }

      let notifications;

      if (["admin", "superadmin"].includes(user.role)) {
        // Admin vê todas as notificações da empresa
        notifications = await NotificationModel.find({
          companyId: new Types.ObjectId(user.companyId),
          type: "STATUS_CHANGE_REQUEST",
          resolved: false,
        })
          .sort({ createdAt: -1 })
          .exec();

        // map para ficar compatível com NotificationUserModel
        notifications = notifications.map((n) => ({
          _id: n._id,
          notificationId: n,
          isRead: false, // você pode implementar leitura separada depois
        }));
      } else {
        // Funcionários só veem as notificações que receberam
        notifications = await NotificationModel.find({
          companyId: new Types.ObjectId(user.companyId),
          type: "STATUS_CHANGE_REQUEST",
          resolved: false,
        })
          .populate("notificationId")
          .sort({ createdAt: -1 })
          .exec();
      }

      res.json(notifications);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erro ao buscar notificações", error });
    }
  }

  async markAsRead(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await NotificationUserModel.findByIdAndUpdate(id, { isRead: true }).exec();
      res.status(200).json({ message: "Notificação marcada como lida" });
    } catch (error) {
      res.status(500).json({ message: "Erro ao marcar notificação como lida", error });
    }
  }

  async unreadCount(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) return res.status(401).json({ message: "Usuário não logado" });

      let count = 0;

      if (["admin", "superadmin"].includes(user.role)) {
        // Admin: conta todas notificações da empresa do tipo STATUS_CHANGE_REQUEST
        count = await NotificationModel.countDocuments({
          companyId: new Types.ObjectId(user.companyId),
          type: "STATUS_CHANGE_REQUEST",
          resolved: false,
        });
      } else {
        // Funcionário: conta notificações não lidas
        count = await NotificationUserModel.countDocuments({
          userId: new Types.ObjectId(user._id),
          isRead: false,
        });
      }

      res.json({ count });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Erro ao contar notificações não lidas", error });
    }
  }

  //endpoint para aprovação de status
  async approveStatusChange(req: Request, res: Response) {
    const notificationId = req.params.id;
    const adminId = req.user!._id.toString();

    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Notificação não encontrada" });
    }

    if (notification.resolved) {
      return res.status(400).json({
        message: "Solicitação já foi resolvida",
      });
    }

    if (!notification.referenceId || !notification.requestedStatus) {
      return res.status(400).json({ message: "Solicitação inválida" });
    }

    //aplica a mudança no aluguel
    await rentalService.updateRentalStatus(
      notification.companyId.toString(),
      notification.referenceId.toString(),
      notification.requestedStatus as RentalStatus,
      adminId
    );

    //marca notificação como resolvida
    notification.resolved = true;
    notification.resolution = "approved";
    notification.resolvedAt = new Date();

    await notification.save();

    // marca como lida para todos
    await NotificationUserModel.updateMany(
      { notificationId },
      { isRead: true, readAt: new Date() }
    );

    return res.json({
      success: true,
      message: "Solicitação aprovada com sucesso",
    });
  }

  async rejectStatusChange(req: Request, res: Response) {
    try {
      const notificationId = req.params.id;
      const userId = req.user!._id.toString();

      const notification =
        await notificationService.rejectStatusChange(notificationId, userId);

      return res.status(200).json({
        success: true,
        message: "Solicitação de alteração de status recusada",
        data: notification,
      });
    } catch (error: any) {
      console.error("❌ rejectStatusChange error:", error.message);

      return res.status(error.status || 500).json({
        success: false,
        message: error.message || "Erro ao recusar solicitação",
      });
    }
  }
}

export const notificationController = new NotificationController();
