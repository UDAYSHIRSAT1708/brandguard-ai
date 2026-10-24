import React from 'react';
import { 
  Shield, 
  LayoutDashboard, 
  FileEdit, 
  BookOpen, 
  CheckSquare, 
  History, 
  Settings, 
  UserCheck,
  Building2,
  LogOut
} from 'lucide-react';
import { useAuth, isDemoAllowed } from '../../context/AuthContext';
import { UserRole } from '../../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, pendingCount = 0 }) => {
  const { role, user, logout, loginAsDemoRole } = useAuth();
  const isDemoEnabled = isDemoAllowed;

  const navItems = [
    { id: 'dashboard', label: 'Governance Overview', icon: LayoutDashboard },
    { id: 'review', label: 'Review Workspace', icon: FileEdit },
    { id: 'knowledge', label: 'Brand Knowledge', icon: BookOpen },
    { 
      id: 'approvals', 
      label: 'Approval Queue', 
      icon: CheckSquare, 
      badge: pendingCount > 0 ? pendingCount : null 
    },
    { id: 'history', label: 'Review History', icon: History },
    { id: 'settings', label: 'Provider Health', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-sidebar text-ink-300 flex flex-col min-h-screen border-r border-sidebar-border flex-shrink-0 select-none">
      {/* Brand Insignia & Tenant */}
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-forest flex items-center justify-center text-white shadow-card border border-forest-light/40">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight font-sans">BrandGuard AI</h1>
            <p className="text-[10px] text-ink-400 font-mono tracking-wider uppercase">Editorial Governance</p>
          </div>
        </div>

        {/* Tenant Card */}
        <div className="mt-4 px-3 py-2 rounded-lg bg-ink-950/70 border border-sidebar-border flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-ink-400">
            <Building2 className="w-3.5 h-3.5 text-forest-light" />
            <span className="font-mono text-[11px]">Tenant:</span>
          </div>
          <span className="font-semibold text-white text-[11px] font-sans truncate max-w-[120px]" title={user?.organisationName || 'Acme Global Corporation'}>
            {user?.organisationName || 'Acme Global'}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-2 pb-2 text-[10px] font-mono uppercase tracking-wider text-ink-500">
          Governance Workspace
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-sidebar-active text-white font-semibold border-l-2 border-forest-light pl-2.5 shadow-subtle'
                  : 'text-ink-400 hover:text-white hover:bg-sidebar-hover'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-forest-light' : 'text-ink-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amberBrand text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Authenticated User Session & Sign Out */}
      <div className="p-4 border-t border-sidebar-border bg-ink-950/60 space-y-3">
        {/* Switch demo account button for fast testing (Dev / Explicit Demo only) */}
        {isDemoEnabled && loginAsDemoRole && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-400 flex items-center">
                <UserCheck className="w-3 h-3 mr-1 text-forest-light" />
                Active Identity
              </span>
              <span className="text-[9px] text-ink-500 font-mono">Backend Auth</span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-sidebar p-1 rounded-lg border border-sidebar-border">
              {(['admin', 'creator', 'reviewer'] as UserRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => loginAsDemoRole(r)}
                  className={`text-[10px] py-1 rounded font-medium capitalize transition-all ${
                    role === r
                      ? 'bg-forest text-white font-semibold shadow-subtle'
                      : 'text-ink-400 hover:text-white hover:bg-sidebar-hover'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* User Profile Card */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-forest-dark border border-forest/30 flex items-center justify-center text-xs font-bold text-forest-50 flex-shrink-0">
              {user?.name ? user.name.charAt(0) : 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-medium text-white truncate font-sans">{user?.name || 'Authorized User'}</p>
              <p className="text-[10px] text-ink-400 font-mono truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={logout}
            title="Sign out of BrandGuard AI"
            className="p-1.5 rounded-lg text-ink-400 hover:text-white hover:bg-sidebar-hover transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
