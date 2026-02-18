import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type RentalStatus = 'reserved' | 'active' | 'overdue' | 'completed' | 'cancelled';
export type RentalType = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type BillingCycle = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

// NOVO: Interface para serviços adicionais
export interface IRentalService {
  description: string;
  price: number;
  quantity: number;
  subtotal: number;
  category: string; // Ex: "frete", "limpeza", "instalação"
  notes?: string;
}

export type UpdateRentalStatusResult = | IRental | {
  requiresApproval: true;
  currentStatus: RentalStatus;
};

// NOVO: Interface para endereço da obra
export interface IRentalWorkAddress {
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
  workName: string; // Nome da obra
  workId?: mongoose.Types.ObjectId; // Referência à obra cadastrada
}

// NOVO: Interface para histórico de alterações
export interface IRentalChangeHistory {
  date: Date;
  changedBy: mongoose.Types.ObjectId;
  changeType: string; // 'rental_type', 'discount', 'extension', etc.
  previousValue: string;
  newValue: string;
  reason?: string;
  approvedBy?: mongoose.Types.ObjectId;
}

// NOVO: Interface para aprovações pendentes
export interface IRentalPendingApproval {
  requestedBy: mongoose.Types.ObjectId;
  requestDate: Date;
  requestType: string; // 'rental_type_change', 'discount', etc.
  requestDetails: Record<string, any>;
  status: ApprovalStatus;
  approvedBy?: mongoose.Types.ObjectId;
  approvalDate?: Date;
  notes?: string;
}

export interface IRentalItem {
  itemId: mongoose.Types.ObjectId;
  // NOVO: Para itens unitários, especificar qual unidade
  unitId?: string; // Ex: "F421" (null se for quantitativo)
  quantity: number; // Para quantitativos (1 se for unitário)
  unitPrice: number;
  rentalType: RentalType; // NOVO: tipo de aluguel (diária, semanal, etc.)
  subtotal: number;
}

export interface IRentalDates {
  reservedAt: Date;
  pickupScheduled: Date;
  pickupActual?: Date;
  returnScheduled: Date;
  returnActual?: Date;

  // NOVO: Datas de fechamento periódico
  billingCycle?: BillingCycle;
  lastBillingDate?: Date;
  nextBillingDate?: Date;
}

export interface IRentalPricing {
  equipmentSubtotal: number;
  originalEquipmentSubtotal: number;
  servicesSubtotal: number;
  contractedDays: number;
  subtotal: number;
  deposit: number;
  discount: number;
  discountReason?: string;
  discountApprovedBy?: mongoose.Types.ObjectId;
  lateFee: number;
  usedDays: number;
  total: number;
}

export interface IRentalChecklist {
  photos?: string[];
  conditions?: Record<string, any>;
  notes?: string;
  completedAt?: Date;
  completedBy?: mongoose.Types.ObjectId;
}

export interface UpdateRentalStatusResponse {
  success: boolean;
  message: string;
  data: IRental;
  requiresApproval?: boolean;
}

export interface IRental extends Document {
  companyId: mongoose.Types.ObjectId;
  rentalNumber?: string;
  customerId: mongoose.Types.ObjectId;
  items: IRentalItem[];

  // NOVO: Serviços adicionais
  services?: IRentalService[];

  // NOVO: Endereço da obra
  workAddress?: IRentalWorkAddress;

  dates: IRentalDates;
  pricing: IRentalPricing;

  // NOVO: Histórico de alterações
  changeHistory?: IRentalChangeHistory[];
  // NOVO: Solicitações pendentes
  pendingApprovals?: IRentalPendingApproval[];

  status: RentalStatus;
  notes?: string;
  checklistPickup?: IRentalChecklist;
  checklistReturn?: IRentalChecklist;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}
//Detalhes do item
export interface RentalDetails {
  itemId: string;
  status: 'available' | 'rented' | 'maintenance';
  rentedBy?: {
    customerId: string;
    name: string;
  };
  maintenance?: {
    provider: string;
    expectedReturnDate: Date;
    cost: number;
  };
  rentalInfo?: {
    rentalId: string;
    rentalNumber: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  };
}
