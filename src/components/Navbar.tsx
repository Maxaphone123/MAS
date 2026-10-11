import React from 'react';
import { Bot, Cpu, FileText, GitBranch, FolderGit2, Network, Settings as SettingsIcon, CheckCircle2, XCircle, Lock } from 'lucide-react';
import { NotificationsCenter } from './NotificationsCenter';

export type NavTab = 'orchestrator' | 'models' | 'plan' | 'branches' | 'project' | 'canvas' | 'settings';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  serverOk: boolean | null;
  authProtected?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange, serverOk, authProtected }) => {
  const tabs = [
    { id: 'orchestrator' as NavTab, label: 'Orchestrator', icon: Bot, badge: null },
    { id: 'models' as NavTab, label: 'Models', icon: Cpu, badge: null },
    { id: 'plan' as NavTab, label: 'Plan', icon: FileText, badge: null },
    { id: 'branches' as NavTab, label: 'Branches', icon: GitBranch, badge: null },
    { id: 'project' as NavTab, label: 'Project', icon: FolderGit2, badge: null },
    { id: 'canvas' as NavTab, label: 'Canvas', icon: Network, badge: null },
    { id: 'settings' as NavTab, label: 'Settings', icon: SettingsIcon, badge: '8-9' },
  ];


  return (
    <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm tracking-wider">
            OR
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-100 text-sm tracking-tight">Orchestrator</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                v2.4
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">Multi-Model Agent Orchestration</p>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 overflow-x-auto py-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right side controls: Notifications & Server Status */}
        <div className="flex items-center gap-2">
          {authProtected && (
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-[10px] text-emerald-400 font-mono"
              title="Single-user workspace lock active"
            >
              <Lock className="w-3 h-3" />
              <span className="hidden sm:inline">Protected</span>
            </div>
          )}

          <NotificationsCenter />

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
              serverOk === true
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                : serverOk === false
                ? 'bg-red-950/40 text-red-400 border-red-800/50'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            {serverOk === true ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Server: OK</span>
              </>
            ) : serverOk === false ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Server: not reachable</span>
              </>
            ) : (
              <span>Checking...</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
