import { Document } from 'mongoose';
import mongoose from 'mongoose';

export type MaintenanceType = 'preventive' | 'corrective';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

// NOVO: Interface para dados do fornecedor
export interface IMaintenanceSupplier {
  name: string;
  cnpj?: string;
  contact?: string;
  phone?: string;
}

export interface IMaintenance extends Document {
  companyId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  
  // NOVO: ID da unidade específica (se item for unitário)
  unitId?: string;
  
  type: MaintenanceType;
  status: MaintenanceStatus;
  scheduledDate: Date;
  
  // NOVO: Data de início
  startedDate?: Date;
  
  completedDate?: Date;
  
  // NOVO: Previsão de entrega
  expectedReturnDate?: Date;
  
  description: string;
  cost: number;
  
  // NOVO: Dados do fornecedor
  supplier?: IMaintenanceSupplier;
  
  performedBy?: string;
  notes?: string;
  attachments: string[];
  
  // NOVO: Flag de indisponibilidade do item
  itemUnavailable: boolean;
  
  createdAt?: Date;
  updatedAt?: Date;
}
