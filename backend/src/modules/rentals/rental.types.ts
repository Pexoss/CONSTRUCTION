import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type RentalStatus = 'reserved' | 'active' | 'overdue' | 'completed' | 'cancelled';

export interface IRentalItem {
  itemId: mongoose.Types.ObjectId;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface IRentalDates {
  reservedAt: Date;
  pickupScheduled: Date;
  pickupActual?: Date;
  returnScheduled: Date;
  returnActual?: Date;
}

export interface IRentalPricing {
  subtotal: number;
  deposit: number;
  discount: number;
  lateFee: number;
  total: number;
}

export interface IRentalChecklist {
  photos?: string[];
  conditions?: Record<string, any>;
  notes?: string;
  completedAt?: Date;
  completedBy?: mongoose.Types.ObjectId;
}

export interface IRental extends Document {
  companyId: mongoose.Types.ObjectId;
  rentalNumber: string;
  customerId: mongoose.Types.ObjectId;
  items: IRentalItem[];
  dates: IRentalDates;
  pricing: IRentalPricing;
  status: RentalStatus;
  notes?: string;
  checklistPickup?: IRentalChecklist;
  checklistReturn?: IRentalChecklist;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
