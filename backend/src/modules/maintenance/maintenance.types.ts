import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type MaintenanceType = 'preventive' | 'corrective';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed';

export interface IMaintenance extends Document {
  companyId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduledDate: Date;
  completedDate?: Date;
  description: string;
  cost: number;
  performedBy?: string;
  notes?: string;
  attachments: string[];
  createdAt?: Date;
  updatedAt?: Date;
}
