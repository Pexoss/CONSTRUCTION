import mongoose, { Schema, Model } from 'mongoose';
import { IMaintenance } from './maintenance.types';

const MaintenanceSchema = new Schema<IMaintenance>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: [true, 'Company ID is required'],
      index: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: 'Item',
      required: [true, 'Item ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['preventive', 'corrective'],
      required: [true, 'Maintenance type is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'in_progress', 'completed'],
      default: 'scheduled',
      index: true,
    },
    scheduledDate: {
      type: Date,
      required: [true, 'Scheduled date is required'],
      index: true,
    },
    completedDate: {
      type: Date,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    cost: {
      type: Number,
      required: [true, 'Cost is required'],
      min: 0,
      default: 0,
    },
    performedBy: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    attachments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
MaintenanceSchema.index({ companyId: 1, itemId: 1 });
MaintenanceSchema.index({ companyId: 1, status: 1 });
MaintenanceSchema.index({ companyId: 1, type: 1 });
MaintenanceSchema.index({ companyId: 1, scheduledDate: 1 });
MaintenanceSchema.index({ companyId: 1, itemId: 1, status: 1 });

export const Maintenance: Model<IMaintenance> = mongoose.model<IMaintenance>(
  'Maintenance',
  MaintenanceSchema
);
