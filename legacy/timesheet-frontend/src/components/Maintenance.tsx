import React, { useState } from 'react';
import { ServerCrash, RefreshCw, AlertOctagon, ShieldAlert } from 'lucide-react';

interface MaintenanceProps {
  onRetry: () => Promise<boolean>;
}

export const Maintenance: React.FC<MaintenanceProps> = ({ onRetry }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<'idle' | 'success' | 'failed'>('idle');

  const handleRetry = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setCheckResult('idle');
    try {
      const isHealthy = await onRetry();
      if (isHealthy) {
        setCheckResult('success');
      } else {
        setCheckResult('failed');
      }
    } catch (err) {
      setCheckResult('failed');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-white font-sans overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30" />
      </div>

      <div className="relative max-w-xl w-full mx-4 text-center px-8 py-12 rounded-3xl bg-slate-900/60 border border-slate-800 shadow-2xl backdrop-blur-xl">
        
        {/* Icon & Glowing Halo */}
        <div className="relative flex justify-center mb-8">
          <div className="absolute w-24 h-24 bg-amber-500/20 rounded-full blur-xl animate-ping" />
          <div className="relative p-6 bg-slate-800/80 border border-slate-700/50 rounded-2xl shadow-inner text-amber-500">
            <ServerCrash className="w-12 h-12 stroke-[1.5] animate-bounce" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-4">
          Portal is Under Maintenance
        </h1>

        {/* Explanation Description */}
        <p className="text-slate-400 text-sm md:text-base leading-relaxed max-w-md mx-auto mb-8">
          The portal is currently undergoing scheduled maintenance or the server is experiencing high traffic. Please check back shortly. We apologize for the inconvenience.
        </p>

        {/* Diagnostic Status Box */}
        <div className="mb-8 p-4 rounded-xl bg-slate-950/60 border border-slate-800 max-w-sm mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Connection Status
            </span>
          </div>
          <span className="text-xs font-bold text-red-400">
            Server Unreachable
          </span>
        </div>

        {/* Action Button & Messages */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleRetry}
            disabled={isChecking}
            className={`btn-primary flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-primary-900/30 ${
              isChecking ? 'opacity-80 scale-95' : 'hover:scale-[1.02] active:scale-95'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking Connection...' : 'Try Reconnecting'}
          </button>

          {checkResult === 'failed' && (
            <div className="flex items-center gap-2 text-rose-400 text-xs font-semibold animate-fade-in">
              <AlertOctagon className="w-4 h-4" />
              <span>Could not reconnect to server. Still in maintenance mode.</span>
            </div>
          )}

          {checkResult === 'success' && (
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold animate-fade-in">
              <ShieldAlert className="w-4 h-4" />
              <span>Connection restored! Reloading portal...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 text-slate-600 text-xs font-medium uppercase tracking-widest">
          © {new Date().getFullYear()} Ashish Shah & Associates
        </div>
      </div>
    </div>
  );
};
