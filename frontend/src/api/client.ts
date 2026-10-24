import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

// Interceptor for safe error responses
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const isAuthAttempt = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');

    // Only dispatch session expiry for existing authenticated sessions, never on initial login/register attempts
    if (error.response?.status === 401 && !isAuthAttempt) {
      localStorage.removeItem('brandguard_token');
      window.dispatchEvent(new CustomEvent('brandguard_auth_unauthorized'));
    }
    let customMessage = error.response?.data?.error?.message;
    if (error.response?.data?.error?.details && Array.isArray(error.response.data.error.details)) {
      const issueMsgs = error.response.data.error.details.map((d: any) => d.message).filter(Boolean);
      if (issueMsgs.length > 0) {
        customMessage = `${customMessage || 'Validation error'}: ${issueMsgs.join('; ')}`;
      }
    }
    const finalMessage = customMessage || error.message || 'Network request failed';
    return Promise.reject(new Error(finalMessage));
  }
);

export async function checkBackendHealth() {
  const response = await apiClient.get('/health');
  return response.data;
}
