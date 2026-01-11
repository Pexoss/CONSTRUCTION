export interface Customer {
  _id: string;
  companyId: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  notes?: string;
  isBlocked: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCustomerData {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  notes?: string;
  isBlocked?: boolean;
}

export interface CustomerFilters {
  search?: string;
  isBlocked?: boolean;
  page?: number;
  limit?: number;
}
