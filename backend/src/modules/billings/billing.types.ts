import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type BillingStatus = 'draft' | 'pending_approval' | 'approved' | 'paid' | 'cancelled';
export type RentalType = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// Interface para itens do fechamento
export interface IBillingItem {
  itemId: mongoose.Types.ObjectId;
  unitId?: string; // Para itens unitários
  quantity: number;
  unitPrice: number;
  periodsCharged: number; // Quantos períodos foram cobrados
  subtotal: number;
}

// Interface para serviços do fechamento
export interface IBillingService {
  description: string;
  price: number;
  quantity: number;
  subtotal: number;
}

// Interface para cálculo do período
export interface IBillingCalculation {
  baseRate: number;
  periodsCompleted: number; // Quantos períodos completos
  extraDays: number; // Dias excedentes
  chargeExtraPeriod: boolean; // Se cobra período completo por excedente
  baseAmount: number;
  servicesAmount: number;
  subtotal: number;
  discount: number;
  discountReason?: string;
  total: number;
}

// Interface para desconto de entrega antecipada
export interface IBillingEarlyReturn {
  isEarly: boolean;
  daysSaved: number;
  discountApplied: number;
  approvedBy?: mongoose.Types.ObjectId;
}

export interface IBilling extends Document {
  companyId: mongoose.Types.ObjectId;
  rentalId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  
  billingNumber: string; // Ex: "FCH-2025-0001"
  billingDate: Date;
  periodStart: Date;
  periodEnd: Date;
  
  rentalType: RentalType;
  
  // Cálculo do período
  calculation: IBillingCalculation;
  
  // Desconto para entrega antecipada
  earlyReturn?: IBillingEarlyReturn;
  
  items: IBillingItem[];
  services: IBillingService[];
  
  status: BillingStatus;
  
  // Aprovações
  approvalRequired: boolean;
  requestedBy: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  approvalDate?: Date;
  approvalNotes?: string;
  
  paymentDate?: Date;
  paymentMethod?: string;
  
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
