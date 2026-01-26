import { Document } from 'mongoose';
import mongoose from 'mongoose';

// Interface para endereços múltiplos
export interface ICustomerAddress {
  _id?: string;
  type: 'main' | 'billing' | 'work' | 'other';
  street: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
  notes?: string;
}

// Interface para obras do cliente
export interface ICustomerWork {
  workId: mongoose.Types.ObjectId;
  workName: string;
  addressIndex: number; // Índice do endereço no array addresses
  startDate: Date;
  expectedEndDate?: Date;
  status: 'active' | 'paused' | 'completed';
  activeRentals: mongoose.Types.ObjectId[]; // Aluguéis ativos nesta obra
  notes?: string;
}

export interface ICustomer extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  cpfCnpj: string;
  
  // NOVO: Dados validados pela Receita Federal
  validated?: {
    isValidated: boolean;
    validatedAt?: Date;
    cpfName?: string; // Nome retornado pela Receita
    birthDate?: Date;
    additionalInfo?: Record<string, any>; // Outros dados da API
  };
  
  email?: string;
  phone?: string;
  
  // NOVO: Múltiplos endereços (substitui address único)
  addresses?: ICustomerAddress[];
  
  // NOVO: Obras do cliente
  works?: ICustomerWork[];
  
  notes?: string;
  isBlocked: boolean;
  blockReason?: string; // NOVO: motivo do bloqueio
  createdAt?: Date;
  updatedAt?: Date;
}
