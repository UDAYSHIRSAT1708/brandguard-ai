import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  Mail, 
  AlertCircle, 
  ArrowRight, 
  ShieldCheck, 
  KeyRound,
  FileCheck2,
  RefreshCw,
  Building,
  User,
  Hash
} from 'lucide-react';
import { useAuth, isDemoAllowed, DEMO_CREDENTIALS } from '../context/AuthContext';
import { UserRole } from '../types';
import { apiClient } from '../api/client';
import { generateRandomString, generateCodeChallenge } from '../utils/pkce';
import { redactEmail } from '../utils/redact';

export const LoginPage: React.FC = () => {
  const {
    login,
    register,
    loginWithGoogle,
    registerWithGoogle,
    sessionExpiredNotice,
    clearSessionExpiredNotice,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register form state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'login' | 'register' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to determine the canonical OAuth redirect URI
  const getOAuthRedirectUri = () => {
    return `${window.location.origin}/login`;
  };

  // Auto-generate slug when org name changes if slug wasn't manually typed
  const handleOrgNameChange = (name: string) => {
    setOrgName(name);
    const generated = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setOrgSlug(generated);
  };

  const isDemoEnabled = isDemoAllowed;

  // Detect OAuth redirect callbacks from Google
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    const oauthCode = params.get('code');
    const oauthState = params.get('state');

    if (oauthError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (oauthError === 'access_denied') {
        setErrorMessage('Google Sign-In was cancelled. You may sign in with your password or try again.');
      } else if (oauthError === 'unverified_email') {
        setErrorMessage('Your Google account email has not been verified by Google. Please verify your email with Google and try again.');
      } else {
        setErrorMessage(`Google authentication returned: ${oauthError}`);
      }
      return;
    }

    if (oauthCode) {
      const storedVerifier = sessionStorage.getItem('brandguard_oauth_verifier') || undefined;
      const storedState = sessionStorage.getItem('brandguard_oauth_state');
      const storedIntent = sessionStorage.getItem('brandguard_oauth_intent') || 'login';
      const storedOrgName = sessionStorage.getItem('brandguard_oauth_org_name') || undefined;
      const storedOrgSlug = sessionStorage.getItem('brandguard_oauth_org_slug') || undefined;
      const storedRedirectUri = sessionStorage.getItem('brandguard_oauth_redirect_uri') || getOAuthRedirectUri();

      // Clean browser address bar query parameters to avoid re-triggering on refresh
      window.history.replaceState({}, document.title, window.location.pathname);

      if (!oauthState || !storedState || oauthState !== storedState) {
        setErrorMessage('Invalid or missing OAuth state parameter. Security check rejected this response to prevent CSRF.');
        return;
      }

      if (!storedVerifier) {
        setErrorMessage('Missing PKCE code verifier in browser session. Please try signing in with Google again.');
        return;
      }

      // Cleanup session storage tokens
      sessionStorage.removeItem('brandguard_oauth_verifier');
      sessionStorage.removeItem('brandguard_oauth_state');
      sessionStorage.removeItem('brandguard_oauth_intent');
      sessionStorage.removeItem('brandguard_oauth_org_name');
      sessionStorage.removeItem('brandguard_oauth_org_slug');
      sessionStorage.removeItem('brandguard_oauth_redirect_uri');

      const redirectUri = storedRedirectUri;

      setLoading(true);
      clearSessionExpiredNotice();

      if (storedIntent === 'register' && storedOrgName && storedOrgSlug) {
        registerWithGoogle({
          code: oauthCode,
          codeVerifier: storedVerifier!,
          redirectUri,
          state: oauthState!,
          orgName: storedOrgName,
          orgSlug: storedOrgSlug,
        }).then((result) => {
          setLoading(false);
          if (!result.success) {
            if (result.errorCode === 'ORGANISATION_SLUG_TAKEN' || result.error?.includes('slug already exists')) {
              setErrorMessage('An organization with this workspace URL slug already exists. Please choose a different slug.');
            } else if (result.errorCode === 'ACCOUNT_EXISTS_PASSWORD' || result.error?.includes('already exists')) {
              setMode('login');
              setErrorMessage('An account with this email already exists. Please sign in with your password or use Google Sign-In.');
            } else {
              setErrorMessage(result.error || 'Google organization registration failed.');
            }
          }
        });
      } else {
        loginWithGoogle({
          code: oauthCode,
          codeVerifier: storedVerifier!,
          redirectUri,
          state: oauthState!,
        }).then((result) => {
          setLoading(false);
          if (!result.success) {
            if (result.errorCode === 'ACCOUNT_EXISTS_PASSWORD') {
              setMode('login');
              setErrorMessage(
                'An existing account with your email is registered using password authentication. Please sign in with your email and password below to link Google Sign-In.'
              );
            } else if (result.errorCode === 'NO_ACCOUNT_FOUND') {
              setErrorMessage(
                'No BrandGuard account is associated with this Google profile. Please contact your administrator for an invite, or register a new organization.'
              );
            } else {
              setErrorMessage(result.error || 'Google Sign-In failed.');
            }
          }
        });
      }
    }
  }, [loginWithGoogle, registerWithGoogle, clearSessionExpiredNotice]);

  // Initiate PKCE Google Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setOauthLoading('login');
    setErrorMessage(null);
    clearSessionExpiredNotice();

    try {
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const redirectUri = getOAuthRedirectUri();

      const res = await apiClient.get('/auth/oauth/google/init', {
        params: {
          intent: 'login',
          redirectUri,
          codeChallenge,
        },
      });

      if (res.data?.success && res.data.data?.authUrl) {
        sessionStorage.setItem('brandguard_oauth_verifier', codeVerifier);
        sessionStorage.setItem('brandguard_oauth_state', res.data.data.state);
        sessionStorage.setItem('brandguard_oauth_intent', 'login');
        sessionStorage.setItem('brandguard_oauth_redirect_uri', redirectUri);
        window.location.href = res.data.data.authUrl;
      } else {
        throw new Error('Failed to retrieve authorization endpoint from server.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to initialize Google Sign-In.');
      setLoading(false);
      setOauthLoading(null);
    }
  };

  // Initiate PKCE Google Organization Registration
  const handleGoogleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim()) {
      setErrorMessage('Please provide both Organization Title and Workspace Slug before continuing with Google.');
      return;
    }

    setLoading(true);
    setOauthLoading('register');
    setErrorMessage(null);
    clearSessionExpiredNotice();

    try {
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const redirectUri = getOAuthRedirectUri();

      const res = await apiClient.get('/auth/oauth/google/init', {
        params: {
          intent: 'register',
          redirectUri,
          codeChallenge,
        },
      });

      if (res.data?.success && res.data.data?.authUrl) {
        sessionStorage.setItem('brandguard_oauth_verifier', codeVerifier);
        sessionStorage.setItem('brandguard_oauth_state', res.data.data.state);
        sessionStorage.setItem('brandguard_oauth_intent', 'register');
        sessionStorage.setItem('brandguard_oauth_org_name', orgName.trim());
        sessionStorage.setItem('brandguard_oauth_org_slug', orgSlug.trim().toLowerCase());
        sessionStorage.setItem('brandguard_oauth_redirect_uri', redirectUri);
        window.location.href = res.data.data.authUrl;
      } else {
        throw new Error('Failed to retrieve authorization endpoint from server.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to initialize Google registration.');
      setLoading(false);
      setOauthLoading(null);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both work email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    clearSessionExpiredNotice();

    console.info(`[Auth UI] Submitting login request for: ${redactEmail(email.trim())}`);
    const result = await login(email.trim(), password.trim());
    if (!result.success) {
      console.warn(`[Auth UI] Login failed for ${redactEmail(email.trim())}: ${result.error}`);
      setErrorMessage(result.error || 'Authentication failed. Please verify your credentials.');
    }
    setLoading(false);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !orgSlug.trim() || !adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setErrorMessage('All registration fields are required.');
      return;
    }

    if (adminPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters in length.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    clearSessionExpiredNotice();

    console.info(`[Auth UI] Registering organization '${orgSlug.trim()}' with admin '${redactEmail(adminEmail.trim())}'`);
    const result = await register({
      orgName: orgName.trim(),
      orgSlug: orgSlug.trim().toLowerCase(),
      adminName: adminName.trim(),
      adminEmail: adminEmail.trim().toLowerCase(),
      adminPassword,
    });

    if (!result.success) {
      console.warn(`[Auth UI] Registration failed for ${orgSlug.trim()}: ${result.error}`);
      setErrorMessage(result.error || 'Organization registration failed. Please review your entries.');
    }
    setLoading(false);
  };

  const handleQuickFill = async (targetRole: UserRole) => {
    if (!isDemoEnabled) return;
    const creds = DEMO_CREDENTIALS[targetRole];
    if (!creds) return;

    if (mode !== 'login') {
      setMode('login');
    }

    setEmail(creds.email);
    setPassword(creds.password);
    setErrorMessage(null);
    clearSessionExpiredNotice();

    setLoading(true);
    console.info(`[Auth UI] One-click demo login triggered for role: ${targetRole} (${redactEmail(creds.email)})`);
    const result = await login(creds.email, creds.password);
    if (!result.success) {
      console.warn(`[Auth UI] One-click demo login failed for ${redactEmail(creds.email)}: ${result.error}`);
      setErrorMessage(result.error || 'Quick login failed. Ensure backend server is operational.');
    } else {
      console.info(`[Auth UI] One-click demo login succeeded for ${redactEmail(creds.email)}`);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-forest/20">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        {/* Brand Insignia */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-forest text-white shadow-card border border-forest-light/30 mx-auto">
          <Shield className="w-8 h-8 text-white" />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-900 tracking-tight font-sans">
            BrandGuard AI
          </h1>
          <p className="text-xs font-mono tracking-wider text-forest uppercase font-bold mt-1">
            Enterprise Editorial Governance & AI Verification
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-surface py-8 px-6 sm:px-10 shadow-card rounded-2xl border border-ink-200 space-y-6">
          {/* Mode Tabs: Sign In vs Register Organization */}
          <div className="flex rounded-xl bg-canvas p-1 border border-ink-200">
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all font-sans ${
                mode === 'login'
                  ? 'bg-surface text-ink-900 shadow-sm border border-ink-100'
                  : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMessage(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all font-sans ${
                mode === 'register'
                  ? 'bg-surface text-ink-900 shadow-sm border border-ink-100'
                  : 'text-ink-500 hover:text-ink-800'
              }`}
            >
              Register Organization
            </button>
          </div>

          {/* Session Expired Alert */}
          {sessionExpiredNotice && (
            <div className="p-3.5 bg-amberBrand-50 border border-amberBrand/30 rounded-xl text-xs text-amberBrand-dark flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-amberBrand flex-shrink-0 mt-0.5" />
              <div className="leading-relaxed font-sans">{sessionExpiredNotice}</div>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed font-sans font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Google OAuth Single Sign-On Button */}
          {mode === 'login' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                aria-label="Continue with Google"
                className="w-full min-h-[44px] flex items-center justify-center space-x-3 py-2.5 px-4 bg-white hover:bg-canvas text-ink-900 rounded-xl text-xs sm:text-sm font-semibold border border-ink-200 hover:border-ink-400 shadow-subtle hover:shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest focus:ring-offset-1"
              >
                {oauthLoading === 'login' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-forest flex-shrink-0" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-ink-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2.5 bg-surface text-ink-400 font-sans">or sign in with password</span>
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-ink-900 font-sans mb-1.5">
                  Work Email Address
                </label>
                <div className="relative rounded-lg shadow-subtle">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={loading}
                    className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-sans"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-ink-900 font-sans">
                    Password
                  </label>
                </div>
                <div className="relative rounded-lg shadow-subtle">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={loading}
                    className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex items-center justify-center space-x-2 py-3 px-4 bg-forest text-white rounded-xl text-xs font-bold hover:bg-forest-dark transition-all duration-150 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                    <span>Authenticating via Server...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Governance Workspace</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => { setMode('register'); setErrorMessage(null); }}
                  className="text-xs text-forest hover:text-forest-dark font-medium font-sans"
                >
                  Need to set up a new workspace? <span className="underline font-bold">Register Organization</span>
                </button>
              </div>
            </form>
          )}

          {/* Registration Form */}
          {mode === 'register' && (
            <div className="space-y-4">
              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                    Organization Title
                  </label>
                  <div className="relative rounded-lg shadow-subtle">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                      <Building className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => handleOrgNameChange(e.target.value)}
                      placeholder="Acme Global Corporation"
                      disabled={loading}
                      className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                    Workspace URL Slug
                  </label>
                  <div className="relative rounded-lg shadow-subtle">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                      <Hash className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="acme-global"
                      disabled={loading}
                      className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-mono"
                    />
                  </div>
                </div>

                {/* Google Workspace Setup Option */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleGoogleRegister}
                    disabled={loading}
                    aria-label="Register Workspace with Google"
                    className="w-full min-h-[44px] flex items-center justify-center space-x-3 py-2.5 px-4 bg-white hover:bg-canvas text-ink-900 rounded-xl text-xs sm:text-sm font-semibold border border-ink-200 hover:border-ink-400 shadow-subtle hover:shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-forest focus:ring-offset-1"
                  >
                    {oauthLoading === 'register' ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-forest flex-shrink-0" />
                        <span>Connecting to Google...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Register Workspace with Google</span>
                      </>
                    )}
                  </button>

                  <div className="relative my-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-ink-200"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-surface text-ink-400 font-sans">or setup with password</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                    Administrator Full Name
                  </label>
                  <div className="relative rounded-lg shadow-subtle">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Sarah Chen"
                      disabled={loading}
                      className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                    Administrator Work Email
                  </label>
                  <div className="relative rounded-lg shadow-subtle">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@acme-global.com"
                      disabled={loading}
                      className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-sans"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                    Administrator Password (min 8 characters)
                  </label>
                  <div className="relative rounded-lg shadow-subtle">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••••••"
                      disabled={loading}
                      className="block w-full pl-9 pr-3 py-2.5 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 flex items-center justify-center space-x-2 py-3 px-4 bg-forest text-white rounded-xl text-xs font-bold hover:bg-forest-dark transition-all duration-150 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin mr-1.5" />
                      <span>Registering Organization...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Organization & Workspace</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setErrorMessage(null); }}
                    className="text-xs text-forest hover:text-forest-dark font-medium font-sans"
                  >
                    Already have an account? <span className="underline font-bold">Sign In</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick-Fill Demonstration Credentials (Dev only) */}
          {isDemoEnabled && mode === 'login' && (
            <div className="pt-4 border-t border-ink-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-ink-500 uppercase tracking-wider font-semibold flex items-center">
                  <KeyRound className="w-3 h-3 mr-1 text-forest" />
                  Configured Accounts (3 Roles)
                </span>
                <span className="text-[10px] text-ink-400 font-mono">1-Click Login</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('admin')}
                  disabled={loading}
                  className="p-2 text-left rounded-lg border border-ink-200 bg-canvas hover:border-forest/50 hover:bg-forest-50/40 transition-colors group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-ink-900 group-hover:text-forest">Admin</div>
                  <div className="text-[10px] text-ink-500 truncate font-mono">admin@acme-demo.com</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('creator')}
                  disabled={loading}
                  className="p-2 text-left rounded-lg border border-ink-200 bg-canvas hover:border-forest/50 hover:bg-forest-50/40 transition-colors group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-ink-900 group-hover:text-forest">Creator</div>
                  <div className="text-[10px] text-ink-500 truncate font-mono">creator@acme-demo.com</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickFill('reviewer')}
                  disabled={loading}
                  className="p-2 text-left rounded-lg border border-ink-200 bg-canvas hover:border-forest/50 hover:bg-forest-50/40 transition-colors group cursor-pointer"
                >
                  <div className="text-[11px] font-bold text-ink-900 group-hover:text-forest">Reviewer</div>
                  <div className="text-[10px] text-ink-500 truncate font-mono">reviewer@acme-demo.com</div>
                </button>
              </div>
              <p className="text-[10px] text-ink-400 text-center leading-relaxed font-sans">
                Password: <code className="font-mono text-ink-600 font-bold">DemoAdmin2026!</code> / <code className="font-mono text-ink-600 font-bold">DemoCreator2026!</code> / <code className="font-mono text-ink-600 font-bold">DemoReviewer2026!</code>
              </p>
            </div>
          )}

          {/* Security & Architecture Guarantees */}
          <div className="pt-2 border-t border-ink-100 grid grid-cols-2 gap-2 text-[10px] text-ink-500 font-sans">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-forest flex-shrink-0" />
              <span>Multi-Tenant Isolation</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-forest flex-shrink-0" />
              <span>Cryptographic Audit Trail</span>
            </div>
          </div>
        </div>

        {/* Global Footer */}
        <p className="text-center text-xs text-ink-400 mt-6 font-sans">
          &copy; 2026 BrandGuard AI Platform. All rights reserved.
        </p>
      </div>
    </div>
  );
};
