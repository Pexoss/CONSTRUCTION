import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  persistAccessToken,
  redirectToLogin,
} from "./authSession";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3000/api";

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("accessToken");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error || !token) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const isPublicAuthRequest = (url: string): boolean =>
  url.includes("/auth/login") ||
  url.includes("/auth/register") ||
  url.includes("/auth/refresh");

/** Refresh sem passar pelo interceptor (evita loop). */
const requestAccessTokenRefresh = async (refreshToken: string): Promise<string> => {
  const response = await axios.post<{
    success: boolean;
    data: { accessToken: string };
  }>(`${API_URL}/auth/refresh`, { refreshToken });

  const accessToken = response.data?.data?.accessToken;
  if (!accessToken) {
    throw new Error("Resposta de refresh inválida");
  }
  return accessToken;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const requestUrl = originalRequest?.url || "";

    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry ||
      isPublicAuthRequest(requestUrl)
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    isRefreshing = true;
    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
      isRefreshing = false;
      redirectToLogin();
      return Promise.reject(error);
    }

    try {
      const accessToken = await requestAccessTokenRefresh(refreshToken);
      persistAccessToken(accessToken);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      }

      processQueue(null, accessToken);
      isRefreshing = false;

      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError as AxiosError, null);
      isRefreshing = false;
      redirectToLogin();
      return Promise.reject(refreshError);
    }
  },
);

export default api;
