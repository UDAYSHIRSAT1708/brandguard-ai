import React, { useState } from 'react';
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

export const LoginPage: React.FC = () => {
  const { login, register, sessionExpiredNotice, clearSessionExpiredNotice } = useAuth();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-generate slug when org name changes if slug wasn't manually typed
  const handleOrgNameChange = (name: string) => {
    setOrgName(name);
    const generated = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setOrgSlug(generated);
  };

  // Permit demo-account shortcuts strictly in development when explicitly enabled via env
  const isDemoEnabled = isDemoAllowed;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter both work email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    clearSessionExpiredNotice();

    console.info(`[Auth UI] Submitting login request for: ${email.trim()}`);
    const result = await login(email.trim(), password.trim());
    if (!result.success) {
      console.warn(`[Auth UI] Login failed for ${email.trim()}: ${result.error}`);
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

    console.info(`[Auth UI] Registering organization '${orgSlug.trim()}' with admin '${adminEmail.trim()}'`);
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

    // 1. Populate the form credentials into inputs immediately
    setEmail(creds.email);
    setPassword(creds.password);
    setErrorMessage(null);
    clearSessionExpiredNotice();

    // 2. Perform real login request
    setLoading(true);
    console.info(`[Auth UI] One-click demo login triggered for role: ${targetRole} (${creds.email})`);
    const result = await login(creds.email, creds.password);
    if (!result.success) {
      console.warn(`[Auth UI] One-click demo login failed for ${creds.email}: ${result.error}`);
      setErrorMessage(result.error || 'Quick login failed. Ensure backend server is operational.');
    } else {
      console.info(`[Auth UI] One-click demo login succeeded for ${creds.email}`);
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
              <div className="leading-relaxed font-sans font-medium">{errorMessage}</div>
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
                className="w-full mt-2 flex items-center justify-center space-x-2 py-3 px-4 bg-forest text-white rounded-xl text-xs font-bold hover:bg-forest-dark transition-all duration-150 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="w-full mt-3 flex items-center justify-center space-x-2 py-3 px-4 bg-forest text-white rounded-xl text-xs font-bold hover:bg-forest-dark transition-all duration-150 shadow-subtle disabled:opacity-50 disabled:cursor-not-allowed"
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
          )}

          {/* Quick-Fill Demonstration Credentials for Seamless Evaluation (Dev / Explicit Demo only) */}
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
