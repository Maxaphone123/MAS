import React, { useState, useEffect } from 'react';
import {
  Send,
  Bot,
  Puzzle,
  Shield,
  Download,
  Upload,
  Check,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Server,
  Layers,
  Terminal,
  Copy,
  Lock,
  Unlock,
  KeyRound,
  FileArchive,
  Info
} from 'lucide-react';
import { api } from '../api';
import { TelegramConfig, PluginItem, AuthStatus } from '../types';

interface SettingsPageProps {
  onLogout?: () => void;
}

type SettingsSection = 'telegram' | 'plugins' | 'security' | 'backup' | 'deployment';

export const SettingsPage: React.FC<SettingsPageProps> = ({ onLogout }) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('telegram');

  // Telegram state (Stage 8B)
  const [tgConfig, setTgConfig] = useState<TelegramConfig>({
    enabled: false,
    botToken: '',
    chatId: '',
    notifyOnStepDone: true,
    notifyOnBlocked: true,
    notifyOnDirective: true
  });
  const [tgTokenInput, setTgTokenInput] = useState('');
  const [showTgToken, setShowTgToken] = useState(false);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgTestResult, setTgTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [tgSaveSuccess, setTgSaveSuccess] = useState(false);

  // Plugins state (Stage 8C)
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [showAddPlugin, setShowAddPlugin] = useState(false);
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);
  const [newPlugin, setNewPlugin] = useState({
    name: '',
    description: '',
    targetRoles: ['code'] as Array<'planning' | 'code' | 'ui' | 'images' | 'review'>,
    instructions: ''
  });

  // Security state (Stage 9A)
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ enabled: false, authenticated: true });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMsg, setAuthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Backup state (Stage 9A)
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // PWA & Deployment state (Stage 9B)
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();

    // Catch PWA beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Detect if running standalone
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setPwaInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const loadAllData = async () => {
    try {
      const [tg, plug, auth] = await Promise.all([
        api.getTelegramConfig(),
        api.getPlugins(),
        api.getAuthStatus()
      ]);
      setTgConfig(tg);
      setTgTokenInput(tg.botToken || '');
      setPlugins(plug);
      setAuthStatus(auth);
    } catch (err) {
      console.error('Failed to load settings data:', err);
    }
  };

  // Telegram handlers
  const handleSaveTelegram = async () => {
    setTgLoading(true);
    setTgSaveSuccess(false);
    try {
      const res = await api.saveTelegramConfig({
        ...tgConfig,
        botToken: tgTokenInput
      });
      if (res.ok) {
        setTgConfig(res.config);
        setTgTokenInput(res.config.botToken);
        setTgSaveSuccess(true);
        setTimeout(() => setTgSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      alert('Failed to save Telegram config: ' + err.message);
    } finally {
      setTgLoading(false);
    }
  };

  const handleTestTelegram = async () => {
    setTgLoading(true);
    setTgTestResult(null);
    try {
      const res = await api.testTelegramMessage();
      if (res.ok) {
        setTgTestResult({ ok: true, message: 'Test message sent successfully! Check your Telegram chat.' });
      } else {
        setTgTestResult({ ok: false, message: res.error || 'Failed to send test message' });
      }
    } catch (err: any) {
      setTgTestResult({ ok: false, message: err.message || 'Network error reaching Telegram' });
    } finally {
      setTgLoading(false);
    }
  };

  // Plugin handlers
  const handleTogglePlugin = async (id: string) => {
    try {
      const res = await api.togglePlugin(id);
      if (res.ok && res.plugin) {
        setPlugins((prev) => prev.map((p) => (p.id === id ? res.plugin! : p)));
      }
    } catch (err: any) {
      alert('Failed to toggle plugin: ' + err.message);
    }
  };

  const handleDeletePlugin = async (id: string) => {
    if (!confirm('Are you sure you want to delete this custom instruction pack?')) return;
    try {
      const res = await api.deletePlugin(id);
      if (res.ok) {
        setPlugins((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err: any) {
      alert('Failed to delete plugin: ' + err.message);
    }
  };

  const handleCreatePlugin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlugin.name || !newPlugin.instructions) return;
    try {
      const res = await api.addPlugin(newPlugin);
      if (res.ok && res.plugin) {
        setPlugins((prev) => [...prev, res.plugin!]);
        setShowAddPlugin(false);
        setNewPlugin({
          name: '',
          description: '',
          targetRoles: ['code'],
          instructions: ''
        });
      }
    } catch (err: any) {
      alert('Failed to create plugin: ' + err.message);
    }
  };

  // Auth handlers
  const handleSetupAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 4) {
      setAuthMsg({ type: 'error', text: 'Password must be at least 4 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setAuthMsg({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    setAuthLoading(true);
    setAuthMsg(null);
    try {
      const res = await api.setupAuth(newPassword);
      if (res.ok) {
        setAuthMsg({ type: 'success', text: 'Master password configured! Workspace is now protected.' });
        setNewPassword('');
        setConfirmPassword('');
        const status = await api.getAuthStatus();
        setAuthStatus(status);
      } else {
        setAuthMsg({ type: 'error', text: res.error || 'Failed to set password' });
      }
    } catch (err: any) {
      setAuthMsg({ type: 'error', text: err.message || 'Setup error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDisableAuth = async () => {
    if (!confirm('Disable authentication? Anyone with access to the URL will be able to control Orchestrator.')) return;
    setAuthLoading(true);
    try {
      const res = await api.disableAuth();
      if (res.ok) {
        setAuthStatus({ enabled: false, authenticated: true });
        setAuthMsg({ type: 'success', text: 'Authentication disabled.' });
      }
    } catch (err: any) {
      setAuthMsg({ type: 'error', text: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  // Backup handlers
  const handleRestoreBackup = async () => {
    if (!restoreFile) return;
    if (!confirm('Restoring a backup will overwrite current /data contents. Proceed?')) return;
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const res = await api.restoreBackup(restoreFile);
      if (res.ok) {
        setBackupMsg({
          type: 'success',
          text: `Backup restored successfully! (${res.restoredFilesCount} files restored). Reloading state...`
        });
        setRestoreFile(null);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setBackupMsg({ type: 'error', text: res.error || 'Failed to restore backup' });
      }
    } catch (err: any) {
      setBackupMsg({ type: 'error', text: err.message || 'Network error restoring backup' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleInstallPWA = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setPwaInstalled(true);
      }
      setInstallPrompt(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Top Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <span>Settings & Extensions</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-mono">
              Stages 8 & 9
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure Telegram alerts, instruction packs, single-user auth, full ZIP backup, and PWA deployment.
          </p>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveSection('telegram')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === 'telegram'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Send className="w-3.5 h-3.5 text-blue-400" />
            <span>Telegram (8B)</span>
          </button>
          <button
            onClick={() => setActiveSection('plugins')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === 'plugins'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Puzzle className="w-3.5 h-3.5 text-purple-400" />
            <span>Plugins (8C)</span>
          </button>
          <button
            onClick={() => setActiveSection('security')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === 'security'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Security (9A)</span>
          </button>
          <button
            onClick={() => setActiveSection('backup')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === 'backup'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5 text-amber-400" />
            <span>Backup (9A)</span>
          </button>
          <button
            onClick={() => setActiveSection('deployment')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === 'deployment'
                ? 'bg-zinc-800 text-zinc-100 shadow border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-rose-400" />
            <span>PWA & Deploy (9B)</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECTION 1: TELEGRAM BOT CONNECTOR (Stage 8B)              */}
      {/* ========================================================= */}
      {activeSection === 'telegram' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-150">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Telegram Messenger Bot Connector</h2>
                    <p className="text-xs text-zinc-400">Push real-time alerts and control runners via bot commands</p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs text-zinc-400">Bot Active</span>
                  <input
                    type="checkbox"
                    checked={tgConfig.enabled}
                    onChange={(e) => setTgConfig({ ...tgConfig, enabled: e.target.checked })}
                    className="w-4 h-4 rounded bg-zinc-950 border-zinc-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </label>
              </div>

              {tgSaveSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Telegram settings saved! Polling service active.</span>
                </div>
              )}

              {tgTestResult && (
                <div
                  className={`mb-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    tgTestResult.ok
                      ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                      : 'bg-red-950/50 border-red-800/60 text-red-300'
                  }`}
                >
                  {tgTestResult.ok ? (
                    <Check className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{tgTestResult.message}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Telegram Bot Token (from @BotFather)
                  </label>
                  <div className="relative">
                    <input
                      type={showTgToken ? 'text' : 'password'}
                      value={tgTokenInput}
                      onChange={(e) => setTgTokenInput(e.target.value)}
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      className="w-full px-3.5 py-2 pr-10 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowTgToken(!showTgToken)}
                      className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      {showTgToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Target Telegram Chat ID (user or group ID)
                  </label>
                  <input
                    type="text"
                    value={tgConfig.chatId}
                    onChange={(e) => setTgConfig({ ...tgConfig, chatId: e.target.value })}
                    placeholder="e.g. 12345678 or -100123456789"
                    className="w-full px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="pt-2 border-t border-zinc-800/60">
                  <h3 className="text-xs font-semibold text-zinc-300 mb-2.5">Notification Triggers</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tgConfig.notifyOnStepDone}
                        onChange={(e) => setTgConfig({ ...tgConfig, notifyOnStepDone: e.target.checked })}
                        className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-0"
                      />
                      <span>Notify when a step completes successfully (DONE)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tgConfig.notifyOnBlocked}
                        onChange={(e) => setTgConfig({ ...tgConfig, notifyOnBlocked: e.target.checked })}
                        className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-0"
                      />
                      <span>Notify when a branch step gets BLOCKED or fails reviewer</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tgConfig.notifyOnDirective}
                        onChange={(e) => setTgConfig({ ...tgConfig, notifyOnDirective: e.target.checked })}
                        className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-blue-500 focus:ring-0"
                      />
                      <span>Notify when an execution directive modifies the active plan</span>
                    </label>
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <button
                    onClick={handleSaveTelegram}
                    disabled={tgLoading}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs transition-colors flex items-center gap-2"
                  >
                    {tgLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Save Settings</span>
                  </button>

                  <button
                    onClick={handleTestTelegram}
                    disabled={tgLoading || !tgConfig.chatId}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-medium text-xs border border-zinc-700 transition-colors flex items-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5 text-blue-400" />
                    <span>Send Test Message</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Telegram Command Guide */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>Remote Bot Commands</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When the bot token is configured, Orchestrator listens for messages in your Telegram chat and responds to these commands:
            </p>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <code className="text-emerald-400 font-mono font-bold">/status</code>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Returns active plan version, runner state (RUNNING/IDLE), and completed/blocked step count.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <code className="text-emerald-400 font-mono font-bold">/plan</code>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Returns project goal, current version number, and summary outline.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <code className="text-emerald-400 font-mono font-bold">/branches</code>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Lists all branch states with progress counts (e.g. 🟢 Backend: 4/4 done).
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <code className="text-emerald-400 font-mono font-bold">/run all</code>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Executes all remaining branch steps sequentially from Telegram.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
                <code className="text-emerald-400 font-mono font-bold">/stop</code>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Sends an immediate stop signal to active execution runners.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 2: PLUGINS / INSTRUCTION PACKS (Stage 8C)         */}
      {/* ========================================================= */}
      {activeSection === 'plugins' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span>Instruction Packs & Role Plugins</span>
                <span className="text-xs font-mono text-zinc-500">({plugins.length} available)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Enabled plugins dynamically inject specialized architectural rules into Planner, Code, UI, and Reviewer prompts.
              </p>
            </div>

            <button
              onClick={() => setShowAddPlugin(!showAddPlugin)}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Instruction Pack</span>
            </button>
          </div>

          {/* Add Plugin Modal / Form */}
          {showAddPlugin && (
            <form onSubmit={handleCreatePlugin} className="bg-zinc-900 border border-purple-800/40 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Puzzle className="w-3.5 h-3.5" />
                <span>Create Custom Instruction Pack</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Pack Name</label>
                  <input
                    type="text"
                    required
                    value={newPlugin.name}
                    onChange={(e) => setNewPlugin({ ...newPlugin, name: e.target.value })}
                    placeholder="e.g. Next.js App Router Guidelines"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={newPlugin.description}
                    onChange={(e) => setNewPlugin({ ...newPlugin, description: e.target.value })}
                    placeholder="Short description of enforced rules"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Target Roles</label>
                <div className="flex flex-wrap gap-3">
                  {(['planning', 'code', 'ui', 'images', 'review'] as const).map((role) => (
                    <label key={role} className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newPlugin.targetRoles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewPlugin({ ...newPlugin, targetRoles: [...newPlugin.targetRoles, role] });
                          } else {
                            setNewPlugin({ ...newPlugin, targetRoles: newPlugin.targetRoles.filter((r) => r !== role) });
                          }
                        }}
                        className="w-3.5 h-3.5 rounded bg-zinc-950 border-zinc-700 text-purple-500 focus:ring-0"
                      />
                      <span className="capitalize">{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Custom Prompt Instructions (Appended when matching role is invoked)
                </label>
                <textarea
                  rows={4}
                  required
                  value={newPlugin.instructions}
                  onChange={(e) => setNewPlugin({ ...newPlugin, instructions: e.target.value })}
                  placeholder="Enforce specific coding patterns, error envelopes, library choices..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddPlugin(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition-colors"
                >
                  Save Pack
                </button>
              </div>
            </form>
          )}

          {/* Plugin list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plugins.map((pack) => (
              <div
                key={pack.id}
                className={`bg-zinc-900 border rounded-xl p-4 transition-all ${
                  pack.enabled
                    ? 'border-purple-500/40 shadow-sm shadow-purple-950/20'
                    : 'border-zinc-800 opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-100">{pack.name}</span>
                    {pack.isBuiltin && (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        Built-in
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pack.enabled}
                        onChange={() => handleTogglePlugin(pack.id)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>

                    {!pack.isBuiltin && (
                      <button
                        onClick={() => handleDeletePlugin(pack.id)}
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete custom pack"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-zinc-400 mb-3">{pack.description}</p>

                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="text-[10px] text-zinc-500 font-mono">Roles:</span>
                  {pack.targetRoles.map((r) => (
                    <span
                      key={r}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/80 text-purple-300 border border-zinc-700/60 font-mono"
                    >
                      {r}
                    </span>
                  ))}
                </div>

                <div>
                  <button
                    onClick={() =>
                      setExpandedPluginId(expandedPluginId === pack.id ? null : pack.id)
                    }
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 font-mono"
                  >
                    <span>{expandedPluginId === pack.id ? 'Hide Instructions' : 'View Instructions'}</span>
                  </button>

                  {expandedPluginId === pack.id && (
                    <pre className="mt-2 p-2.5 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] text-zinc-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {pack.instructions}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 3: SECURITY & SINGLE-USER AUTH (Stage 9A)         */}
      {/* ========================================================= */}
      {activeSection === 'security' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Single-User Master Password Protection</h2>
                <p className="text-xs text-zinc-400">Lock the orchestrator workspace behind a salted PBKDF2 PIN/password</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                {authStatus.enabled ? (
                  <Lock className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-zinc-500" />
                )}
                <div>
                  <span className="text-xs font-semibold text-zinc-200">
                    Status: {authStatus.enabled ? 'Protected' : 'Unprotected (Open Access)'}
                  </span>
                  <p className="text-[11px] text-zinc-500">
                    {authStatus.enabled
                      ? 'Session token required for all API calls.'
                      : 'Anyone with network access can view plans and execute code.'}
                  </p>
                </div>
              </div>

              {authStatus.enabled && (
                <button
                  onClick={handleDisableAuth}
                  disabled={authLoading}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-red-950/60 hover:text-red-300 border border-zinc-700 text-xs text-zinc-300 transition-colors"
                >
                  Disable
                </button>
              )}
            </div>

            {authMsg && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  authMsg.type === 'success'
                    ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                    : 'bg-red-950/50 border-red-800/60 text-red-300'
                }`}
              >
                {authMsg.type === 'success' ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{authMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleSetupAuth} className="space-y-4 pt-2">
              <h3 className="text-xs font-semibold text-zinc-300">
                {authStatus.enabled ? 'Change Master Password / PIN' : 'Set Master Password / PIN'}
              </h3>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">New Password / PIN</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 4 characters"
                  className="w-full px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  disabled={authLoading || !newPassword}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{authStatus.enabled ? 'Update Password' : 'Enable Auth Protection'}</span>
                </button>

                {authStatus.enabled && onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition-colors"
                  >
                    Lock Workspace
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Hardening Checklist & Details */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Contract 6.6 Security Invariants</span>
            </h3>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Server-side Key Storage:</strong> Provider keys are stored solely in <code className="text-emerald-400 font-mono">data/registry.json</code> and masked as <code className="text-zinc-400 font-mono">****XXXX</code> over all API responses.
                </span>
              </div>

              <div className="flex items-start gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Git Exclusion:</strong> The entire <code className="text-emerald-400 font-mono">/data</code> folder is strictly gitignored to guarantee zero secrets leak into version control.
                </span>
              </div>

              <div className="flex items-start gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Sandboxed Execution:</strong> Generated code renders inside an isolated iframe with <code className="text-emerald-400 font-mono">sandbox="allow-scripts"</code> (without <code className="text-zinc-400 font-mono">allow-same-origin</code>).
                </span>
              </div>

              <div className="flex items-start gap-2 text-zinc-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Rate Limiting & Cooldowns:</strong> Outage simulators and exponential cooldowns prevent runaway token consumption.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 4: FULL BACKUP & DISASTER RECOVERY (Stage 9A)     */}
      {/* ========================================================= */}
      {activeSection === 'backup' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-150">
          {/* Export Box */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Export Full Data Backup</h2>
                <p className="text-xs text-zinc-400">Download the entire state of /data as a single compressed ZIP file</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Includes all plan versions, branch states, executor result outputs, generated project files, models registry, router configurations, and activity logs.
            </p>

            <a
              href="/api/backup/export"
              download="orchestrator-data-backup.zip"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-xs transition-colors shadow-lg shadow-amber-950/40"
            >
              <Download className="w-4 h-4" />
              <span>Download Full Backup (ZIP)</span>
            </a>
          </div>

          {/* Restore Box */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Restore from Backup ZIP</h2>
                <p className="text-xs text-zinc-400">Upload a previously exported ZIP archive to recover workspace state</p>
              </div>
            </div>

            {backupMsg && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  backupMsg.type === 'success'
                    ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                    : 'bg-red-950/50 border-red-800/60 text-red-300'
                }`}
              >
                {backupMsg.type === 'success' ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{backupMsg.text}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Select ZIP Backup File</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
              />
            </div>

            <button
              onClick={handleRestoreBackup}
              disabled={backupLoading || !restoreFile}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-2"
            >
              {backupLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Restore Workspace State</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SECTION 5: DEPLOYMENT & DESKTOP / PWA (Stage 9B)          */}
      {/* ========================================================= */}
      {activeSection === 'deployment' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* PWA Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">Desktop / Mobile PWA</h2>
                  <p className="text-xs text-zinc-400">Progressive Web App with offline shell</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">PWA Manifest:</span>
                  <span className="text-emerald-400 font-mono">/manifest.webmanifest</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Service Worker:</span>
                  <span className="text-emerald-400 font-mono">/sw.js (Active)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">App Mode:</span>
                  <span className="text-zinc-200 font-mono">
                    {pwaInstalled ? 'Standalone Window' : 'Browser Tab'}
                  </span>
                </div>
              </div>

              {installPrompt ? (
                <button
                  onClick={handleInstallPWA}
                  className="w-full py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Orchestrator App</span>
                </button>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  {pwaInstalled
                    ? 'Orchestrator is currently running as an installed desktop application.'
                    : 'To install on desktop, click "Install Orchestrator" in your browser address bar or menu.'}
                </p>
              )}
            </div>

            {/* Production Run snippet */}
            <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                    Node.js 22 & Systemd Deployment Guide
                  </h3>
                </div>
                <button
                  onClick={() =>
                    copyToClipboard(
                      'npm run build\nPORT=3000 node server.ts',
                      'node-cmd'
                    )
                  }
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  {copiedCode === 'node-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode === 'node-cmd' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-[11px] text-zinc-300 font-mono whitespace-pre-wrap">
{`# 1. Install production dependencies & build client bundle
npm install
npm run build

# 2. Run high-performance Express server on port 3000
PORT=3000 npm start`}
              </pre>

              {/* Docker Snippet */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-300">Docker Run Template:</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        'docker build -t orchestrator-agent .\ndocker run -d -p 3000:3000 -v $(pwd)/data:/app/data orchestrator-agent',
                        'docker-cmd'
                      )
                    }
                    className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                  >
                    {copiedCode === 'docker-cmd' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode === 'docker-cmd' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-[11px] text-zinc-300 font-mono whitespace-pre-wrap">
{`docker run -d \\
  --name orchestrator \\
  -p 3000:3000 \\
  -v $(pwd)/data:/app/data \\
  --restart unless-stopped \\
  orchestrator-agent`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
