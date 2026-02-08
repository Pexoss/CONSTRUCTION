import { Router } from "express";
import { notificationController } from "./notification.controller";
import { authMiddleware } from "../../shared/middleware/auth.middleware";
import { tenantMiddleware } from "../../shared/middleware/tenant.middleware";

const routes = Router();

routes.use(authMiddleware);
routes.use(tenantMiddleware);

routes.get("/", notificationController.list);
routes.patch("/:id/read", notificationController.markAsRead.bind(notificationController));
routes.get("/unread-count", notificationController.unreadCount.bind(notificationController));
routes.post("/:id/approve",notificationController.approveStatusChange.bind(notificationController));
routes.post("/:id/reject",notificationController.rejectStatusChange.bind(notificationController));


export default routes;
