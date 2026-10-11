import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PLANS_DIR = path.join(DATA_DIR, 'plans');

export interface ProviderKey {
  id: string;
  label: string;
  apiKey: string;
  status: 'working' | 'limit' | 'invalid';
  note?: string;
}

export interface ProviderRecord {
  id: string;
  type: 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
  name: string;
  baseUrl?: string;
  apiKey?: string; // Legacy/convenience key
  keys?: ProviderKey[];
}

export interface ModelRecord {
  id: string;
  providerId: string;
  modelName: string;
  kind: 'text' | 'image';
  roles: Array<'planning' | 'code' | 'ui' | 'images' | 'review'>;
  priority: number;
  tier: 'fast' | 'balanced' | 'strong';
  status: 'unknown' | 'working' | 'error' | 'limit';
}

export interface RegistryData {
  providers: ProviderRecord[];
  models: ModelRecord[];
}

export interface LogEntry {
  time: string;
  caller: string;
  targetModelId: string;
  keyLabel?: string;
  status: 'running' | 'ok' | 'error' | 'timeout';
  errorType?: string;
  durationMs: number;
  routing?: {
    reason: string;
    chosenModel?: string;
  };
  simulated?: boolean;
}

export interface ExchangeEntry {
  id: string;
  time: string;
  caller: string;
  targetModelId: string;
  prompt: string;
  response: string;
  ok: boolean;
  errorType?: string;
  durationMs: number;
  tokens?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface PlanMeta {
  version: number;
  time: string;
  source: 'generated' | 'edited' | 'uploaded' | 'restored' | 'directive';
  note?: string;
  filePath: string;
}

export interface PlansIndex {
  currentVersion: number;
  versions: PlanMeta[];
}

// Ensure all data directories exist
export function initStorage() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PLANS_DIR)) fs.mkdirSync(PLANS_DIR, { recursive: true });

  const registryFile = path.join(DATA_DIR, 'registry.json');
  if (!fs.existsSync(registryFile)) {
    const initialRegistry: RegistryData = { providers: [], models: [] };
    fs.writeFileSync(registryFile, JSON.stringify(initialRegistry, null, 2), 'utf8');
  }

  const logFile = path.join(DATA_DIR, 'log.json');
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, JSON.stringify([], null, 2), 'utf8');
  }

  const exchangesFile = path.join(DATA_DIR, 'exchanges.json');
  if (!fs.existsSync(exchangesFile)) {
    fs.writeFileSync(exchangesFile, JSON.stringify([], null, 2), 'utf8');
  }

  const chatFile = path.join(DATA_DIR, 'chat.json');
  if (!fs.existsSync(chatFile)) {
    fs.writeFileSync(chatFile, JSON.stringify([], null, 2), 'utf8');
  }

  const plansIndexFile = path.join(PLANS_DIR, 'index.json');
  if (!fs.existsSync(plansIndexFile)) {
    const initialIndex: PlansIndex = { currentVersion: 0, versions: [] };
    fs.writeFileSync(plansIndexFile, JSON.stringify(initialIndex, null, 2), 'utf8');
  }
}

// Registry operations (with Stage 6B multi-key migration)
export function getRegistry(): RegistryData {
  initStorage();
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'registry.json'), 'utf8');
    const data: RegistryData = JSON.parse(raw);
    let migrated = false;

    for (const p of data.providers) {
      if (!p.keys || p.keys.length === 0) {
        p.keys = [{
          id: 'key-1',
          label: 'Key 1',
          apiKey: p.apiKey || '',
          status: 'working'
        }];
        migrated = true;
      }
    }

    if (migrated) {
      saveRegistry(data);
    }
    return data;
  } catch {
    return { providers: [], models: [] };
  }
}

export function saveRegistry(data: RegistryData) {
  initStorage();
  fs.writeFileSync(path.join(DATA_DIR, 'registry.json'), JSON.stringify(data, null, 2), 'utf8');
}


// Return registry with masked API keys for UI
export function getMaskedRegistry() {
  const reg = getRegistry();
  const maskedProviders = reg.providers.map(p => {
    const key = p.apiKey || '';
    const maskedKey = key.length > 4 ? `****${key.slice(-4)}` : (key ? '****' : '');
    const maskedKeys = p.keys?.map(k => ({
      ...k,
      apiKey: k.apiKey.length > 4 ? `****${k.apiKey.slice(-4)}` : '****'
    }));
    return {
      ...p,
      apiKey: maskedKey,
      keys: maskedKeys
    };
  });
  return {
    providers: maskedProviders,
    models: reg.models
  };
}

// Logging operations (NEVER contains api keys)
export function addLog(entry: LogEntry) {
  initStorage();
  try {
    const file = path.join(DATA_DIR, 'log.json');
    const logs: LogEntry[] = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
    logs.unshift(entry);
    // keep last 500 logs
    fs.writeFileSync(file, JSON.stringify(logs.slice(0, 500), null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to append log:', err);
  }
}

export function getLogs(): LogEntry[] {
  initStorage();
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'log.json'), 'utf8') || '[]');
  } catch {
    return [];
  }
}

// Exchanges operations (max 300, truncated prompt & response, never keys)
export function addExchange(entry: ExchangeEntry) {
  initStorage();
  try {
    const file = path.join(DATA_DIR, 'exchanges.json');
    const list: ExchangeEntry[] = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
    const sanitizedEntry = {
      ...entry,
      prompt: entry.prompt.slice(0, 4000),
      response: entry.response.slice(0, 4000)
    };
    list.unshift(sanitizedEntry);
    fs.writeFileSync(file, JSON.stringify(list.slice(0, 300), null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to append exchange:', err);
  }
}

export function getExchanges(): ExchangeEntry[] {
  initStorage();
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'exchanges.json'), 'utf8') || '[]');
  } catch {
    return [];
  }
}

// Chat operations
export function getChat(): ChatMessage[] {
  initStorage();
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'chat.json'), 'utf8') || '[]');
  } catch {
    return [];
  }
}

export function saveChat(messages: ChatMessage[]) {
  initStorage();
  fs.writeFileSync(path.join(DATA_DIR, 'chat.json'), JSON.stringify(messages, null, 2), 'utf8');
}

// Plans operations
export function getPlansIndex(): PlansIndex {
  initStorage();
  try {
    const file = path.join(PLANS_DIR, 'index.json');
    return JSON.parse(fs.readFileSync(file, 'utf8') || '{"currentVersion":0,"versions":[]}');
  } catch {
    return { currentVersion: 0, versions: [] };
  }
}

export function savePlansIndex(index: PlansIndex) {
  initStorage();
  fs.writeFileSync(path.join(PLANS_DIR, 'index.json'), JSON.stringify(index, null, 2), 'utf8');
}

export function getPlanContent(version: number): string | null {
  initStorage();
  const filePath = path.join(PLANS_DIR, `plan-v${version}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

export function savePlanVersion(content: string, source: PlanMeta['source'], note?: string): PlanMeta {
  initStorage();
  const index = getPlansIndex();
  const nextVersion = (index.currentVersion || 0) + 1;
  const fileName = `plan-v${nextVersion}.md`;
  const filePath = path.join(PLANS_DIR, fileName);

  fs.writeFileSync(filePath, content, 'utf8');

  const meta: PlanMeta = {
    version: nextVersion,
    time: new Date().toISOString(),
    source,
    note: note || `Plan v${nextVersion} (${source})`,
    filePath: fileName
  };

  index.currentVersion = nextVersion;
  index.versions.unshift(meta);
  savePlansIndex(index);

  return meta;
}

// ==========================================
// Branches Storage (Stage 3A)
// ==========================================

export const BRANCHES_DIR = path.join(DATA_DIR, 'branches');

export interface BranchStepAttempt {
  model: string;
  errorType?: string;
  time: string;
  simulated?: boolean;
}

export interface BranchStepState {
  n: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  complexity: 'low' | 'medium' | 'high';
  type: 'code' | 'ui' | 'image' | 'text' | 'other';
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  resultPath?: string;
  blockedReason?: string;
  attempts: BranchStepAttempt[];
  modelUsed?: string;
  finishedAt?: string;
  review?: any;
}

export interface BranchState {
  slug: string;
  name: string;
  role: 'code' | 'ui' | 'images' | 'text' | 'other';
  branchGoal: string;
  planVersion: number;
  currentStep: number;
  steps: BranchStepState[];
  decisions: string[];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'branch';
}

export function getBranchDir(slug: string): string {
  const dir = path.join(BRANCHES_DIR, slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outputsDir = path.join(dir, 'outputs');
  if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
  return dir;
}

export function getBranchState(slug: string): BranchState | null {
  initStorage();
  const file = path.join(BRANCHES_DIR, slug, 'state.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function saveBranchState(slug: string, state: BranchState): void {
  const dir = getBranchDir(slug);
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
}

export function saveStepOutput(slug: string, stepNum: number, content: string): string {
  const dir = getBranchDir(slug);
  const fileName = `step-${stepNum}.md`;
  const filePath = path.join(dir, 'outputs', fileName);
  fs.writeFileSync(filePath, content, 'utf8');
  return `outputs/${fileName}`;
}

export function getStepOutput(slug: string, stepNum: number): string | null {
  const filePath = path.join(BRANCHES_DIR, slug, 'outputs', `step-${stepNum}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

export function getAllBranchStates(): BranchState[] {
  initStorage();
  if (!fs.existsSync(BRANCHES_DIR)) return [];
  const entries = fs.readdirSync(BRANCHES_DIR, { withFileTypes: true });
  const list: BranchState[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const state = getBranchState(entry.name);
      if (state) list.push(state);
    }
  }
  return list;
}

// ==========================================
// Project Assembly & Files (Stage 4A)
// ==========================================

export const PROJECT_DIR = path.join(DATA_DIR, 'project', 'current');
export const ASSETS_DIR = path.join(PROJECT_DIR, 'assets');
export const PROJECT_META_FILE = path.join(DATA_DIR, 'project', 'files.json');
export const CANVAS_FILE = path.join(DATA_DIR, 'canvas.json');
export const CHANGES_FILE = path.join(DATA_DIR, 'changes.json');

export interface ProjectFileMeta {
  path: string;
  ownerBranch: string;
  step: number;
  time: string;
  size: number;
  isImage?: boolean;
}

export function initProjectStorage() {
  if (!fs.existsSync(PROJECT_DIR)) fs.mkdirSync(PROJECT_DIR, { recursive: true });
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
  if (!fs.existsSync(PROJECT_META_FILE)) {
    fs.writeFileSync(PROJECT_META_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
  if (!fs.existsSync(CANVAS_FILE)) {
    fs.writeFileSync(CANVAS_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
  if (!fs.existsSync(CHANGES_FILE)) {
    fs.writeFileSync(CHANGES_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

export function getProjectFilesMap(): Record<string, ProjectFileMeta> {
  initProjectStorage();
  try {
    return JSON.parse(fs.readFileSync(PROJECT_META_FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

export function saveProjectFileMeta(map: Record<string, ProjectFileMeta>) {
  initProjectStorage();
  fs.writeFileSync(PROJECT_META_FILE, JSON.stringify(map, null, 2), 'utf8');
}

export function saveProjectFile(
  relPath: string,
  content: string | Buffer,
  ownerBranch: string,
  step: number
): { ok: boolean; conflict?: string } {
  initProjectStorage();

  // Sanitize path (Rule 6.7: relative paths, no '..', no absolute)
  const normalized = relPath.replace(/^(\.\/|\/)+/, '').replace(/\\/g, '/');
  if (normalized.includes('..')) {
    return { ok: false, conflict: 'Invalid relative path containing ".."' };
  }

  const map = getProjectFilesMap();
  const existing = map[normalized];

  // Ownership check: If file exists and belongs to another branch -> Conflict!
  if (existing && existing.ownerBranch !== ownerBranch) {
    return {
      ok: false,
      conflict: `file conflict: ${normalized} is owned by ${existing.ownerBranch}`
    };
  }

  const fullPath = path.join(PROJECT_DIR, normalized);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(fullPath, content);
  } else {
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  const stat = fs.statSync(fullPath);
  const isImage = normalized.startsWith('assets/') || /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(normalized);

  map[normalized] = {
    path: normalized,
    ownerBranch,
    step,
    time: new Date().toISOString(),
    size: stat.size,
    isImage
  };

  saveProjectFileMeta(map);
  return { ok: true };
}

export function getProjectFileContent(relPath: string): { exists: boolean; content?: string; isBinary?: boolean; buffer?: Buffer } {
  initProjectStorage();
  const normalized = relPath.replace(/^(\.\/|\/)+/, '').replace(/\\/g, '/');
  const fullPath = path.join(PROJECT_DIR, normalized);
  if (!fs.existsSync(fullPath)) return { exists: false };

  const isImage = normalized.startsWith('assets/') || /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(normalized);
  if (isImage) {
    const buffer = fs.readFileSync(fullPath);
    return { exists: true, isBinary: true, buffer };
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  return { exists: true, isBinary: false, content };
}

export function clearProjectDirectory() {
  initProjectStorage();
  try {
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
    fs.mkdirSync(PROJECT_DIR, { recursive: true });
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    fs.writeFileSync(PROJECT_META_FILE, JSON.stringify({}, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to clear project directory:', err);
  }
}

// Canvas & Changes Storage (Stage 5A/5B)
export function getCanvasPositions(): Record<string, { x: number; y: number }> {
  initProjectStorage();
  try {
    return JSON.parse(fs.readFileSync(CANVAS_FILE, 'utf8') || '{}');
  } catch {
    return {};
  }
}

export function saveCanvasPositions(positions: Record<string, { x: number; y: number }>) {
  initProjectStorage();
  fs.writeFileSync(CANVAS_FILE, JSON.stringify(positions, null, 2), 'utf8');
}

export function logRegistryChange(change: { action: string; targetId: string; role?: string; modelName?: string; time: string }) {
  initProjectStorage();
  try {
    const list = JSON.parse(fs.readFileSync(CHANGES_FILE, 'utf8') || '[]');
    list.unshift(change);
    fs.writeFileSync(CHANGES_FILE, JSON.stringify(list.slice(0, 100), null, 2), 'utf8');
  } catch {}
}

// Delete files created by a specific branch and step before rework (Rule 7.8)
export function deleteProjectFilesByStep(ownerBranch: string, stepNumber: number) {
  initProjectStorage();
  const map = getProjectFilesMap();
  const updatedMap: Record<string, ProjectFileMeta> = {};

  for (const [relPath, meta] of Object.entries(map)) {
    if (meta.ownerBranch === ownerBranch && meta.step === stepNumber) {
      const fullPath = path.join(PROJECT_DIR, relPath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch {}
      }
    } else {
      updatedMap[relPath] = meta;
    }
  }

  saveProjectFileMeta(updatedMap);
}

// ==========================================
// Router Config & State Storage (Stage 6A/6B)
// ==========================================

export const ROUTER_CONFIG_FILE = path.join(DATA_DIR, 'router-config.json');
export const ROUTER_STATE_FILE = path.join(DATA_DIR, 'router-state.json');

export interface RouterConfig {
  limitCooldownMin: number;
  notFoundCooldownMin: number;
  maxSwitchesPerStep: number;
  maxReworksPerStep: number;
  allowOtherProvidersForPlanning: boolean;
  allowRunningGeneratedCode?: boolean; // User choice 18 from questionnaire
}

export interface RouterState {
  cooldowns: Record<string, number>; // key: `${modelId}:${keyId}`, value: timestamp ms
  forceFailures: Record<string, string>; // modelId -> errorType
  simulatedOutages: Record<string, string>; // providerId -> errorType
  forceReviewFailCount: number; // 0 to 3
}

export function getRouterConfig(): RouterConfig {
  initStorage();
  const defaultCfg: RouterConfig = {
    limitCooldownMin: 10,
    notFoundCooldownMin: 60,
    maxSwitchesPerStep: 5,
    maxReworksPerStep: 2,
    allowOtherProvidersForPlanning: false,
    allowRunningGeneratedCode: true
  };
  if (!fs.existsSync(ROUTER_CONFIG_FILE)) {
    fs.writeFileSync(ROUTER_CONFIG_FILE, JSON.stringify(defaultCfg, null, 2), 'utf8');
    return defaultCfg;
  }
  try {
    return { ...defaultCfg, ...JSON.parse(fs.readFileSync(ROUTER_CONFIG_FILE, 'utf8')) };
  } catch {
    return defaultCfg;
  }
}

export function saveRouterConfig(cfg: RouterConfig) {
  initStorage();
  fs.writeFileSync(ROUTER_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

export function getRouterState(): RouterState {
  initStorage();
  const defaultState: RouterState = {
    cooldowns: {},
    forceFailures: {},
    simulatedOutages: {},
    forceReviewFailCount: 0
  };
  if (!fs.existsSync(ROUTER_STATE_FILE)) {
    fs.writeFileSync(ROUTER_STATE_FILE, JSON.stringify(defaultState, null, 2), 'utf8');
    return defaultState;
  }
  try {
    return { ...defaultState, ...JSON.parse(fs.readFileSync(ROUTER_STATE_FILE, 'utf8')) };
  } catch {
    return defaultState;
  }
}

export function saveRouterState(state: RouterState) {
  initStorage();
  fs.writeFileSync(ROUTER_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}



