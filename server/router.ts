import {
  getRegistry,
  getRouterConfig,
  getRouterState,
  saveRouterState,
  addLog,
  addExchange,
  ModelRecord,
  ProviderRecord,
  ProviderKey
} from './storage.js';
import { generateText, NormalizedErrorType } from './adapters.js';

export interface RouteCandidate {
  model: ModelRecord;
  provider: ProviderRecord;
  key: ProviderKey;
  isOtherProvider: boolean;
}

export interface RouterCallParams {
  role: 'planning' | 'code' | 'ui' | 'images' | 'text' | 'other' | 'review';
  complexity: 'low' | 'medium' | 'high';
  branchName?: string;
  branchSlug?: string;
  autoModelSelection?: boolean; // default true
  allowOtherProviders?: boolean; // default false
  pinnedModelId?: string;
  systemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  caller: string;
}

export interface RouterCallResult {
  ok: boolean;
  text?: string;
  modelUsed?: string;
  modelId?: string;
  keyUsed?: string;
  routeSequence: string[];
  isProviderSwitch: boolean;
  attempts: Array<{ model: string; key: string; errorType?: string; time: string; simulated?: boolean }>;
  error?: { type: NormalizedErrorType; message: string };
  durationMs: number;
}

export async function callWithRouting(params: RouterCallParams): Promise<RouterCallResult> {
  const {
    role,
    complexity = 'medium',
    branchSlug,
    autoModelSelection = true,
    allowOtherProviders = false,
    pinnedModelId,
    systemPrompt,
    messages,
    caller
  } = params;

  const reg = getRegistry();
  const config = getRouterConfig();
  const routerState = getRouterState();
  const now = Date.now();

  // Clean expired cooldowns
  for (const [k, exp] of Object.entries(routerState.cooldowns)) {
    if (exp <= now) {
      delete routerState.cooldowns[k];
    }
  }

  // 1. Determine target tier based on complexity (Rule 7.7)
  const tierPreference: Array<'fast' | 'balanced' | 'strong'> =
    complexity === 'low'
      ? ['fast', 'balanced', 'strong']
      : complexity === 'high'
      ? ['strong', 'balanced', 'fast']
      : ['balanced', 'strong', 'fast'];

  // Helper to check if a (model, key) pair is on cooldown
  const isCandidateHealthy = (m: ModelRecord, k: ProviderKey) => {
    if (k.status === 'invalid') return false;
    const cooldownExp = routerState.cooldowns[`${m.id}:${k.id}`];
    if (cooldownExp && cooldownExp > now) return false;
    return true;
  };

  // Find models for this role
  let roleModels = reg.models.filter((m) => (m.roles as string[]).includes(role));
  if (roleModels.length === 0 && role !== 'planning') {
    // Fallback to planning role models
    roleModels = reg.models.filter((m) => m.roles.includes('planning'));
  }

  // Determine branch's assigned primary provider (from pinned model or top model)
  let primaryProviderId: string | undefined;
  if (pinnedModelId) {
    const pinned = reg.models.find((m) => m.id === pinnedModelId);
    if (pinned) primaryProviderId = pinned.providerId;
  }
  if (!primaryProviderId && roleModels.length > 0) {
    primaryProviderId = roleModels[0].providerId;
  }

  // If autoModelSelection is FALSE -> pinned model only (no switching)
  if (!autoModelSelection && pinnedModelId) {
    roleModels = roleModels.filter((m) => m.id === pinnedModelId);
  }

  // Sort models by tier preference, then priority
  roleModels.sort((a, b) => {
    const tierAIdx = tierPreference.indexOf(a.tier);
    const tierBIdx = tierPreference.indexOf(b.tier);
    if (tierAIdx !== tierBIdx) return tierAIdx - tierBIdx;
    return a.priority - b.priority;
  });

  // Separate primary provider models vs other provider models
  const primaryModels = roleModels.filter((m) => m.providerId === primaryProviderId);
  const otherModels = roleModels.filter((m) => m.providerId !== primaryProviderId);

  // Build candidate (model, key) list
  const candidates: RouteCandidate[] = [];

  // Add primary provider candidates
  for (const m of primaryModels) {
    const prov = reg.providers.find((p) => p.id === m.providerId);
    if (!prov || !prov.keys) continue;
    for (const k of prov.keys) {
      if (isCandidateHealthy(m, k)) {
        candidates.push({ model: m, provider: prov, key: k, isOtherProvider: false });
      }
    }
  }

  // If other providers allowed, append other provider candidates as last resort
  const isOtherAllowed = allowOtherProviders || (role === 'planning' && config.allowOtherProvidersForPlanning);
  if (isOtherAllowed && autoModelSelection) {
    for (const m of otherModels) {
      const prov = reg.providers.find((p) => p.id === m.providerId);
      if (!prov || !prov.keys) continue;
      for (const k of prov.keys) {
        if (isCandidateHealthy(m, k)) {
          candidates.push({ model: m, provider: prov, key: k, isOtherProvider: true });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      routeSequence: [],
      isProviderSwitch: false,
      attempts: [],
      error: {
        type: 'model_not_found',
        message: 'No healthy model and key candidates available for this task.'
      },
      durationMs: 0
    };
  }

  // Execute with failover
  const attempts: Array<{ model: string; key: string; errorType?: string; time: string; simulated?: boolean }> = [];
  const routeSequence: string[] = [];
  const maxSwitches = Math.min(config.maxSwitchesPerStep, candidates.length);

  let currentMessages = [...messages];

  for (let i = 0; i < maxSwitches; i++) {
    const cand = candidates[i];
    const candPairKey = `${cand.model.id}:${cand.key.id}`;
    routeSequence.push(`${cand.model.modelName} [${cand.key.label}]${cand.isOtherProvider ? ' (provider-switch)' : ''}`);

    // If previous attempt failed, inject Handoff note (Rule 7.7)
    if (attempts.length > 0) {
      const lastAtt = attempts[attempts.length - 1];
      const handoffNote = `Handoff: previous model(s) could not finish this step: ${lastAtt.model} (${lastAtt.errorType || 'error'}). Do the step from scratch, in exactly the same style, strictly following the decisions log and previous outputs. Do not mention this handoff in the result.`;
      currentMessages = [
        ...messages,
        { role: 'user', content: handoffNote }
      ];
    }

    // Check Testing Aids: Forced Failure or Simulated Outage (Rule 6.14)
    let simulatedError: NormalizedErrorType | null = null;
    if (routerState.forceFailures[cand.model.id]) {
      simulatedError = routerState.forceFailures[cand.model.id] as NormalizedErrorType;
      delete routerState.forceFailures[cand.model.id]; // consumed once
      saveRouterState(routerState);
    } else if (routerState.simulatedOutages[cand.provider.id]) {
      simulatedError = routerState.simulatedOutages[cand.provider.id] as NormalizedErrorType;
    }

    if (simulatedError) {
      const simLog = {
        time: new Date().toISOString(),
        caller,
        targetModelId: cand.model.id,
        keyLabel: cand.key.label,
        status: 'error' as const,
        errorType: simulatedError,
        durationMs: 50,
        routing: {
          reason: cand.isOtherProvider ? 'provider-switch' : (attempts.length > 0 ? 'failover' : 'primary'),
          chosenModel: cand.model.modelName
        },
        simulated: true
      };
      addLog(simLog);

      attempts.push({
        model: cand.model.modelName,
        key: cand.key.label,
        errorType: simulatedError,
        time: new Date().toISOString(),
        simulated: true
      });

      // Apply cooldown
      if (simulatedError === 'rate_limit_or_quota') {
        routerState.cooldowns[candPairKey] = now + config.limitCooldownMin * 60 * 1000;
      } else if (simulatedError === 'model_not_found') {
        routerState.cooldowns[candPairKey] = now + config.notFoundCooldownMin * 60 * 1000;
      }
      saveRouterState(routerState);

      if (!autoModelSelection) {
        // Pinned branch blocks immediately without failover
        return {
          ok: false,
          routeSequence,
          isProviderSwitch: cand.isOtherProvider,
          attempts,
          error: { type: simulatedError, message: `Simulated error on pinned model: ${simulatedError}` },
          durationMs: 50
        };
      }
      continue;
    }

    // Call real adapter
    const startTime = Date.now();
    let res = await generateText({
      providerType: cand.provider.type,
      apiKey: cand.key.apiKey,
      baseUrl: cand.provider.baseUrl,
      modelName: cand.model.modelName,
      systemPrompt,
      messages: currentMessages
    });

    // Network retry once after 3 seconds (Rule 7.7)
    if (!res.ok && res.error?.type === 'network') {
      await new Promise((r) => setTimeout(r, 3000));
      res = await generateText({
        providerType: cand.provider.type,
        apiKey: cand.key.apiKey,
        baseUrl: cand.provider.baseUrl,
        modelName: cand.model.modelName,
        systemPrompt,
        messages: currentMessages
      });
    }

    const durationMs = Date.now() - startTime;

    addLog({
      time: new Date().toISOString(),
      caller,
      targetModelId: cand.model.id,
      keyLabel: cand.key.label,
      status: res.ok ? 'ok' : 'error',
      errorType: res.error?.type,
      durationMs,
      routing: {
        reason: cand.isOtherProvider ? 'provider-switch' : (attempts.length > 0 ? 'failover' : 'primary'),
        chosenModel: cand.model.modelName
      }
    });

    addExchange({
      id: `ex-${Date.now()}`,
      time: new Date().toISOString(),
      caller,
      targetModelId: cand.model.id,
      prompt: messages[messages.length - 1]?.content || '',
      response: res.ok ? (res.text || '') : (res.error?.message || 'Error'),
      ok: res.ok,
      errorType: res.error?.type,
      durationMs,
      tokens: res.usage?.totalTokens
    });

    if (res.ok && res.text) {
      return {
        ok: true,
        text: res.text,
        modelUsed: cand.model.modelName,
        modelId: cand.model.id,
        keyUsed: cand.key.label,
        routeSequence,
        isProviderSwitch: cand.isOtherProvider,
        attempts,
        durationMs
      };
    }

    // Record failure attempt
    const errType = res.error?.type || 'unknown';
    attempts.push({
      model: cand.model.modelName,
      key: cand.key.label,
      errorType: errType,
      time: new Date().toISOString()
    });

    // Handle error cooldowns
    if (errType === 'rate_limit_or_quota') {
      routerState.cooldowns[candPairKey] = now + config.limitCooldownMin * 60 * 1000;
      saveRouterState(routerState);
    } else if (errType === 'model_not_found') {
      routerState.cooldowns[candPairKey] = now + config.notFoundCooldownMin * 60 * 1000;
      saveRouterState(routerState);
    } else if (errType === 'auth') {
      cand.key.status = 'invalid';
      reg.providers.forEach((p) => {
        const matchingK = p.keys?.find((k) => k.id === cand.key.id);
        if (matchingK) matchingK.status = 'invalid';
      });
      // Save registry with marked key
      saveRouterState(routerState);
    }

    if (!autoModelSelection) {
      // Pinned mode: block immediately on error
      return {
        ok: false,
        routeSequence,
        isProviderSwitch: cand.isOtherProvider,
        attempts,
        error: res.error,
        durationMs
      };
    }
  }

  // All candidates exhausted -> Block
  return {
    ok: false,
    routeSequence,
    isProviderSwitch: false,
    attempts,
    error: {
      type: 'unknown',
      message: `All candidates exhausted. Attempts: ${attempts.map((a) => `${a.model} (${a.errorType})`).join(', ')}`
    },
    durationMs: 0
  };
}
