import api from '../../config/api';
import {
  LoginCredentials,
  RegisterCompanyData,
  RegisterUserData,
  AuthResponse,
  MeResponse,
} from '../../types/auth.types';

export const authService = {
  /**
   * Register a new company with first superadmin user
   */
  registerCompany: async (data: RegisterCompanyData): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/register', data);
    return response.data;
  },

  /**
   * Register a new user within a company
   */
  registerUser: async (data: RegisterUserData): Promise<{ success: boolean; data: any }> => {
    const response = await api.post('/auth/register/user', data);
    return response.data;
  },

  /**
   * Login user
   */
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string): Promise<{ accessToken: string }> => {
    const response = await api.post<{ success: boolean; data: { accessToken: string } }>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data.data;
  },

  /**
   * Get current authenticated user
   */
  getMe: async (): Promise<MeResponse> => {
    const response = await api.get<MeResponse>('/auth/me');
    return response.data;
  },
};
