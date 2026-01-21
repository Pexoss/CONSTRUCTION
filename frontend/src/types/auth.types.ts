export type UserRole = 'superadmin' | 'admin' | 'manager' | 'operator' | 'viewer';

export interface User {
  _id: string;
  companyId: string;
  companyCode?: string;
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
  companyCode: string;
}

export interface RegisterCompanyData {
  companyName: string;
  cnpj: string;
  email: string;
  phone?: string;
  code?: string;
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
    company: {
      _id: string;
      name: string;
      email: string;
      cnpj: string;
      code: string;
    };
    user: User;
    tokens: AuthTokens;
  };
}

export interface MeResponse {
  success: boolean;
  data: User;
}
