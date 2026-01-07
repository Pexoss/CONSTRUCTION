export type UserRole = 'superadmin' | 'admin' | 'manager' | 'operator' | 'viewer';

export interface User {
  _id: string;
  companyId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  companyId: string;
}

export interface RegisterCompanyData {
  companyName: string;
  cnpj: string;
  email: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  userName: string;
  userEmail: string;
  password: string;
}

export interface RegisterUserData {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    tokens: AuthTokens;
  };
}

export interface MeResponse {
  success: boolean;
  data: User;
}
