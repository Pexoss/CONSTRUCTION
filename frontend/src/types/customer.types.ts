export interface CustomerAddress {
  type: 'main' | 'billing' | 'work' | 'other';
  workName?: string;
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


export interface CustomerWork {
  workId: string;
  workName: string;
  addressIndex: number;
  startDate: string;
  expectedEndDate?: string;
  status: 'active' | 'paused' | 'completed';
  activeRentals: string[];
  notes?: string;
}

export interface Customer {
  _id: string;
  companyId: string;
  name: string;
  cpfCnpj: string;
  validated?: {
    isValidated: boolean;
    validatedAt?: string;
    cpfName?: string;
    birthDate?: string;
    additionalInfo?: Record<string, any>;
  };
  email?: string;
  phone?: string;
  addresses?: CustomerAddress[];
  works?: CustomerWork[];
  notes?: string;
  isBlocked: boolean;
  blockReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCustomerData {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  addresses?: CustomerAddress[];
  notes?: string;
  isBlocked?: boolean;
}

export interface CustomerFilters {
  search?: string;
  isBlocked?: boolean;
  page?: number;
  limit?: number;
}
