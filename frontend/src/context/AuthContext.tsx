import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import { apiClient } from '../api/client';

export interface RegisterOrgData {
  orgName: string;
  orgSlug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

interface AuthContextType {
  user: User | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterOrgData) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  sessionExpiredNotice: string | null;
  clearSessionExpiredNotice: () => void;
  loginAsDemoRole?: (role: UserRole) => Promise<{ success: boolean; error?: string }>;
}

export const isDemoAllowed = Boolean(
  import.meta.env.DEV && 
  (import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true' || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === '1')
);

export const DEMO_CREDENTIALS: Record<UserRole, { email: string; password: string }> = {
  admin: { email: 'admin@acme-demo.com', password: 'DemoAdmin2026!' },
  creator: { email: 'creator@acme-demo.com', password: 'DemoCreator2026!' },
  reviewer: { email: 'reviewer@acme-demo.com', password: 'DemoReviewer2026!' },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('brandguard_token');
  });

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<string | null>(null);

  const clearSessionExpiredNotice = () => setSessionExpiredNotice(null);

  // Revalidate session on boot or refresh
  const validateSession = useCallback(async (activeToken: string) => {
    setIsLoading(true);
    try {
      console.info('[Auth Client] Validating active session token via GET /api/auth/me');
      const res = await apiClient.get('/auth/me', {
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      if (res.data?.success && res.data.data?.user) {
        const u = res.data.data.user;
        const orgObj = typeof u.organisationId === 'object' ? u.organisationId : null;

        const resolvedUser: User = {
          id: u._id || u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          organisationId: typeof u.organisationId === 'string' ? u.organisationId : (orgObj?._id || orgObj?.id || ''),
          organisationName: u.organisationName || orgObj?.name || 'Editorial Governance',
          organisationSlug: u.organisationSlug || orgObj?.slug || 'editorial-governance',
        };

        setUser(resolvedUser);
        localStorage.setItem('brandguard_token', activeToken);
        console.info(`[Auth Client] Session validated: User '${resolvedUser.email}', Role '${resolvedUser.role}', Org '${resolvedUser.organisationName}' (${resolvedUser.organisationSlug})`);
      } else {
        throw new Error('Invalid session payload');
      }
    } catch (err: any) {
      console.warn('[Auth Client] Session token expired or invalid:', err.message);
      setToken(null);
      setUser(null);
      localStorage.removeItem('brandguard_token');
      setSessionExpiredNotice('Your session has expired or is invalid. Please sign in again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      validateSession(token);
    } else {
      setIsLoading(false);
    }
  }, [token, validateSession]);

  // Listen for 401 unauthorized events dispatched by apiClient
  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('[Auth Client] Received unauthorized 401 broadcast. Revoking active session.');
      setToken(null);
      setUser(null);
      localStorage.removeItem('brandguard_token');
      setSessionExpiredNotice('Your session expired. Please sign in to resume governance operations.');
    };

    window.addEventListener('brandguard_auth_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('brandguard_auth_unauthorized', handleUnauthorized);
    };
  }, []);

  // Real backend authentication
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      console.info(`[Auth Client] Submitting login request for email: '${normalizedEmail}'`);
      const res = await apiClient.post('/auth/login', { email: normalizedEmail, password });
      if (res.data?.success && res.data.data?.token) {
        const liveToken = res.data.data.token;
        const u = res.data.data.user;
        const orgObj = typeof u.organisationId === 'object' ? u.organisationId : null;

        const resolvedUser: User = {
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          organisationId: typeof u.organisationId === 'string' ? u.organisationId : (orgObj?._id || orgObj?.id || ''),
          organisationName: u.organisationName || orgObj?.name || 'Editorial Governance',
          organisationSlug: u.organisationSlug || orgObj?.slug || 'editorial-governance',
        };

        setToken(liveToken);
        setUser(resolvedUser);
        localStorage.setItem('brandguard_token', liveToken);
        setSessionExpiredNotice(null);
        console.info(`[Auth Client] Login successful: User '${resolvedUser.email}', Role '${resolvedUser.role}', Org '${resolvedUser.organisationName}'`);
        return { success: true };
      }
      return { success: false, error: 'Unexpected response format from authentication server.' };
    } catch (err: any) {
      const message = err.message || 'Invalid email or password.';
      console.warn(`[Auth Client] Login failed for email '${normalizedEmail}': ${message}`);
      return { success: false, error: message };
    }
  };

  // Register a new organization and admin
  const register = async (data: RegisterOrgData): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = data.adminEmail.trim().toLowerCase();
    const normalizedSlug = data.orgSlug.trim().toLowerCase();
    try {
      console.info(`[Auth Client] Submitting organization registration for slug: '${normalizedSlug}', admin: '${normalizedEmail}'`);
      const res = await apiClient.post('/auth/register', {
        ...data,
        adminEmail: normalizedEmail,
        orgSlug: normalizedSlug,
      });
      if (res.data?.success && res.data.data?.token) {
        const liveToken = res.data.data.token;
        const u = res.data.data.user;
        const resolvedUser: User = {
          id: u.id || u._id,
          name: u.name,
          email: u.email || normalizedEmail,
          role: u.role,
          organisationId: u.organisationId,
          organisationName: u.organisationName || data.orgName,
          organisationSlug: u.organisationSlug || normalizedSlug,
        };

        setToken(liveToken);
        setUser(resolvedUser);
        localStorage.setItem('brandguard_token', liveToken);
        setSessionExpiredNotice(null);
        console.info(`[Auth Client] Registration successful: Org '${resolvedUser.organisationSlug}', Admin '${resolvedUser.email}'`);
        return { success: true };
      }
      return { success: false, error: 'Unexpected response format from registration server.' };
    } catch (err: any) {
      const message = err.message || 'Registration failed. Please check your submission.';
      console.warn(`[Auth Client] Registration failed for slug '${normalizedSlug}': ${message}`);
      return { success: false, error: message };
    }
  };

  // Helper for quick demonstration credentials strictly in opt-in dev mode
  const loginAsDemoRole = isDemoAllowed
    ? async (targetRole: UserRole) => {
        const creds = DEMO_CREDENTIALS[targetRole];
        if (!creds) {
          return { success: false, error: `No demo credentials found for role: ${targetRole}` };
        }
        return await login(creds.email, creds.password);
      }
    : undefined;

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('brandguard_token');
  };

  const role: UserRole = user?.role || 'creator';
  const isAuthenticated = Boolean(token && user);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        sessionExpiredNotice,
        clearSessionExpiredNotice,
        loginAsDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
