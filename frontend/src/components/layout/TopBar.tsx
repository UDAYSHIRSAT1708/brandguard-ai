import React from 'react';
import { Cpu, ShieldCheck, Wifi, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export interface ProviderHealth {
  provider: string;
  model: string;
  configured: boolean;
  status: string;
  connectivity?: string;
  latency_ms?: number;
  message?: string;
  last_checked?: string;
}

interface TopBarProps {
  title: string;
  subtitle?: string;
  isDemoFallback?: boolean;
  providers?: {
    primary?: ProviderHealth;
    fallback?: ProviderHealth;
  };
  aiServiceStatus?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
  isDemoFallback = false,
  providers,
  aiServiceStatus = 'healthy',
}) => {
  const { user } = useAuth();

  const isAiOffline = aiServiceStatus === 'offline' || aiServiceStatus === 'unreachable';
  const primary = providers?.primary;
  const fallback = providers?.fallback;

  return (
    <header className="bg-surface border-b border-ink-200 px-6 sm:px-8 py-3.5 shadow-subtle">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink-900 font-sans">{title}</h2>
          {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Connection & AI Mesh Status Indicator */}
          <div className="hidden md:flex items-center space-x-2 bg-canvas border border-ink-200 px-3 py-1.5 rounded-lg text-xs">
            <Cpu className={`w-3.5 h-3.5 ${isAiOffline ? 'text-red-500' : 'text-forest'}`} />
            <div className="flex items-center space-x-2 font-mono text-[11px]">
              <span className="text-ink-500">AI Mesh:</span>
              {isAiOffline ? (
                <span className="inline-flex items-center text-red-600 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1 animate-pulse"></span>
                  Service Offline
                </span>
              ) : (
                <>
                  <span
                    className={`inline-flex items-center font-semibold ${
                      primary?.status === 'ready'
                        ? 'text-forest'
                        : primary?.configured && primary?.status === 'unreachable'
                        ? 'text-red-500'
                        : 'text-amberBrand'
                    }`}
                    title={primary?.message || (primary?.status ? `Primary Engine (${primary.status})` : 'Primary AI Engine')}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1 ${
                        primary?.status === 'ready'
                          ? 'bg-forest'
                          : primary?.configured && primary?.status === 'unreachable'
                          ? 'bg-red-500'
                          : 'bg-amberBrand'
                      }`}
                    ></span>
                    {primary?.model ? (primary.status === 'ready' ? primary.model : `${primary.model} (${primary.status})`) : 'Gemini 2.0 (Unconfigured)'}
                  </span>
                  <span className="text-ink-300">/</span>
                  <span
                    className={`inline-flex items-center font-semibold ${
                      fallback?.status === 'ready'
                        ? 'text-forest'
                        : fallback?.configured && fallback?.status === 'unreachable'
                        ? 'text-red-500'
                        : 'text-amberBrand'
                    }`}
                    title={fallback?.message || (fallback?.status ? `Failover Engine (${fallback.status})` : 'Autonomous Failover Engine')}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mr-1 ${
                        fallback?.status === 'ready'
                          ? 'bg-forest'
                          : fallback?.configured && fallback?.status === 'unreachable'
                          ? 'bg-red-500'
                          : 'bg-amberBrand'
                      }`}
                    ></span>
                    {fallback?.model
                      ? fallback.status === 'ready'
                        ? `${fallback.model} (Failover)`
                        : `${fallback.model} (${fallback.status})`
                      : 'OpenAI (Unconfigured)'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Mode Pill: Explicitly differentiates Live Backend vs Demo Mode */}
          {isDemoFallback ? (
            <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-amberBrand-50 text-amberBrand border border-amberBrand/30">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Demo Offline Mode
            </div>
          ) : (
            <div className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-mono font-medium bg-forest-50 text-forest border border-forest/20">
              <Wifi className="w-3 h-3 mr-1" />
              Live API
            </div>
          )}

          {/* User Role Badge */}
          <div className="flex items-center space-x-2 border-l border-ink-200 pl-3 sm:pl-4">
            <span className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-forest-50 text-forest border border-forest/20 flex items-center shadow-subtle">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-forest" />
              {user?.role.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
