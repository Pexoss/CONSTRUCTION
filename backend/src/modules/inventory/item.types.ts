import { Document } from 'mongoose';
import mongoose from 'mongoose';

// Interface para unidades individuais (itens unitários)
export interface IItemUnit {
  unitId: string; // Ex: "F421", "B013"
  status: 'available' | 'rented' | 'reserved' | 'maintenance' | 'damaged';
  currentRental?: mongoose.Types.ObjectId; // Referência ao aluguel atual (se rented)
  currentCustomer?: mongoose.Types.ObjectId; // Cliente atual (se rented)
  maintenanceDetails?: {
    expectedReturnDate?: Date;
    cost?: number;
    supplier?: string;
  };
  location?: string;
  notes?: string;
}

export interface IItem extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  sku: string;
  barcode?: string;
  customId?: string; // ID customizado manual (ex: "betoneira 13")
  
  // NOVO: Tipo de controle de estoque
  trackingType: 'unit' | 'quantity'; // 'unit' = unitário com ID único, 'quantity' = quantitativo
  
  // NOVO: Para itens unitários - array de unidades individuais
  units?: IItemUnit[];
  
  // Para itens quantitativos - controle numérico (mantido para compatibilidade)
  quantity: {
    total: number;
    available: number;
    reserved: number;
    rented: number;
    maintenance: number;
    damaged: number;
  };
  
  // Depreciação individual
  depreciation?: {
    initialValue?: number;
    currentValue?: number;
    depreciationRate?: number; // porcentagem anual
    purchaseDate?: Date;
    lastDepreciationDate?: Date;
    accumulatedDepreciation?: number; // NOVO
    annualRate?: number; // NOVO: percentual anual (ex: 13 = 13%)
  };
  
  pricing: {
    dailyRate: number;
    weeklyRate?: number;
    biweeklyRate?: number; // NOVO: quinzenal
    monthlyRate?: number;
    depositAmount?: number;
  };
  
  photos: string[];
  specifications?: Record<string, any>;
  location?: string;
  lowStockThreshold?: number; // alerta de estoque baixo
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}


export interface ICategory extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ISubcategory extends Document {
  companyId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IItemMovement extends Document {
  companyId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId;
  type: 'in' | 'out' | 'rent' | 'return' | 'maintenance_start' | 'maintenance_end' | 'damage' | 'repair' | 'adjustment';
  quantity: number;
  previousQuantity: {
    total: number;
    available: number;
    rented: number;
    maintenance: number;
    damaged: number;
  };
  newQuantity: {
    total: number;
    available: number;
    rented: number;
    maintenance: number;
    damaged: number;
  };
  referenceId?: mongoose.Types.ObjectId;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
}



// Type aliases for backwards compatibility
export type Category = ICategory;
export type Subcategory = ISubcategory;
export type ItemMovement = IItemMovement;
