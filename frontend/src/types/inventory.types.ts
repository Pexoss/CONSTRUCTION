export interface ItemUnit {
  unitId: string;
  status: 'available' | 'rented' | 'maintenance' | 'damaged';
  currentRental?: string;
  currentCustomer?: string;
  maintenanceDetails?: {
    expectedReturnDate?: string;
    cost?: number;
    supplier?: string;
  };
  location?: string;
  notes?: string;
}

export interface Item {
  _id: string;
  companyId: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  sku: string;
  barcode?: string;
  customId?: string;
  trackingType: 'unit' | 'quantity';
  units?: ItemUnit[];
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
    biweeklyRate?: number;
    monthlyRate?: number;
    depositAmount?: number;
  };
  location?: string;
  depreciation?: {
    initialValue?: number;
    currentValue?: number;
    depreciationRate?: number;
    annualRate?: number;
    accumulatedDepreciation?: number;
    purchaseDate?: string;
    lastDepreciationDate?: string;
  };
  lowStockThreshold?: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ItemMovement {
  _id: string;
  companyId: string;
  itemId: string | Item;
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
  referenceId?: string;
  notes?: string;
  createdBy: string | { name: string; email: string };
  createdAt?: string;
}

export interface Category {
  _id: string;
  companyId: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subcategory {
  _id: string;
  companyId: string;
  categoryId: string | Category;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateItemData {
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  sku: string;
  barcode?: string;
  customId?: string;
  trackingType: 'unit' | 'quantity';
  units?: ItemUnit[];
  photos?: string[];
  specifications?: Record<string, any>;
  quantity: {
    total: number;
    available?: number;
    rented?: number;
    maintenance?: number;
    damaged?: number;
  };
  pricing: {
    dailyRate: number;
    weeklyRate?: number;
    biweeklyRate?: number;
    monthlyRate?: number;
    depositAmount?: number;
  };
  location?: string;
  depreciation?: {
    initialValue: number;
    depreciationRate: number;
    purchaseDate: string;
  }
  lowStockThreshold?: number;
  isActive?: boolean;
}

export type CreateItemInput = {
  name: string;
  trackingType: 'unit' | 'quantity';
  units?: {
    unitId: string;
    status: 'available' | 'rented' | 'maintenance' | 'damaged';
    location?: string;
    notes?: string;
  }[];
  quantity: {
    total: number;
  };
};


export interface EditItemData {
  name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  sku?: string;
  barcode?: string;
  customId?: string;
  photos?: string[];
  specifications?: Record<string, any>;
  quantity?: {
    total?: number;
    rented?: number;
    maintenance?: number;
    damaged?: number;
  };

  pricing?: {
    dailyRate?: number;
    weeklyRate?: number;
    biweeklyRate?: number;
    monthlyRate?: number;
    depositAmount?: number;
  };

  depreciation?: {
    initialValue?: number;
    depreciationRate?: number;
    purchaseDate?: string;
  } | null;

  location?: string;
  lowStockThreshold?: number;
  isActive?: boolean;
}


export interface ItemFilters {
  category?: string;
  subcategory?: string;
  search?: string;
  isActive?: boolean;
  lowStock?: boolean;
  page?: number;
  limit?: number;
}

export interface AdjustQuantityData {
  type: 'in' | 'out' | 'adjustment' | 'damage' | 'repair';
  quantity: number;
  notes?: string;
}
