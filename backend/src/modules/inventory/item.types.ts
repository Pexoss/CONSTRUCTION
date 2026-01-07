import { Document } from 'mongoose';
import mongoose from 'mongoose';

export interface IItem extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  sku: string;
  barcode?: string;
  customId?: string; // ID customizado manual (ex: "betoneira 13")
  photos: string[];
  specifications?: Record<string, any>;
  quantity: {
    total: number;
    available: number;
    rented: number;
    maintenance: number;
    damaged: number;
  };
  pricing: {
    dailyRate: number;
    weeklyRate?: number;
    monthlyRate?: number;
    depositAmount?: number;
  };
  location?: string;
  depreciation?: {
    initialValue?: number;
    currentValue?: number;
    depreciationRate?: number; // porcentagem anual
    purchaseDate?: Date;
    lastDepreciationDate?: Date;
  };
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
