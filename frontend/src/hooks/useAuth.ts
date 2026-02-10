import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { authService } from '../modules/auth/auth.service';
import { LoginCredentials, RegisterCompanyData } from '../types/auth.types';

export const useAuth = () => {
  const { user, isAuthenticated, login, logout, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  // Get current user
  const { data: currentUser, isLoading: isLoadingUser, error: userError } = useQuery({
    queryKey: ['me'],
    queryFn: () => authService.getMe(),
    enabled: isAuthenticated && !!localStorage.getItem('accessToken'),
    retry: (failureCount, error: any) => {
      // Não fazer retry em 401 (não autenticado)
      if (error?.response?.status === 401) {
        console.log('[AUTH] 401 Unauthorized - não fazendo retry');
        return false;
      }
      // Fazer retry até 2 vezes em outros erros
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // Handle user data when query succeeds
  useEffect(() => {
    if (currentUser?.data) {
      setUser(currentUser.data);
    }
  }, [currentUser, setUser]);

  // Handle user query error
  useEffect(() => {
    if (userError) {
      const isUnauthorized = (userError as any)?.response?.status === 401;
      if (isUnauthorized) {
        console.log('[AUTH] Usuário não autenticado, fazendo logout');
        logout();
      } else {
        console.warn('[AUTH] Erro ao validar usuário:', userError);
        // Não fazer logout em erros de rede ou servidor
        // O retry automático do React Query tentará novamente
      }
    }
  }, [userError, logout]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authService.login(credentials),
    onSuccess: (data) => {
      login(data.data.user, data.data.tokens);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error: any) => {
      // Error will be available in loginError
      console.error('Login error:', error);
    },
  });

  // Register company mutation
  const registerCompanyMutation = useMutation({
    mutationFn: (data: RegisterCompanyData) => authService.registerCompany(data),
    onSuccess: (data) => {
      login(data.data.user, data.data.tokens);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error: any) => {
      console.error('Registration error:', error);
    },
  });

  // Logout function
  const handleLogout = () => {
    logout();
    queryClient.clear();
  };

  return {
    user: currentUser?.data || user,
    isAuthenticated,
    isLoadingUser,
    login: loginMutation.mutate,
    registerCompany: registerCompanyMutation.mutateAsync,
    logout: handleLogout,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerCompanyMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerCompanyMutation.error,
  };
};
