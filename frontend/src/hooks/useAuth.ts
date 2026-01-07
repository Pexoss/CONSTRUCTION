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
    retry: false,
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
      logout();
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
      // Error will be available in registerError
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
    registerCompany: registerCompanyMutation.mutate,
    logout: handleLogout,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerCompanyMutation.isPending,
    loginError: loginMutation.error,
    registerError: registerCompanyMutation.error,
  };
};
