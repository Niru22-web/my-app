import axios, { AxiosInstance } from "axios";
import { loadingManager } from "./utils/loadingManager";
import { dispatchError, handleSuccess } from "./utils/globalErrorHandler";

const rawBaseURL = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'https://timesheet.asaind.co.in/api/';

// Ensure baseURL is either absolute (starts with http) or starts with a leading slash
let baseURL = rawBaseURL;
if (!baseURL.startsWith('http') && !baseURL.startsWith('/')) {
  baseURL = `/${baseURL}`;
}

// Ensure it ends with a slash for consistent joining
const normalizedBaseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;

export const API_BASE_URL = normalizedBaseURL.replace(/\/api\/$/, '');

const API: AxiosInstance = axios.create({
  baseURL: import.meta.env.PROD ? normalizedBaseURL : "/api/",
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
});

console.log("🚀 API Base URL:", API.defaults.baseURL);

API.interceptors.request.use(
  (config) => {
    // Strip leading slash so Axios correctly joins relative paths with the baseURL
    // e.g. baseURL="/api/" + url="auth/login" → "/api/auth/login" ✓
    if (config.url?.startsWith('/')) {
      config.url = config.url.substring(1);
    }

    const isLoginRequest = config.url?.includes('auth/login');

    const token = localStorage.getItem('token');

    if (token && config.headers && !isLoginRequest) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (isLoginRequest && config.headers) {
      delete config.headers.Authorization;
    }

    loadingManager.startLoading(undefined, false);

    return config;
  },
  (error) => {
    loadingManager.stopLoading(false);
    return Promise.reject(error);
  }
);

API.interceptors.response.use(
  (response) => {
    loadingManager.stopLoading(false);

    // 🔥 Auto-refresh on successful updates
    const isUpdateRequest = ['PUT', 'POST', 'DELETE'].includes(response.config.method?.toUpperCase() || '');
    const isProfileOrDataUpdate = response.config.url?.includes('/employees/') ||
      response.config.url?.includes('/profile') ||
      response.config.url?.includes('/dashboard');

    if (isUpdateRequest && isProfileOrDataUpdate) {
      // Trigger a custom event for components to listen to
      window.dispatchEvent(new CustomEvent('data-updated', {
        detail: { type: response.config.url, data: response.data }
      }));

      // Show success toast for successful updates
      if (response.config.url?.includes('/profile')) {
        handleSuccess('Profile updated successfully');
      } else if (response.config.url?.includes('/profile-photo')) {
        handleSuccess('Profile photo updated successfully');
      } else if (response.config.url?.includes('/password')) {
        handleSuccess('Password changed successfully');
      }
    }

    return response;
  },
  (error) => {
    loadingManager.stopLoading(false);

    let message = "Something went wrong. Please try again.";
    let errorCode = "UNKNOWN_ERROR";

    if (error.response) {
      // Server responded with a status code outside the 2xx range
      message = error.response.data?.error || error.response.data?.message || message;
      errorCode = error.response.data?.errorCode || `HTTP_${error.response.status}`;

      // Dispatch maintenance event for server errors / busy signals (500 to 504)
      if (error.response.status >= 500 && error.response.status <= 504) {
        window.dispatchEvent(new CustomEvent('server-under-maintenance'));
      }

      // Handle 401 Unauthorized globally
      if (error.response.status === 401) {
        const isLoginRequest = error.config?.url?.includes('/auth/login');
        if (!isLoginRequest) {
          if (!window.location.pathname.includes('/login')) {
            window.dispatchEvent(new CustomEvent('session-expired'));
          }
        }
      }

      // Handle 403 Forbidden - Stop infinite retries on permission issues
      if (error.response.status === 403) {
        console.error("⛔ [403 Forbidden]: Access denied for this resource.");
        // We reject the promise to stop any retry logic or further execution in components
        return Promise.reject({
          message: "You do not have permission to access this resource.",
          errorCode: "ACCESS_DENIED",
          originalError: error
        });
      }
    } else if (error.request) {
      // Request was made but no response was received
      message = "🌐 Server not reachable. Please check your internet connection.";
      errorCode = "NETWORK_ERROR";
      window.dispatchEvent(new CustomEvent('server-under-maintenance'));
    }

    // Filter out common browser extension noise
    const isExtensionError = message.toLowerCase().includes('listener') ||
      message.toLowerCase().includes('extension context invalidated');

    if (!isExtensionError) {
      console.error(`API Error [${errorCode}]:`, message);
      dispatchError(error); // This will show the toast
    }

    return Promise.reject({ message, errorCode, originalError: error });
  }
);


export default API;