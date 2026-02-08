import { Schema, model } from "mongoose";
import { NotificationType } from "./notification.types";

const NotificationSchema = new Schema(
    {
        title: {
            type: String,
            required: true,
            maxlength: 150,
        },

        message: {
            type: String,
            required: true,
            maxlength: 500,
        },

        type: {
            type: String,
            enum: Object.values(NotificationType),
            required: true,
        },

        companyId: {
            type: Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },

        createdByUserId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        referenceId: {
            type: Schema.Types.ObjectId,
        },

        requestedStatus: {
            type: String,
            enum: ["reserved", "active", "overdue", "completed", "cancelled"],
        },

        resolved: {
            type: Boolean,
            default: false,
        },

        resolution: {
            type: String,
            enum: ["approved", "rejected"],
        },

        resolvedAt: {
            type: Date,
        },
    },
    {
        timestamps: {
            createdAt: true,
            updatedAt: false,
        },
    }
);


const NotificationUserSchema = new Schema(
    {
        notificationId: {
            type: Schema.Types.ObjectId,
            ref: "Notification",
            required: true,
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        isRead: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            required: false,
        },
    },
    {
        timestamps: true,
    }
);

NotificationUserSchema.index(
    { notificationId: 1, userId: 1 },
    { unique: true }
);

export const NotificationModel = model(
    "Notification",
    NotificationSchema
);

export const NotificationUserModel = model(
    "NotificationUser",
    NotificationUserSchema
);