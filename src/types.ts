export interface ProviderKey {
  id: string;
  label: string;
  apiKey: string;
  status: 'working' | 'limit' | 'invalid';
  note?: string;
}

export interface Provider {
  id: string;
  type: 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'custom';
  name: string;
  baseUrl?: string;
  apiKey: string; // masked
  keys?: ProviderKey[];
}

export interface Model {
  id: string;
  providerId: string;
  modelName: string;
  kind: 'text' | 'image';
  roles: Array<'planning' | 'code' | 'ui' | 'images' | 'review'>;
  priority: number;
  tier: 'fast' | 'balanced' | 'strong';
  status: 'unknown' | 'working' | 'error' | 'limit';
}

export interface RegistryResponse {
  providers: Provider[];
  models: Model[];
}

export interface DiscoveredModel {
  id: string;
  name: string;
  suggestedTier: 'fast' | 'balanced' | 'strong';
  kind: 'text' | 'image';
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

export interface DirectiveDiff {
  affectedBranches: string[];
  addedSteps: Array<{ branch: string; title: string }>;
  modifiedSteps: Array<{ branch: string; title: string }>;
  removedSteps: Array<{ branch: string; title: string }>;
  doneStepsToResetCount: number;
}

export interface DirectivePreviewResult {
  ok: boolean;
  diff?: DirectiveDiff;
  newMarkdown?: string;
  error?: string;
}

export interface ProjectFileMeta {
  path: string;
  ownerBranch: string;
  step: number;
  time: string;
  size: number;
  isImage?: boolean;
}

export interface CanvasDataResponse {
  nodes: any[];
  edges: any[];
  orchestratorModel: Model | null;
  branches: BranchState[];
  allModels: Model[];
}

export interface RouterConfig {
  limitCooldownMin: number;
  notFoundCooldownMin: number;
  maxSwitchesPerStep: number;
  maxReworksPerStep: number;
  allowOtherProvidersForPlanning: boolean;
  allowRunningGeneratedCode?: boolean;
}

export interface ActiveCooldown {
  key: string;
  modelName: string;
  keyLabel: string;
  expiresAt: string;
  secondsLeft: number;
}

export interface RouterStateData {
  config: RouterConfig;
  state: {
    cooldowns: Record<string, number>;
    forceFailures: Record<string, string>;
    simulatedOutages: Record<string, string>;
    forceReviewFailCount: number;
    activeCooldowns: ActiveCooldown[];
  };
}

export interface StaticProblem {
  file: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface AuditReport {
  timestamp: string;
  totalFiles: number;
  hasIndexHtml: boolean;
  score: number;
  passed: boolean;
  staticProblems: StaticProblem[];
  brokenReferences: Array<{ fromFile: string; referencedPath: string }>;
  syntaxProblems: Array<{ file: string; error: string }>;
  suggestedDirectives: Array<{ branch: string; suggestion: string }>;
  localRunChecks: {
    enabled: boolean;
    executedFiles: number;
    errors: Array<{ file: string; error: string }>;
  };
}

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnStepDone: boolean;
  notifyOnBlocked: boolean;
  notifyOnDirective: boolean;
  hasToken?: boolean;
}

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  targetRoles: Array<'planning' | 'code' | 'ui' | 'images' | 'review'>;
  instructions: string;
  enabled: boolean;
  isBuiltin: boolean;
}

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
}




