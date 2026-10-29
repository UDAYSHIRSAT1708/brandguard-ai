import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 15000,
});

// Interceptor to inject JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('brandguard_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Interceptor for session recovery and error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || '';
    const isAuthAttempt =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/register') ||
      requestUrl.includes('/auth/oauth') ||
      requestUrl.includes('/auth/refresh');

    // Attempt automatic token refresh on 401 for authenticated sessions
    if (error.response?.status === 401 && !isAuthAttempt && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('brandguard_refresh_token');

      if (refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then((newToken) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return apiClient(originalRequest);
            })
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const refreshRes = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            { refreshToken },
            { withCredentials: true }
          );
          if (refreshRes.data?.success && refreshRes.data.data?.token) {
            const newToken = refreshRes.data.data.token;
            const newRefreshToken = refreshRes.data.data.refreshToken;

            localStorage.setItem('brandguard_token', newToken);
            if (newRefreshToken) {
              localStorage.setItem('brandguard_refresh_token', newRefreshToken);
            }

            apiClient.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
            processQueue(null, newToken);

            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          localStorage.removeItem('brandguard_token');
          localStorage.removeItem('brandguard_refresh_token');
          window.dispatchEvent(new CustomEvent('brandguard_auth_unauthorized'));
        } finally {
          isRefreshing = false;
        }
      } else {
        localStorage.removeItem('brandguard_token');
        localStorage.removeItem('brandguard_refresh_token');
        window.dispatchEvent(new CustomEvent('brandguard_auth_unauthorized'));
      }
    }

    let customMessage = error.response?.data?.error?.message;
    if (error.response?.data?.error?.details && Array.isArray(error.response.data.error.details)) {
      const issueMsgs = error.response.data.error.details.map((d: any) => d.message).filter(Boolean);
      if (issueMsgs.length > 0) {
        customMessage = `${customMessage || 'Validation error'}: ${issueMsgs.join('; ')}`;
      }
    }
    const finalMessage = customMessage || error.message || 'Network request failed';
    const enrichedError: any = new Error(finalMessage);
    if (error.response?.data?.error?.code) {
      enrichedError.code = error.response.data.error.code;
    }
    enrichedError.status = error.response?.status;
    return Promise.reject(enrichedError);
  }
);

export async function checkBackendHealth() {
  const response = await apiClient.get('/health');
  return response.data;
}
