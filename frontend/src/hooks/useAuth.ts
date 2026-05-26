import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth.store";
import { authService } from "../modules/auth/auth.service";
import { LoginCredentials, RegisterCompanyData } from "../types/auth.types";

export const useAuth = () => {
  const { user, isAuthenticated, login, logout, setUser } = useAuthStore();
  const queryClient = useQueryClient();

  // Get current user
  const {
    data: currentUser,
    isLoading: isLoadingUser,
    error: userError,
  } = useQuery({
    queryKey: ["me"],
    queryFn: () => authService.getMe(),
    enabled: isAuthenticated && !!localStorage.getItem("accessToken"),
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error: any) => {
      const status = error?.response?.status;

      if (status === 401 || status === 429) {
        return false;
      }

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

  // Erros de /auth/me: o interceptor em api.ts tenta refresh e só redireciona
  // ao login se o refresh falhar — não fazer logout aqui para não interromper isso.
  useEffect(() => {
    if (userError) {
      const status = (userError as { response?: { status?: number } })?.response
        ?.status;
      if (status !== 401) {
        console.warn("[AUTH] Erro ao validar usuário:", userError);
      }
    }
  }, [userError]);

  // Login mutation
  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) =>
      authService.login(credentials),
    onSuccess: (data) => {
      login(data.data.user, data.data.tokens);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: any) => {
      // Error will be available in loginError
      console.error("Login error:", error);
    },
  });

  // Register company mutation
  const registerCompanyMutation = useMutation({
    mutationFn: (data: RegisterCompanyData) =>
      authService.registerCompany(data),
    onSuccess: (data) => {
      login(data.data.user, data.data.tokens);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: any) => {
      console.error("Registration error:", error);
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
