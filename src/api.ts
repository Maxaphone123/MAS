import {
  RegistryResponse,
  DiscoveredModel,
  ChatMessage,
  PlansIndex,
  PlanMeta,
  LogEntry,
  BranchState,
  DirectivePreviewResult,
  ProjectFileMeta,
  CanvasDataResponse,
  RouterStateData,
  RouterConfig,
  AuditReport,
  AppNotification,
  TelegramConfig,
  PluginItem,
  AuthStatus
} from './types';

function getStoredToken(): string | null {
  return localStorage.getItem('orchestrator_token');
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem('orchestrator_token', token);
  } else {
    localStorage.removeItem('orchestrator_token');
  }
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}



export const api = {
  async getHealth(): Promise<{ status: string; stage: string }> {
    const res = await fetch('/api/health');
    return res.json();
  },

  async getRegistry(): Promise<RegistryResponse> {
    const res = await authFetch('/api/registry');
    return res.json();
  },

  async addProvider(provider: { type: string; name: string; apiKey: string; baseUrl?: string }): Promise<{ ok: boolean; providerId: string }> {
    const res = await authFetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(provider)
    });
    return res.json();
  },

  async deleteProvider(id: string): Promise<{ ok: boolean }> {
    const res = await authFetch(`/api/providers/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async testConnection(providerType: string, apiKey: string, baseUrl?: string): Promise<{ ok: boolean; models?: DiscoveredModel[]; error?: { type: string; message: string } }> {
    const res = await authFetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerType, apiKey, baseUrl })
    });
    return res.json();
  },

  async addModel(model: {
    providerId: string;
    modelName: string;
    kind: 'text' | 'image';
    roles: string[];
    priority: number;
    tier: 'fast' | 'balanced' | 'strong';
  }): Promise<{ ok: boolean; model: any }> {
    const res = await authFetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(model)
    });
    return res.json();
  },

  async updateModel(id: string, updates: any): Promise<{ ok: boolean }> {
    const res = await authFetch(`/api/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return res.json();
  },

  async deleteModel(id: string): Promise<{ ok: boolean }> {
    const res = await authFetch(`/api/models/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async testChat(modelId: string, message: string): Promise<{ ok: boolean; text?: string; error?: { type: string; message: string }; durationMs: number }> {
    const res = await authFetch('/api/chat/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, message })
    });
    return res.json();
  },

  async getLogs(): Promise<LogEntry[]> {
    const res = await authFetch('/api/logs');
    return res.json();
  },

  async getOrchestratorChat(): Promise<ChatMessage[]> {
    const res = await authFetch('/api/orchestrator/chat');
    return res.json();
  },

  async sendOrchestratorMessage(message: string): Promise<{ ok: boolean; message?: ChatMessage; error?: string }> {
    const res = await authFetch('/api/orchestrator/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    return res.json();
  },

  async clearOrchestratorChat(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/orchestrator/clear', { method: 'POST' });
    return res.json();
  },

  async getPlans(): Promise<PlansIndex> {
    const res = await authFetch('/api/plans');
    return res.json();
  },

  async getCurrentPlan(): Promise<{ currentVersion: number; meta: PlanMeta | null; content: string | null }> {
    const res = await authFetch('/api/plans/current');
    return res.json();
  },

  async getPlanVersion(version: number): Promise<{ meta: PlanMeta; content: string }> {
    const res = await authFetch(`/api/plans/${version}`);
    return res.json();
  },

  async editPlan(content: string, note?: string): Promise<{ ok: boolean; meta?: PlanMeta; errors?: string[] }> {
    const res = await authFetch('/api/plans/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, note })
    });
    return res.json();
  },

  async uploadPlan(content: string): Promise<{ ok: boolean; meta?: PlanMeta; errors?: string[] }> {
    const res = await authFetch('/api/plans/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    return res.json();
  },

  async restorePlan(version: number): Promise<{ ok: boolean; meta?: PlanMeta; errors?: string[] }> {
    const res = await authFetch(`/api/plans/${version}/restore`, { method: 'POST' });
    return res.json();
  },

  async generatePlan(): Promise<{ ok: boolean; meta?: PlanMeta; content?: string; error?: string; validationErrors?: string[] }> {
    const res = await authFetch('/api/plan/generate', { method: 'POST' });
    return res.json();
  },

  async getBranches(): Promise<BranchState[]> {
    const res = await authFetch('/api/branches');
    return res.json();
  },

  async getBranch(slug: string): Promise<{ state: BranchState; outputs: Record<number, string> }> {
    const res = await authFetch(`/api/branches/${slug}`);
    return res.json();
  },

  async runNextStep(slug: string): Promise<{ ok: boolean; branchState: BranchState | null; stepNumber?: number; status?: string; error?: string }> {
    const res = await authFetch(`/api/branches/${slug}/run-next`, { method: 'POST' });
    return res.json();
  },

  async runBranch(slug: string): Promise<{ ok: boolean; state: BranchState }> {
    const res = await authFetch(`/api/branches/${slug}/run-branch`, { method: 'POST' });
    return res.json();
  },

  async runAllBranches(): Promise<{ ok: boolean; states: BranchState[] }> {
    const res = await authFetch('/api/branches/run-all', { method: 'POST' });
    return res.json();
  },

  async stopRunners(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/branches/stop', { method: 'POST' });
    return res.json();
  },

  async getRunnerStatus(): Promise<{ isRunning: boolean }> {
    const res = await authFetch('/api/branches-runner/status');
    return res.json();
  },

  async previewDirective(selectedBranches: string[], instruction: string): Promise<DirectivePreviewResult> {
    const res = await authFetch('/api/directive/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBranches, instruction })
    });
    return res.json();
  },

  async confirmDirective(newMarkdown: string, instruction: string): Promise<{ ok: boolean; version?: number; error?: string }> {
    const res = await authFetch('/api/directive/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newMarkdown, instruction })
    });
    return res.json();
  },

  async getProjectFiles(): Promise<Record<string, ProjectFileMeta>> {
    const res = await authFetch('/api/project/files');
    return res.json();
  },

  async getProjectFileContent(path: string): Promise<{ content?: string }> {
    const res = await authFetch(`/api/project/file?path=${encodeURIComponent(path)}`);
    return res.json();
  },

  async clearProject(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/project/clear', { method: 'POST' });
    return res.json();
  },

  async testImage(modelId: string, prompt: string): Promise<{ ok: boolean; imageBase64?: string; mimeType?: string; error?: any; durationMs?: number }> {
    const res = await authFetch('/api/image/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, prompt })
    });
    return res.json();
  },

  async getCanvasData(): Promise<CanvasDataResponse> {
    const res = await authFetch('/api/canvas');
    return res.json();
  },

  async saveCanvasPositions(positions: Record<string, { x: number; y: number }>): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/canvas/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions })
    });
    return res.json();
  },

  async assignCanvasSlot(params: { targetType: string; targetSlug?: string; modelId: string; role?: string }): Promise<{ ok: boolean; model: any }> {
    const res = await authFetch('/api/canvas/assign-slot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    return res.json();
  },

  // Multi-Key operations (Stage 6B)
  async addProviderKey(providerId: string, apiKey: string, label?: string): Promise<{ ok: boolean; key: any }> {
    const res = await authFetch(`/api/providers/${providerId}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, label })
    });
    return res.json();
  },

  async updateProviderKey(providerId: string, keyId: string, updates: { label?: string; status?: string; apiKey?: string }): Promise<{ ok: boolean; key: any }> {
    const res = await authFetch(`/api/providers/${providerId}/keys/${keyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    return res.json();
  },

  async deleteProviderKey(providerId: string, keyId: string): Promise<{ ok: boolean }> {
    const res = await authFetch(`/api/providers/${providerId}/keys/${keyId}`, { method: 'DELETE' });
    return res.json();
  },

  // Router Config & Testing Aids (Stage 6A/6B)
  async getRouterState(): Promise<RouterStateData> {
    const res = await authFetch('/api/router/state');
    return res.json();
  },

  async updateRouterConfig(config: Partial<RouterConfig>): Promise<{ ok: boolean; config: RouterConfig }> {
    const res = await authFetch('/api/router/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return res.json();
  },

  async clearCooldown(key?: string): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/router/clear-cooldown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    return res.json();
  },

  async forceFailure(modelId: string, errorType: string): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/router/force-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, errorType })
    });
    return res.json();
  },

  async toggleSimulatedOutage(providerId: string, errorType?: string): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/router/simulated-outage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, errorType })
    });
    return res.json();
  },

  async forceReviewFail(count: number): Promise<{ ok: boolean; forceReviewFailCount: number }> {
    const res = await authFetch('/api/router/force-review-fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    return res.json();
  },

  async clearTestingAids(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/router/clear-testing-aids', { method: 'POST' });
    return res.json();
  },

  // Project Review & Audit (Stage 7B)
  async getProjectAudit(): Promise<AuditReport> {
    const res = await authFetch('/api/project/audit');
    return res.json();
  },

  async applyAuditDirective(branch: string, suggestion: string): Promise<{ ok: boolean; version?: number; error?: string }> {
    const res = await authFetch('/api/project/apply-audit-directive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, suggestion })
    });
    return res.json();
  },

  // Notifications (Stage 8A)
  async getNotifications(): Promise<AppNotification[]> {
    const res = await authFetch('/api/notifications');
    return res.json();
  },

  async markAllNotificationsRead(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/notifications/read', { method: 'POST' });
    return res.json();
  },

  async clearNotifications(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/notifications/clear', { method: 'POST' });
    return res.json();
  },

  // Telegram Messenger Bot (Stage 8B)
  async getTelegramConfig(): Promise<TelegramConfig> {
    const res = await authFetch('/api/telegram/config');
    return res.json();
  },

  async saveTelegramConfig(cfg: Partial<TelegramConfig>): Promise<{ ok: boolean; config: TelegramConfig }> {
    const res = await authFetch('/api/telegram/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    return res.json();
  },

  async testTelegramMessage(): Promise<{ ok: boolean; error?: string }> {
    const res = await authFetch('/api/telegram/test', { method: 'POST' });
    return res.json();
  },

  // Instruction Packs / Plugins (Stage 8C)
  async getPlugins(): Promise<PluginItem[]> {
    const res = await authFetch('/api/plugins');
    return res.json();
  },

  async addPlugin(plugin: { name: string; description: string; targetRoles: string[]; instructions: string }): Promise<{ ok: boolean; plugin?: PluginItem; error?: string }> {
    const res = await authFetch('/api/plugins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plugin)
    });
    return res.json();
  },

  async togglePlugin(id: string): Promise<{ ok: boolean; plugin?: PluginItem }> {
    const res = await authFetch(`/api/plugins/${id}/toggle`, { method: 'POST' });
    return res.json();
  },

  async deletePlugin(id: string): Promise<{ ok: boolean; error?: string }> {
    const res = await authFetch(`/api/plugins/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Authentication & Hardening (Stage 9A)
  async getAuthStatus(): Promise<AuthStatus> {
    const res = await authFetch('/api/auth/status');
    return res.json();
  },

  async login(password: string): Promise<{ ok: boolean; token?: string; error?: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.ok && data.token) {
      setStoredToken(data.token);
    }
    return data;
  },

  async setupAuth(password: string): Promise<{ ok: boolean; error?: string }> {
    const res = await authFetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    return res.json();
  },

  async disableAuth(): Promise<{ ok: boolean }> {
    const res = await authFetch('/api/auth/disable', { method: 'POST' });
    setStoredToken(null);
    return res.json();
  },

  async logout(): Promise<{ ok: boolean }> {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setStoredToken(null);
    return { ok: true };
  },

  // Backup & Restore (Stage 9A)
  async restoreBackup(file: File): Promise<{ ok: boolean; restoredFilesCount?: number; error?: string }> {
    const res = await authFetch('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: file
    });
    return res.json();
  }
};



