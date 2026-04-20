import { Document } from "mongoose";
import mongoose from "mongoose";

export type ChargeStatus = "pending" | "partial" | "paid" | "cancelled";

export interface IChargePayment {
  amount: number;
  discount?: number;
  paidAt: Date;
  paymentMethod?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
}

export interface ICharge extends Document {
  companyId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  billingIds: mongoose.Types.ObjectId[];
  chargeNumber: string;
  dueDate?: Date;
  status: ChargeStatus;
  total: number;
  paidAmount: number;
  outstandingAmount: number;
  payments: IChargePayment[];
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

