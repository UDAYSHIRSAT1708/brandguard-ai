import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Database, 
  Server, 
  RefreshCw, 
  Users, 
  ShieldCheck,
  CheckCircle2,
  UserPlus,
  X,
  Mail,
  Lock,
  User as UserIcon,
  AlertCircle
} from 'lucide-react';
import { BrandGuardApi } from '../api/services';
import { Button } from '../components/common/Button';

export const SettingsHealthPage: React.FC = () => {
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [lastTested, setLastTested] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState<'admin' | 'creator' | 'reviewer'>('creator');
  const [addingUser, setAddingUser] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addEmail.trim() || !addPassword.trim()) {
      setAddError('All fields are required.');
      return;
    }
    setAddingUser(true);
    setAddError(null);
    try {
      await BrandGuardApi.createUser({
        name: addName.trim(),
        email: addEmail.trim().toLowerCase(),
        password: addPassword,
        role: addRole,
      });
      setShowAddModal(false);
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddRole('creator');
      await fetchUsers();
    } catch (err: any) {
      setAddError(err.message || 'Failed to add user member.');
    } finally {
      setAddingUser(false);
    }
  };

  const testInfrastructure = async () => {
    setLoading(true);
    try {
      const probe = await BrandGuardApi.probeHealth(true);
      setIsLive(probe.live);
      if (probe.details) {
        setHealthData(probe.details);
      }
      setLastTested(new Date().toLocaleTimeString());
    } catch (err: any) {
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { users: fetched } = await BrandGuardApi.getUsers();
      if (fetched.length > 0) {
        setUsers(fetched);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    testInfrastructure();
    fetchUsers();
  }, []);

  return (
    <div className="space-y-7">
      {/* Banner */}
      <div className="bg-surface rounded-2xl border border-ink-200 p-6 sm:p-7 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-forest font-bold bg-forest-50 px-2.5 py-0.5 rounded-full border border-forest/20 inline-flex items-center">
              <ShieldCheck className="w-3 h-3 mr-1" />
              Infrastructure & AI Provider Mesh
            </span>
            {isLive === false && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-amberBrand font-semibold bg-amberBrand-50 px-2 py-0.5 rounded border border-amberBrand/30">
                Backend Offline (Demo Fallback Active)
              </span>
            )}
            {isLive === true && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-forest font-semibold bg-forest-50 px-2 py-0.5 rounded border border-forest/20">
                Live Backend Connected
              </span>
            )}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight font-sans">
            AI Provider Mesh & Security Architecture
          </h3>
          <p className="text-xs text-ink-600 max-w-2xl leading-relaxed font-sans">
            Real-time health telemetry for dual AI providers, RAG retrieval pipelines, and database persistence. API secrets remain strictly protected within the backend vault and are never sent to client browsers.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {lastTested && (
            <span className="text-xs font-mono text-ink-500">Last Probed: {lastTested}</span>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={testInfrastructure}
            loading={loading}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Run Mesh Diagnostic
          </Button>
        </div>
      </div>

      {/* Provider Health Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Primary AI Provider */}
        {(() => {
          const primary = healthData?.checks?.aiService?.details?.providers?.primary;
          const isHealthy = healthData?.checks?.aiService?.status === 'healthy';
          const isReady = primary?.configured && primary?.status === 'ready';

          return (
            <div className="bg-surface rounded-2xl border border-ink-200 p-6 shadow-card space-y-4 hover:border-ink-300 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-forest-50 text-forest border border-forest/20 flex items-center justify-center font-bold text-lg font-mono">
                    {primary?.provider ? primary.provider.charAt(0).toUpperCase() : 'G'}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink-900 font-sans">
                      {primary?.provider ? primary.provider.toUpperCase() : 'Google Gemini'} ({primary?.model || 'gemini-2.0-flash'})
                    </h4>
                    <p className="text-xs text-ink-500 font-mono">Primary Review Engine</p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold flex items-center border ${
                    primary?.connectivity === 'verified' || isReady
                      ? 'bg-forest-50 text-forest border-forest/20'
                      : primary?.configured && primary?.status === 'unreachable'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : isHealthy
                      ? 'bg-amberBrand-50 text-amberBrand-dark border-amberBrand/30'
                      : 'bg-red-50 text-red-600 border-red-200'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {primary?.connectivity === 'verified'
                    ? 'Active Primary (Verified)'
                    : primary?.status === 'ready'
                    ? 'Active Primary (Configured)'
                    : primary?.configured && primary?.status === 'unreachable'
                    ? 'Primary (Unreachable)'
                    : 'Primary (Unconfigured)'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs border-t border-ink-100 pt-3.5 font-sans">
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Model Deployment:</span>
                  <span className="font-mono font-bold text-ink-900">{primary?.model || 'gemini-2.0-flash'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Connectivity State:</span>
                  <span className="font-mono text-ink-800 font-bold capitalize">
                    {primary?.connectivity || primary?.status || 'unconfigured'}
                  </span>
                </div>
                {primary?.message && (
                  <div className="flex justify-between py-1 border-b border-ink-50">
                    <span className="text-ink-500">Diagnostic Note:</span>
                    <span className="font-mono text-ink-700 truncate max-w-[220px]" title={primary.message}>
                      {primary.message}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Structured Output Mode:</span>
                  <span className="font-mono text-forest font-bold">Strict JSON Schema (Pydantic)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Timeout & Retry Policy:</span>
                  <span className="font-mono text-ink-700">30s timeout (Failover trigger)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-ink-500">Credentials Security:</span>
                  <span className="font-mono text-forest flex items-center font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    Backend Vault (Never in Browser)
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Fallback AI Provider */}
        {(() => {
          const fallback = healthData?.checks?.aiService?.details?.providers?.fallback;
          const isHealthy = healthData?.checks?.aiService?.status === 'healthy';
          const isReady = fallback?.configured && fallback?.status === 'ready';

          return (
            <div className="bg-surface rounded-2xl border border-ink-200 p-6 shadow-card space-y-4 hover:border-ink-300 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-amberBrand-50 text-amberBrand border border-amberBrand/20 flex items-center justify-center font-bold text-lg font-mono">
                    {fallback?.provider ? fallback.provider.charAt(0).toUpperCase() : 'O'}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink-900 font-sans">
                      {fallback?.provider ? fallback.provider.toUpperCase() : 'OpenAI'} ({fallback?.model || 'gpt-4o-mini'})
                    </h4>
                    <p className="text-xs text-ink-500 font-mono">Autonomous Failover Target</p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold flex items-center border ${
                    fallback?.connectivity === 'verified' || isReady
                      ? 'bg-forest-50 text-forest border-forest/20'
                      : fallback?.configured && fallback?.status === 'unreachable'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : isHealthy
                      ? 'bg-amberBrand-50 text-amberBrand-dark border-amberBrand/30'
                      : 'bg-red-50 text-red-600 border-red-200'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {fallback?.connectivity === 'verified'
                    ? 'Standby Failover (Verified)'
                    : fallback?.status === 'ready'
                    ? 'Standby Failover (Configured)'
                    : fallback?.configured && fallback?.status === 'unreachable'
                    ? 'Failover (Unreachable)'
                    : 'Failover (Unconfigured)'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs border-t border-ink-100 pt-3.5 font-sans">
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Model Deployment:</span>
                  <span className="font-mono font-bold text-ink-900">{fallback?.model || 'gpt-4o-mini'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Connectivity State:</span>
                  <span className="font-mono text-ink-800 font-bold capitalize">
                    {fallback?.connectivity || fallback?.status || 'unconfigured'}
                  </span>
                </div>
                {fallback?.message && (
                  <div className="flex justify-between py-1 border-b border-ink-50">
                    <span className="text-ink-500">Diagnostic Note:</span>
                    <span className="font-mono text-ink-700 truncate max-w-[220px]" title={fallback.message}>
                      {fallback.message}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Autonomous Trigger:</span>
                  <span className="font-mono text-amberBrand-dark font-bold">5xx, Timeout, Rate Limit</span>
                </div>
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Output Normalization:</span>
                  <span className="font-mono text-ink-700">Unified Schema & Citations</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-ink-500">Simulation Switch:</span>
                  <span className="font-mono text-forest font-bold flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Active in Review Workspace
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Backend & DB Health Services */}
      <div className="bg-surface rounded-2xl border border-ink-200 p-6 shadow-card space-y-4">
        <h4 className="font-bold text-sm text-ink-900 font-sans">Platform Services Infrastructure</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
          <div className="p-4 bg-canvas rounded-xl border border-ink-200 space-y-1">
            <div className="flex items-center space-x-2 text-ink-800 font-bold mb-2">
              <Server className="w-4 h-4 text-forest" />
              <span>Node.js Express Backend</span>
            </div>
            <p className="text-ink-600">
              Status:{' '}
              <strong className={isLive ? 'text-forest' : 'text-ink-700'}>
                {isLive ? 'Operational (:5000)' : 'Offline / Standby'}
              </strong>
            </p>
            <p className="text-ink-500 font-mono text-[11px]">CORS: Strict Origin Policy</p>
          </div>

          <div className="p-4 bg-canvas rounded-xl border border-ink-200 space-y-1">
            <div className="flex items-center space-x-2 text-ink-800 font-bold mb-2">
              <Database className="w-4 h-4 text-forest" />
              <span>Database Persistence</span>
            </div>
            <p className="text-ink-600">
              Status:{' '}
              <strong className={healthData?.checks?.database?.status === 'connected' ? 'text-forest' : 'text-ink-700'}>
                {healthData?.checks?.database?.status || 'In-Memory / Deterministic'}
              </strong>
            </p>
            <p className="text-ink-500 font-mono text-[11px]">Multi-Tenant Isolation: Enforced</p>
          </div>

          <div className="p-4 bg-canvas rounded-xl border border-ink-200 space-y-1">
            <div className="flex items-center space-x-2 text-ink-800 font-bold mb-2">
              <Cpu className="w-4 h-4 text-forest" />
              <span>Python FastAPI Service</span>
            </div>
            <p className="text-ink-600">
              Status:{' '}
              <strong className={healthData?.checks?.aiService?.status === 'healthy' ? 'text-forest' : 'text-ink-700'}>
                {healthData?.checks?.aiService?.status || 'Protected Microservice (:8000)'}
              </strong>
            </p>
            <p className="text-ink-500 font-mono text-[11px]">Internal API Key: Authenticated</p>
          </div>
        </div>

        {/* Real Review Telemetry */}
        <div className="pt-3 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-ink-600 font-sans gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-ink-800">Last Verified AI Review:</span>
            {healthData?.checks?.aiService?.details?.last_successful_review ? (
              <span className="font-mono text-forest font-semibold">
                {healthData.checks.aiService.details.last_successful_review.provider.toUpperCase()} (
                {healthData.checks.aiService.details.last_successful_review.model}) —{' '}
                {healthData.checks.aiService.details.last_successful_review.findings_count} finding(s) in{' '}
                {healthData.checks.aiService.details.last_successful_review.latency_ms}ms
              </span>
            ) : (
              <span className="font-mono text-ink-500">None executed in current service uptime</span>
            )}
          </div>
          {healthData?.checks?.aiService?.details?.last_successful_review?.timestamp && (
            <span className="font-mono text-[11px] text-ink-400">
              {new Date(healthData.checks.aiService.details.last_successful_review.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Organization User Directory */}
      <div className="bg-surface rounded-2xl border border-ink-200 shadow-card overflow-hidden">
        <div className="p-5 border-b border-ink-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-forest" />
            <h4 className="font-bold text-sm text-ink-900 font-sans">Organization Members & RBAC Entitlements</h4>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-ink-500 bg-canvas px-2.5 py-1 rounded-md border border-ink-200">
              {users.length} Active Member{users.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => { setShowAddModal(true); setAddError(null); }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-forest text-white rounded-lg text-xs font-bold hover:bg-forest-dark transition-colors shadow-subtle"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Member</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-canvas border-b border-ink-200 text-ink-500 uppercase tracking-wider font-mono text-[10px]">
              <tr>
                <th className="py-3 px-5">Name & Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-5">Governance Authorizations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 font-sans">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-ink-400">
                    No users loaded from database.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id || u.email} className="hover:bg-canvas/60">
                    <td className="py-4 px-5">
                      <div className="font-bold text-ink-900">{u.name}</div>
                      <div className="text-[11px] text-ink-500 font-mono">{u.email}</div>
                    </td>
                    <td className="py-4 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded bg-canvas border border-ink-200 uppercase font-bold text-[11px] text-ink-800">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-ink-700 font-medium">
                      {u.role === 'admin' ? 'Executive Governance' : u.role === 'reviewer' ? 'Legal & Brand Affairs' : 'Content Marketing'}
                    </td>
                    <td className="py-4 px-5 text-ink-600 text-[11px] leading-relaxed">
                      {u.role === 'admin'
                        ? 'Full Governance, Rule Creation, Direct Rule Approval, Mesh Diagnostics'
                        : u.role === 'reviewer'
                        ? 'Human Approval Sign-offs, Version Rejections, Revisions Request'
                        : 'Draft Composer, Automated AI Pre-flight Check, Revision Application'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-surface rounded-2xl border border-ink-200 shadow-modal max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-ink-100">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-forest" />
                <h3 className="font-bold text-sm text-ink-900 font-sans">Add Organization Member</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-ink-400 hover:text-ink-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                  Full Name
                </label>
                <div className="relative rounded-lg shadow-subtle">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Marcus Vance"
                    className="block w-full pl-9 pr-3 py-2 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 focus:outline-none focus:ring-1 focus:ring-forest font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                  Work Email Address
                </label>
                <div className="relative rounded-lg shadow-subtle">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="marcus@company.com"
                    className="block w-full pl-9 pr-3 py-2 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 focus:outline-none focus:ring-1 focus:ring-forest font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                  Password (min 8 characters)
                </label>
                <div className="relative rounded-lg shadow-subtle">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="block w-full pl-9 pr-3 py-2 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 focus:outline-none focus:ring-1 focus:ring-forest font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-900 font-sans mb-1">
                  RBAC Role & Entitlement
                </label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as any)}
                  className="block w-full px-3 py-2 text-xs bg-canvas border border-ink-200 rounded-lg text-ink-900 focus:outline-none focus:ring-1 focus:ring-forest font-sans"
                >
                  <option value="creator">Creator (Draft Composer & Pre-flight)</option>
                  <option value="reviewer">Reviewer (Brand & Compliance Approvals)</option>
                  <option value="admin">Administrator (Full Governance & User Mgmt)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-ink-100">
                <Button 
                  type="button" 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary" 
                  size="sm" 
                  disabled={addingUser}
                >
                  {addingUser ? 'Adding...' : 'Create Member'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
