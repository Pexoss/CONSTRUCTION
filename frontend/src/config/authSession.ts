import { useAuthStore } from "../store/auth.store";

/** Rota de login da aplicação (App.tsx: path="/") */
export const LOGIN_ROUTE = "/";

let sessionExpiredHandler: (() => void) | null = null;
let isRedirectingToLogin = false;

export const registerSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

export const clearAuthSession = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("auth-storage");
  useAuthStore.getState().logout();
};

/** Persiste novo access token após refresh bem-sucedido. */
export const persistAccessToken = (accessToken: string) => {
  localStorage.setItem("accessToken", accessToken);
  const refreshToken = localStorage.getItem("refreshToken");
  isRedirectingToLogin = false;
  useAuthStore.setState({
    accessToken,
    isAuthenticated: Boolean(accessToken && refreshToken),
  });
};

export const redirectToLogin = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  clearAuthSession();

  if (sessionExpiredHandler) {
    sessionExpiredHandler();
    return;
  }

  window.location.assign(LOGIN_ROUTE);
};

export const resetSessionRedirectFlag = () => {
  isRedirectingToLogin = false;
};
