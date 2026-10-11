import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Provider, Model, DiscoveredModel, LogEntry, RouterStateData, RouterConfig, ActiveCooldown } from '../types';
import { StatusBadge, TierBadge } from '../components/StatusBadge';
import {
  KeyRound,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Image as ImageIcon,
  Sliders,
  Flame,
  ShieldAlert,
  Zap,
  RotateCcw
} from 'lucide-react';

export const ModelsPage: React.FC = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Router & Testing Aids state (Stage 6)
  const [routerState, setRouterState] = useState<RouterStateData | null>(null);
  const [activeTab, setActiveTab] = useState<'models' | 'router'>('models');
  const [forceModelId, setForceModelId] = useState<string>('');
  const [forceErrorType, setForceErrorType] = useState<string>('rate_limit_or_quota');
  const [outageProviderId, setOutageProviderId] = useState<string>('');
  const [outageErrorType, setOutageErrorType] = useState<string>('rate_limit_or_quota');

  // Add provider form state
  const [providerType, setProviderType] = useState<'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom'>('gemini');
  const [providerName, setProviderName] = useState('Google Gemini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Save model selection state
  const [selectedDiscovered, setSelectedDiscovered] = useState<string>('');
  const [selectedKind, setSelectedKind] = useState<'text' | 'image'>('text');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['code']);
  const [selectedTier, setSelectedTier] = useState<'fast' | 'balanced' | 'strong'>('balanced');
  const [selectedPriority, setSelectedPriority] = useState<number>(1);
  const [manualModelName, setManualModelName] = useState<string>('');

  // Add Key to provider modal/state (Stage 6B)
  const [addingKeyProviderId, setAddingKeyProviderId] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState<string>('');
  const [newKeyValue, setNewKeyValue] = useState<string>('');

  // Test chat state
  const [testModelId, setTestModelId] = useState<string>('');
  const [testMessage, setTestMessage] = useState<string>('Hello! Please reply in one short sentence.');
  const [testingChat, setTestingChat] = useState<boolean>(false);
  const [testChatResult, setTestChatResult] = useState<{ ok: boolean; text?: string; error?: { type: string; message: string }; durationMs?: number } | null>(null);

  // Test image state (Stage 4B)
  const [testImageModelId, setTestImageModelId] = useState<string>('');
  const [testImagePrompt, setTestImagePrompt] = useState<string>('A modern minimalist app icon with an emerald crystal, vector style, dark background');
  const [testingImage, setTestingImage] = useState<boolean>(false);
  const [testTab, setTestTab] = useState<'chat' | 'image'>('chat');
  const [testImageResult, setTestImageResult] = useState<{ ok: boolean; imageBase64?: string; mimeType?: string; error?: any; durationMs?: number } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const reg = await api.getRegistry();
      setProviders(reg.providers);
      setModels(reg.models);
      if (reg.models.length > 0) {
        if (!testModelId) setTestModelId(reg.models[0].id);
        if (!forceModelId) setForceModelId(reg.models[0].id);
      }
      if (reg.providers.length > 0 && !outageProviderId) {
        setOutageProviderId(reg.providers[0].id);
      }
      const logsData = await api.getLogs();
      setLogs(logsData.slice(0, 20));

      const rState = await api.getRouterState();
      setRouterState(rState);
    } catch (err) {
      console.error('Failed to load models data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const rState = await api.getRouterState();
        setRouterState(rState);
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleProviderTypeChange = (type: any) => {
    setProviderType(type);
    const defaults: Record<string, string> = {
      gemini: 'Google Gemini',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      openrouter: 'OpenRouter',
      custom: 'Custom OpenAI-compatible'
    };
    setProviderName(defaults[type] || 'Provider');
    if (type === 'openrouter') {
      setBaseUrl('https://openrouter.ai/api/v1');
    } else {
      setBaseUrl('');
    }
    setDiscoveredModels([]);
    setConnectionError(null);
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      setConnectionError('Please enter an API key first.');
      return;
    }
    setTestingConnection(true);
    setConnectionError(null);
    setDiscoveredModels([]);

    try {
      const res = await api.testConnection(providerType, apiKey.trim(), baseUrl ? baseUrl.trim() : undefined);
      if (res.ok && res.models) {
        setDiscoveredModels(res.models);
        if (res.models.length > 0) {
          setSelectedDiscovered(res.models[0].name);
          setSelectedTier(res.models[0].suggestedTier);
          setSelectedKind(res.models[0].kind || 'text');
        }
      } else {
        setConnectionError(res.error?.message || 'Connection failed.');
      }
    } catch (err: any) {
      setConnectionError(err.message || 'Connection error.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleAddModel = async () => {
    const modelNameToAdd = manualModelName.trim() || selectedDiscovered;
    if (!modelNameToAdd) {
      alert('Please specify or select a model name.');
      return;
    }

    try {
      let prov = providers.find(p => p.type === providerType);
      if (!prov) {
        const resProv = await api.addProvider({
          type: providerType,
          name: providerName,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl ? baseUrl.trim() : undefined
        });
        if (!resProv.ok) throw new Error('Failed to create provider record');
        prov = {
          id: resProv.providerId,
          type: providerType,
          name: providerName,
          baseUrl: baseUrl ? baseUrl.trim() : undefined,
          apiKey: '****'
        };
      }

      await api.addModel({
        providerId: prov.id,
        modelName: modelNameToAdd,
        kind: selectedKind,
        roles: selectedRoles,
        priority: selectedPriority,
        tier: selectedTier
      });

      setApiKey('');
      setManualModelName('');
      setDiscoveredModels([]);
      await loadData();
    } catch (err: any) {
      alert('Failed to save model: ' + err.message);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm('Remove this model from registry?')) return;
    await api.deleteModel(id);
    await loadData();
  };

  // Multi-Key handling (Stage 6B)
  const handleAddKey = async (providerId: string) => {
    if (!newKeyValue.trim()) {
      alert('Please enter an API key.');
      return;
    }
    try {
      await api.addProviderKey(providerId, newKeyValue.trim(), newKeyLabel.trim() || undefined);
      setAddingKeyProviderId(null);
      setNewKeyValue('');
      setNewKeyLabel('');
      await loadData();
    } catch (e: any) {
      alert('Failed to add key: ' + e.message);
    }
  };

  const handleDeleteKey = async (providerId: string, keyId: string) => {
    if (!confirm('Delete this key?')) return;
    try {
      const res = await api.deleteProviderKey(providerId, keyId);
      if (!res.ok) alert('Cannot delete key.');
      await loadData();
    } catch (e: any) {
      alert('Error: ' + e.message);
    }
  };

  // Router Testing Aids actions (Stage 6A/6B & 7A)
  const handleForceFailure = async () => {
    if (!forceModelId) return;
    await api.forceFailure(forceModelId, forceErrorType);
    await loadData();
  };

  const handleToggleOutage = async () => {
    if (!outageProviderId) return;
    const isOutage = routerState?.state.simulatedOutages[outageProviderId];
    await api.toggleSimulatedOutage(outageProviderId, isOutage ? undefined : outageErrorType);
    await loadData();
  };

  const handleForceReviewFail = async (count: number) => {
    await api.forceReviewFail(count);
    await loadData();
  };

  const handleClearTestingAids = async () => {
    await api.clearTestingAids();
    await loadData();
  };

  const handleClearCooldown = async (key?: string) => {
    await api.clearCooldown(key);
    await loadData();
  };

  const handleRunTestChat = async () => {
    if (!testModelId) return;
    setTestingChat(true);
    setTestChatResult(null);
    try {
      const res = await api.testChat(testModelId, testMessage);
      setTestChatResult(res);
      await loadData();
    } catch (err: any) {
      setTestChatResult({
        ok: false,
        error: { type: 'unknown', message: err.message }
      });
    } finally {
      setTestingChat(false);
    }
  };

  const handleRunTestImage = async () => {
    if (!testImageModelId) return;
    setTestingImage(true);
    setTestImageResult(null);
    try {
      const res = await api.testImage(testImageModelId, testImagePrompt);
      setTestImageResult(res);
      await loadData();
    } catch (err: any) {
      setTestImageResult({
        ok: false,
        error: { type: 'unknown', message: err.message }
      });
    } finally {
      setTestingImage(false);
    }
  };

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      if (selectedRoles.length > 1) {
        setSelectedRoles(selectedRoles.filter(r => r !== role));
      }
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const activeOutages = Object.keys(routerState?.state.simulatedOutages || {});
  const activeForces = Object.keys(routerState?.state.forceFailures || {});
  const reviewFailArmed = (routerState?.state.forceReviewFailCount || 0) > 0;
  const isAnyTestingAidActive = activeOutages.length > 0 || activeForces.length > 0 || reviewFailArmed;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      {/* Header & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-emerald-400" />
            Model Registry & Intelligent Router (Stage 6)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Dynamic provider adapters, multi-key rotation, automatic failover within provider, tier matching, and testing aids.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md bg-zinc-950 border border-zinc-800 p-0.5 text-xs font-medium">
            <button
              onClick={() => setActiveTab('models')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                activeTab === 'models' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Models & Keys
            </button>
            <button
              onClick={() => setActiveTab('router')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
                activeTab === 'router' ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Router & Testing Aids
              {isAnyTestingAidActive && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-0.5"></span>
              )}
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Active Testing Aids Warning Banner */}
      {isAnyTestingAidActive && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-xs text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Testing Aids Active:</strong>{' '}
              {activeForces.length > 0 && `Forced fail on ${activeForces.length} model(s). `}
              {activeOutages.length > 0 && `Simulated outage on ${activeOutages.length} provider(s). `}
              {reviewFailArmed && `Forced ${routerState?.state.forceReviewFailCount} review failure(s).`}
            </span>
          </div>
          <button
            onClick={handleClearTestingAids}
            className="px-2.5 py-1 bg-amber-800/40 hover:bg-amber-700/60 text-amber-200 rounded text-[11px] font-mono border border-amber-700"
          >
            Clear Testing Aids
          </button>
        </div>
      )}

      {activeTab === 'router' ? (
        /* Router & Testing Aids Panel (Stage 6A & 6B) */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Router Configuration */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Router Rules & Thresholds (Rule 6.10 & 7.7)
              </h2>
              <p className="text-xs text-zinc-400">
                Failover automatically stays within the branch's assigned provider. Switches tiers: fast ↔ balanced ↔ strong.
              </p>

              {routerState?.config && (
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px] uppercase">Rate Limit Cooldown</span>
                    <span className="text-zinc-200 font-semibold">{routerState.config.limitCooldownMin} minutes</span>
                  </div>
                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px] uppercase">Model Not Found Cooldown</span>
                    <span className="text-zinc-200 font-semibold">{routerState.config.notFoundCooldownMin} minutes</span>
                  </div>
                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px] uppercase">Max Switches / Step</span>
                    <span className="text-zinc-200 font-semibold">{routerState.config.maxSwitchesPerStep} attempts</span>
                  </div>
                  <div className="p-3 bg-zinc-950 rounded border border-zinc-800">
                    <span className="text-zinc-500 block text-[10px] uppercase">Max Reworks / Step</span>
                    <span className="text-zinc-200 font-semibold">{routerState.config.maxReworksPerStep} reworks</span>
                  </div>
                </div>
              )}

              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Cross-Provider Fallback for Planning</span>
                  <input
                    type="checkbox"
                    checked={routerState?.config.allowOtherProvidersForPlanning || false}
                    onChange={async (e) => {
                      await api.updateRouterConfig({ allowOtherProvidersForPlanning: e.target.checked });
                      await loadData();
                    }}
                    className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Allow Local Code Syntax Execution (Choice 18)</span>
                  <input
                    type="checkbox"
                    checked={routerState?.config.allowRunningGeneratedCode ?? true}
                    onChange={async (e) => {
                      await api.updateRouterConfig({ allowRunningGeneratedCode: e.target.checked });
                      await loadData();
                    }}
                    className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Live Active Cooldowns */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  Active Cooldowns ({routerState?.state.activeCooldowns?.length || 0})
                </h2>
                {routerState?.state.activeCooldowns && routerState.state.activeCooldowns.length > 0 && (
                  <button
                    onClick={() => handleClearCooldown()}
                    className="text-[11px] font-mono text-amber-400 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Models and keys temporarily locked due to 429 quota or 404 errors. Expired cooldowns are removed automatically.
              </p>

              {(!routerState?.state.activeCooldowns || routerState.state.activeCooldowns.length === 0) ? (
                <div className="p-8 text-center bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-500">
                  No active cooldowns. All registered models and keys are healthy.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {routerState.state.activeCooldowns.map((cd) => (
                    <div key={cd.key} className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded text-xs">
                      <div>
                        <span className="font-mono text-zinc-200 font-semibold">{cd.modelName}</span>
                        <span className="text-zinc-500 text-[10px] block font-mono">[{cd.keyLabel}] · expires in {cd.secondsLeft}s</span>
                      </div>
                      <button
                        onClick={() => handleClearCooldown(cd.key)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-mono"
                      >
                        Release
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Testing Aids Panel (Rule 6.14 & 7.8) */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Testing Aids (Rule 6.14 & 7.8)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Simulate errors without burning external tokens to test failover routing, handoff prompt notes, and reviewer rework loops.
                </p>
              </div>
              <button
                onClick={handleClearTestingAids}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono border border-zinc-700 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Testing Aids
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Aid 1: Force Failure on Model */}
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                <span className="text-xs font-semibold text-zinc-300 block">1. Force Failure on Next Call</span>
                <select
                  value={forceModelId}
                  onChange={(e) => setForceModelId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.modelName}</option>
                  ))}
                </select>

                <select
                  value={forceErrorType}
                  onChange={(e) => setForceErrorType(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                >
                  <option value="rate_limit_or_quota">Rate Limit / Quota (429)</option>
                  <option value="auth">Auth / Invalid Key (401)</option>
                  <option value="model_not_found">Model Not Found (404)</option>
                  <option value="network">Network Error</option>
                </select>

                <button
                  onClick={handleForceFailure}
                  disabled={!forceModelId}
                  className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium border border-zinc-700"
                >
                  Arm Forced Error
                </button>
              </div>

              {/* Aid 2: Simulated Provider Outage */}
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                <span className="text-xs font-semibold text-zinc-300 block">2. Simulated Provider Outage</span>
                <select
                  value={outageProviderId}
                  onChange={(e) => setOutageProviderId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </select>

                <select
                  value={outageErrorType}
                  onChange={(e) => setOutageErrorType(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 font-mono"
                >
                  <option value="rate_limit_or_quota">All Models Rate Limited (429)</option>
                  <option value="network">Provider Outage (Network)</option>
                  <option value="auth">Global Auth Expired (401)</option>
                </select>

                <button
                  onClick={handleToggleOutage}
                  disabled={!outageProviderId}
                  className={`w-full py-1.5 rounded text-xs font-medium border ${
                    routerState?.state.simulatedOutages[outageProviderId]
                      ? 'bg-red-950 text-red-300 border-red-800'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                >
                  {routerState?.state.simulatedOutages[outageProviderId] ? 'Turn Outage OFF' : 'Simulate Outage'}
                </button>
              </div>

              {/* Aid 3: Force Reviewer to Fail (Rule 7.8) */}
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                <span className="text-xs font-semibold text-zinc-300 block">3. Reviewer Rework Loop Test</span>
                <p className="text-[11px] text-zinc-500">
                  Forces next N completed steps to receive FAIL from Reviewer to verify file cleanup and prompt rework loop.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleForceReviewFail(1)}
                    className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono border border-zinc-700"
                  >
                    1 FAIL
                  </button>
                  <button
                    onClick={() => handleForceReviewFail(2)}
                    className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-mono border border-zinc-700"
                  >
                    2 FAILS
                  </button>
                  <button
                    onClick={() => handleForceReviewFail(0)}
                    className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded text-xs font-mono border border-zinc-800"
                  >
                    Reset
                  </button>
                </div>

                <div className="text-[11px] font-mono text-zinc-400">
                  Current queued review fails: <span className="text-emerald-400 font-bold">{routerState?.state.forceReviewFailCount || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Models & Keys Main View (Multi-Key Stage 6B) */
        <div className="space-y-8">
          {/* Grid: Add Provider / Model form + Test chat */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1 & 2: Add Provider & Models */}
            <div className="lg:col-span-2 bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Add Provider & Connect Models
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Provider Type</label>
                  <select
                    value={providerType}
                    onChange={(e) => handleProviderTypeChange(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="custom">Custom (OpenAI-compatible)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Display Label</label>
                  <input
                    type="text"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-400 mb-1">API Key</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {(providerType === 'openrouter' || providerType === 'custom') && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-zinc-400 mb-1">Base URL</label>
                    <input
                      type="text"
                      placeholder="https://..."
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Dynamic Connection Test (Principle 6.9) */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection || !apiKey.trim()}
                  className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs font-medium flex items-center gap-1.5 border border-zinc-700 transition-colors"
                >
                  {testingConnection ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                  Test Connection & List Models
                </button>
                {discoveredModels.length > 0 && (
                  <span className="text-xs text-emerald-400 font-mono">
                    ✓ {discoveredModels.length} models discovered
                  </span>
                )}
              </div>

              {connectionError && (
                <div className="p-3 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{connectionError}</span>
                </div>
              )}

              {/* Model selection & role assignment after discovery */}
              {(discoveredModels.length > 0 || apiKey.trim()) && (
                <div className="border-t border-zinc-800 pt-4 space-y-4">
                  <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide font-mono">
                    Model Role & Tier Configuration
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {discoveredModels.length > 0 ? (
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Select Discovered Model</label>
                        <select
                          value={selectedDiscovered}
                          onChange={(e) => {
                            setSelectedDiscovered(e.target.value);
                            const found = discoveredModels.find(m => m.name === e.target.value);
                            if (found) {
                              setSelectedTier(found.suggestedTier);
                              setSelectedKind(found.kind || 'text');
                            }
                          }}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
                        >
                          {discoveredModels.map(m => (
                            <option key={m.id} value={m.name}>
                              {m.name} ({m.suggestedTier})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Manual Model Name</label>
                        <input
                          type="text"
                          placeholder="e.g. gemini-2.5-flash"
                          value={manualModelName}
                          onChange={(e) => setManualModelName(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Tier Assignment</label>
                      <select
                        value={selectedTier}
                        onChange={(e: any) => setSelectedTier(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="fast">Fast (nano / mini / haiku)</option>
                        <option value="balanced">Balanced (flash / sonnet)</option>
                        <option value="strong">Strong (pro / opus / ultra)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Kind</label>
                      <select
                        value={selectedKind}
                        onChange={(e: any) => setSelectedKind(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="text">Text model</option>
                        <option value="image">Image generation model</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Priority (1 = highest)</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={selectedPriority}
                        onChange={(e) => setSelectedPriority(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Roles to Assign</label>
                      <div className="flex flex-wrap gap-2">
                        {['planning', 'code', 'ui', 'images', 'review'].map((role) => (
                          <button
                            type="button"
                            key={role}
                            onClick={() => toggleRole(role)}
                            className={`px-2.5 py-1 rounded text-xs font-mono transition-all border ${
                              selectedRoles.includes(role)
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-zinc-700'
                            }`}
                          >
                            {selectedRoles.includes(role) ? '✓ ' : ''}{role}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleAddModel}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Save Model to Registry
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Column 3: Test Chat & Test Image Panel (Stage 1 & Stage 4B) */}
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setTestTab('chat')}
                      className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                        testTab === 'chat'
                          ? 'bg-zinc-800 text-zinc-100 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Send className="w-3 h-3 text-emerald-400" />
                      Test Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestTab('image')}
                      className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                        testTab === 'image'
                          ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/30'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <ImageIcon className="w-3 h-3 text-emerald-400" />
                      Test Image
                    </button>
                  </div>
                </div>

                {models.length === 0 ? (
                  <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded text-center text-xs text-zinc-400">
                    No models added yet. Test connection and add at least one model to use Test Chat/Image.
                  </div>
                ) : testTab === 'chat' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Target Model</label>
                      <select
                        value={testModelId}
                        onChange={(e) => setTestModelId(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.modelName} ({m.tier})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Message</label>
                      <textarea
                        rows={2}
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      onClick={handleRunTestChat}
                      disabled={testingChat || !testModelId}
                      className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs font-medium flex items-center justify-center gap-1.5 border border-zinc-700"
                    >
                      {testingChat ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Send className="w-3.5 h-3.5" />}
                      Send Test Prompt
                    </button>

                    {testChatResult && (
                      <div className={`p-3 rounded text-xs border ${
                        testChatResult.ok
                          ? 'bg-zinc-950/80 border-emerald-900/60 text-zinc-300'
                          : 'bg-red-950/30 border-red-900/60 text-red-300'
                      }`}>
                        <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono">
                          <span className={testChatResult.ok ? 'text-emerald-400' : 'text-red-400'}>
                            {testChatResult.ok ? '✓ 200 OK' : `✗ Error (${testChatResult.error?.type || 'unknown'})`}
                          </span>
                          {testChatResult.durationMs && (
                            <span className="text-zinc-500">{testChatResult.durationMs}ms</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap font-sans text-xs">
                          {testChatResult.ok ? testChatResult.text : testChatResult.error?.message}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Target Image Model</label>
                      <select
                        value={testImageModelId}
                        onChange={(e) => setTestImageModelId(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
                      >
                        {models.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.modelName} ({m.kind})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Image Prompt</label>
                      <textarea
                        rows={2}
                        value={testImagePrompt}
                        onChange={(e) => setTestImagePrompt(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      onClick={handleRunTestImage}
                      disabled={testingImage || !testImageModelId}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      {testingImage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      Generate Test Image
                    </button>

                    {testImageResult && (
                      <div className={`p-3 rounded text-xs border ${
                        testImageResult.ok
                          ? 'bg-zinc-950/80 border-emerald-900/60 text-zinc-300'
                          : 'bg-red-950/30 border-red-900/60 text-red-300'
                      }`}>
                        <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono">
                          <span className={testImageResult.ok ? 'text-emerald-400' : 'text-red-400'}>
                            {testImageResult.ok ? '✓ Generated Image' : `✗ Error (${testImageResult.error?.type || 'unknown'})`}
                          </span>
                          {testImageResult.durationMs && (
                            <span className="text-zinc-500">{testImageResult.durationMs}ms</span>
                          )}
                        </div>
                        {testImageResult.ok && testImageResult.imageBase64 ? (
                          <div className="mt-2 text-center">
                            <img
                              src={`data:${testImageResult.mimeType || 'image/png'};base64,${testImageResult.imageBase64}`}
                              alt="Test output"
                              className="w-full max-h-48 object-contain rounded border border-zinc-800 mx-auto"
                            />
                          </div>
                        ) : (
                          <p className="text-red-400 text-xs">{testImageResult.error?.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Providers & Multi-Key Cards (Stage 6B) */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg overflow-hidden p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              Configured Providers & Keys (Stage 6B Multi-Key)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map((prov) => (
                <div key={prov.id} className="p-4 bg-zinc-950 border border-zinc-800 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-zinc-200 text-xs">{prov.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono block">Type: {prov.type}</span>
                    </div>
                    <button
                      onClick={() => setAddingKeyProviderId(addingKeyProviderId === prov.id ? null : prov.id)}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] font-mono flex items-center gap-1 border border-zinc-700"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" />
                      Add Key
                    </button>
                  </div>

                  {/* Keys list */}
                  <div className="space-y-1.5 pt-1">
                    {prov.keys?.map((k) => (
                      <div key={k.id} className="flex items-center justify-between p-2 bg-zinc-900/70 border border-zinc-800/80 rounded text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-300 font-medium">{k.label}</span>
                          <span className="font-mono text-zinc-500 text-[11px]">{k.apiKey}</span>
                          <span className={`px-1 rounded text-[9px] font-mono ${
                            k.status === 'working' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' :
                            k.status === 'limit' ? 'bg-amber-950 text-amber-400 border border-amber-800/60' :
                            'bg-red-950 text-red-400 border border-red-800/60'
                          }`}>
                            {k.status}
                          </span>
                        </div>
                        {prov.keys && prov.keys.length > 1 && (
                          <button
                            onClick={() => handleDeleteKey(prov.id, k.id)}
                            className="text-zinc-500 hover:text-red-400 p-1"
                            title="Delete key"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Key inline form */}
                  {addingKeyProviderId === prov.id && (
                    <div className="p-3 bg-zinc-900 border border-emerald-500/40 rounded space-y-2 mt-2">
                      <span className="text-[11px] text-emerald-400 font-semibold block">Add New API Key</span>
                      <input
                        type="text"
                        placeholder="Key label (e.g. Backup Key)"
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                      />
                      <input
                        type="password"
                        placeholder="API Key"
                        value={newKeyValue}
                        onChange={(e) => setNewKeyValue(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-200"
                      />
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => setAddingKeyProviderId(null)}
                          className="px-2 py-1 bg-zinc-800 text-zinc-400 rounded text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddKey(prov.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
                        >
                          Save Key
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Models Table */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Configured Models ({models.length})</h2>
              <span className="text-xs text-zinc-500">Sorted by provider & priority</span>
            </div>

            {models.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No models in registry. Use the form above to connect a provider and add models.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/60 text-zinc-400 uppercase font-mono text-[10px] border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-2.5">Model Name</th>
                      <th className="px-4 py-2.5">Provider</th>
                      <th className="px-4 py-2.5">Key (Masked)</th>
                      <th className="px-4 py-2.5">Tier</th>
                      <th className="px-4 py-2.5">Kind</th>
                      <th className="px-4 py-2.5">Roles</th>
                      <th className="px-4 py-2.5">Priority</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-sans">
                    {models.map((m) => {
                      const prov = providers.find(p => p.id === m.providerId);
                      return (
                        <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3 font-mono font-medium text-zinc-200">{m.modelName}</td>
                          <td className="px-4 py-3 text-zinc-400">{prov?.name || m.providerId}</td>
                          <td className="px-4 py-3 font-mono text-zinc-400">{prov?.apiKey || '****'}</td>
                          <td className="px-4 py-3">
                            <TierBadge tier={m.tier} />
                          </td>
                          <td className="px-4 py-3 text-zinc-400 capitalize">{m.kind}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {m.roles.map(r => (
                                <span key={r} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono border border-zinc-700/60">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-300">{m.priority}</td>
                          <td className="px-4 py-3">
                            <StatusBadge status={m.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleDeleteModel(m.id)}
                              className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800 transition-colors"
                              title="Delete model"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Logs Table (Rule 6.6 & 6.13: callers, duration, error types, NEVER keys) */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Recent Request Audit Log (log.json)</h2>
              <span className="text-[11px] text-zinc-500">Keys masked & stripped</span>
            </div>
            {logs.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                No logged requests yet. Try sending a test chat or prompt.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-zinc-950/60 text-zinc-400 text-[10px] uppercase border-b border-zinc-800 sticky top-0">
                    <tr>
                      <th className="px-4 py-2">Timestamp</th>
                      <th className="px-4 py-2">Caller</th>
                      <th className="px-4 py-2">Target Model</th>
                      <th className="px-4 py-2">Key Label</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Duration</th>
                      <th className="px-4 py-2">Error Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-[11px]">
                    {logs.map((log, idx) => (
                      <tr key={idx} className="hover:bg-zinc-800/20">
                        <td className="px-4 py-1.5 text-zinc-500">{new Date(log.time).toLocaleTimeString()}</td>
                        <td className="px-4 py-1.5 text-emerald-400 font-semibold">{log.caller}</td>
                        <td className="px-4 py-1.5 text-zinc-300">{log.targetModelId}</td>
                        <td className="px-4 py-1.5 text-zinc-400">{log.keyLabel || 'Key 1'}</td>
                        <td className="px-4 py-1.5">
                          <span className={`px-1 rounded text-[10px] ${
                            log.status === 'ok' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-zinc-400">{log.durationMs}ms</td>
                        <td className="px-4 py-1.5 text-amber-400">{log.errorType || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
