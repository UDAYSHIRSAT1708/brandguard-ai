import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import { apiClient } from '../api/client';
import { redactEmail } from '../utils/redact';

export interface RegisterOrgData {
  orgName: string;
  orgSlug: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface GoogleAuthPayload {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
}

export interface GoogleRegisterPayload extends GoogleAuthPayload {
  orgName: string;
  orgSlug: string;
}

interface AuthContextType {
  user: User | null;
  role: UserRole;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterOrgData) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (payload: GoogleAuthPayload) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
  registerWithGoogle: (payload: GoogleRegisterPayload) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
  linkGoogleAccount: (payload: GoogleAuthPayload) => Promise<{ success: boolean; error?: string }>;
  unlinkGoogleAccount: () => Promise<{ success: boolean; error?: string }>;
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

  // Helper to persist session tokens
  const storeSessionTokens = (accessToken: string, refreshToken?: string) => {
    setToken(accessToken);
    localStorage.setItem('brandguard_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('brandguard_refresh_token', refreshToken);
    }
  };

  const clearSessionTokens = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('brandguard_token');
    localStorage.removeItem('brandguard_refresh_token');
  };

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
          authProvider: u.authProvider || 'local',
          isGoogleLinked: Boolean(u.isGoogleLinked),
          avatarUrl: u.avatarUrl,
          organisationId: typeof u.organisationId === 'string' ? u.organisationId : (orgObj?._id || orgObj?.id || ''),
          organisationName: u.organisationName || orgObj?.name || 'Editorial Governance',
          organisationSlug: u.organisationSlug || orgObj?.slug || 'editorial-governance',
        };

        setUser(resolvedUser);
        localStorage.setItem('brandguard_token', activeToken);
        console.info(`[Auth Client] Session validated: User '${redactEmail(resolvedUser.email)}' [${resolvedUser.role}] in Org '${resolvedUser.organisationName}'`);
      } else {
        throw new Error('Invalid session payload');
      }
    } catch (err: any) {
      console.warn('[Auth Client] Session token expired or invalid:', err.message);
      clearSessionTokens();
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
      clearSessionTokens();
      setSessionExpiredNotice('Your session expired. Please sign in to resume governance operations.');
    };

    window.addEventListener('brandguard_auth_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('brandguard_auth_unauthorized', handleUnauthorized);
    };
  }, []);

  // Real backend password authentication
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      console.info(`[Auth Client] Submitting login request for email: '${redactEmail(normalizedEmail)}'`);
      const res = await apiClient.post('/auth/login', { email: normalizedEmail, password });
      if (res.data?.success && res.data.data?.token) {
        const liveToken = res.data.data.token;
        const refreshToken = res.data.data.refreshToken;
        const u = res.data.data.user;
        const orgObj = typeof u.organisationId === 'object' ? u.organisationId : null;

        const resolvedUser: User = {
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          authProvider: u.authProvider || 'local',
          isGoogleLinked: Boolean(u.isGoogleLinked),
          avatarUrl: u.avatarUrl,
          organisationId: typeof u.organisationId === 'string' ? u.organisationId : (orgObj?._id || orgObj?.id || ''),
          organisationName: u.organisationName || orgObj?.name || 'Editorial Governance',
          organisationSlug: u.organisationSlug || orgObj?.slug || 'editorial-governance',
        };

        storeSessionTokens(liveToken, refreshToken);
        setUser(resolvedUser);
        setSessionExpiredNotice(null);
        console.info(`[Auth Client] Login successful: User '${redactEmail(resolvedUser.email)}' [${resolvedUser.role}] in Org '${resolvedUser.organisationName}'`);
        return { success: true };
      }
      return { success: false, error: 'Unexpected response format from authentication server.' };
    } catch (err: any) {
      const message = err.message || 'Invalid email or password.';
      console.warn(`[Auth Client] Login failed for email '${redactEmail(normalizedEmail)}': ${message}`);
      return { success: false, error: message };
    }
  };

  // Register a new organization and admin
  const register = async (data: RegisterOrgData): Promise<{ success: boolean; error?: string }> => {
    const normalizedEmail = data.adminEmail.trim().toLowerCase();
    const normalizedSlug = data.orgSlug.trim().toLowerCase();
    try {
      console.info(`[Auth Client] Submitting organization registration for slug: '${normalizedSlug}', admin: '${redactEmail(normalizedEmail)}'`);
      const res = await apiClient.post('/auth/register', {
        ...data,
        adminEmail: normalizedEmail,
        orgSlug: normalizedSlug,
      });
      if (res.data?.success && res.data.data?.token) {
        const liveToken = res.data.data.token;
        const refreshToken = res.data.data.refreshToken;
        const u = res.data.data.user;
        const resolvedUser: User = {
          id: u.id || u._id,
          name: u.name,
          email: u.email || normalizedEmail,
          role: u.role,
          authProvider: u.authProvider || 'local',
          isGoogleLinked: Boolean(u.isGoogleLinked),
          avatarUrl: u.avatarUrl,
          organisationId: u.organisationId,
          organisationName: u.organisationName || data.orgName,
          organisationSlug: u.organisationSlug || normalizedSlug,
        };

        storeSessionTokens(liveToken, refreshToken);
        setUser(resolvedUser);
        setSessionExpiredNotice(null);
        console.info(`[Auth Client] Registration successful: Org '${resolvedUser.organisationSlug}', Admin '${redactEmail(resolvedUser.email)}'`);
        return { success: true };
      }
      return { success: false, error: 'Unexpected response format from registration server.' };
    } catch (err: any) {
      const message = err.message || 'Registration failed. Please check your submission.';
      console.warn(`[Auth Client] Registration failed for slug '${normalizedSlug}': ${message}`);
      return { success: false, error: message };
    }
  };

  // Google OAuth Login
  const loginWithGoogle = async (payload: GoogleAuthPayload): Promise<{ success: boolean; error?: string; errorCode?: string }> => {
    try {
      console.info('[Auth Client] Submitting Google OAuth callback exchange');
      const res = await apiClient.post('/auth/oauth/google/callback', payload);
      if (res.data?.success && res.data.data?.token) {
        const liveToken = res.data.data.token;
        const refreshToken = res.data.data.refreshToken;
        const u = res.data.data.user;

        const resolvedUser: User = {
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          authProvider: 'google',
          isGoogleLinked: true,
          avatarUrl: u.avatarUrl,
          organisationId: u.organisationId,
          organisationName: u.organisationName || 'Editorial Governance',
          organisationSlug: u.organisationSlug || 'editorial-governance',
        };

        storeSessionTokens(liveToken, refreshToken);
        setUser(resolvedUser);
        setSessionExpiredNotice(null);
        console.info(`[Auth Client] Google Sign-In successful for '${redactEmail(resolvedUser.email)}'`);
        return { success: true };
      }
      return { success: false, error: 'Unexpected response from Google OAuth server.' };
    } catch (err: any) {
      console.warn('[Auth Client] Google OAuth login failed:', err.message);
      return {
        success: false,
        error: err.message || 'Google authentication failed.',
        errorCode: err.code,
      };
    }
  };

  // Google OAuth Organization Registration
  const registerWithGoogle = async (payload: GoogleRegisterPayload): Promise<{ success: boolean; error?: string; errorCode?: string }> => {
    try {
      console.info(`[Auth Client] Submitting Google OAuth registration for org: '${payload.orgSlug}'`);
      const res = await apiClient.post('/auth/oauth/google/callback', payload);
      if (res.data?.success && res.data.data?.token) {
        const liveToken = res.data.data.token;
        const refreshToken = res.data.data.refreshToken;
        const u = res.data.data.user;

        const resolvedUser: User = {
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          authProvider: 'google',
          isGoogleLinked: true,
          avatarUrl: u.avatarUrl,
          organisationId: u.organisationId,
          organisationName: u.organisationName || payload.orgName,
          organisationSlug: u.organisationSlug || payload.orgSlug,
        };

        storeSessionTokens(liveToken, refreshToken);
        setUser(resolvedUser);
        setSessionExpiredNotice(null);
        console.info(`[Auth Client] Google registration successful: Org '${resolvedUser.organisationSlug}'`);
        return { success: true };
      }
      return { success: false, error: 'Unexpected response from registration server.' };
    } catch (err: any) {
      console.warn('[Auth Client] Google OAuth registration failed:', err.message);
      return {
        success: false,
        error: err.message || 'Google registration failed.',
        errorCode: err.code,
      };
    }
  };

  // Link Google Account to Authenticated User
  const linkGoogleAccount = async (payload: GoogleAuthPayload): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.post('/auth/oauth/google/link', payload);
      if (res.data?.success) {
        setUser((prev) => (prev ? { ...prev, isGoogleLinked: true } : prev));
        return { success: true };
      }
      return { success: false, error: 'Failed to link Google account.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not link Google account.' };
    }
  };

  // Unlink Google Account
  const unlinkGoogleAccount = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiClient.post('/auth/oauth/google/unlink');
      if (res.data?.success) {
        setUser((prev) => (prev ? { ...prev, isGoogleLinked: false } : prev));
        return { success: true };
      }
      return { success: false, error: 'Failed to unlink Google account.' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Could not unlink Google account.' };
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

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignored
    } finally {
      clearSessionTokens();
    }
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
        loginWithGoogle,
        registerWithGoogle,
        linkGoogleAccount,
        unlinkGoogleAccount,
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
