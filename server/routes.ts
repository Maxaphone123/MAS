import express, { Router } from 'express';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import {
  getRegistry,
  saveRegistry,
  getMaskedRegistry,
  addLog,
  getLogs,
  addExchange,
  getExchanges,
  getChat,
  saveChat,
  getPlansIndex,
  getPlanContent,
  savePlanVersion,
  ProviderRecord,
  ModelRecord,
  ChatMessage,
  getBranchState,
  getStepOutput,
  getProjectFilesMap,
  getProjectFileContent,
  clearProjectDirectory,
  PROJECT_DIR,
  getCanvasPositions,
  saveCanvasPositions,
  logRegistryChange,
  getRouterConfig,
  saveRouterConfig,
  getRouterState,
  saveRouterState,
  saveBranchState
} from './storage.js';
import {
  testConnectionAndListModels,
  generateText,
  generateImage,
  suggestTier
} from './adapters.js';
import {
  validatePlanMarkdown
} from './planValidator.js';
import {
  syncBranchesWithPlan,
  runNextStep,
  runBranchSteps,
  runAllBranches,
  requestStop,
  isRunnerActive
} from './branchRunner.js';
import {
  previewDirective,
  confirmDirective
} from './directiveManager.js';
import { reviewStep } from './reviewer.js';
import { runProjectIntegrationReview } from './syntaxChecker.js';
import { authMiddleware, getAuthConfig, verifyLogin, setupAuth, disableAuth, revokeSessionToken, verifySessionToken } from './auth.js';
import { getNotifications, markAllNotificationsRead, clearNotifications } from './notifications.js';
import { getTelegramConfig, saveTelegramConfig, sendTelegramMessage } from './telegram.js';
import { getPlugins, savePlugins, PluginItem } from './plugins.js';
import { createFullDataBackup, restoreDataFromBackup } from './backup.js';

export const apiRouter = Router();

// Health check endpoint (Stage 0-9)
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    stage: '0-9',
    timestamp: new Date().toISOString()
  });
});

// Protect all remaining API routes with authentication middleware (Stage 9A)
apiRouter.use(authMiddleware);





// Registry & Providers (Stage 1)
apiRouter.get('/registry', (_req, res) => {
  res.json(getMaskedRegistry());
});

apiRouter.post('/providers', (req, res) => {
  const { type, name, apiKey, baseUrl } = req.body;
  if (!type || !name || !apiKey) {
    return res.status(400).json({ error: 'Missing required provider fields (type, name, apiKey).' });
  }

  const reg = getRegistry();
  const id = `provider-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newProvider: ProviderRecord = {
    id,
    type,
    name,
    baseUrl: baseUrl ? baseUrl.trim() : undefined,
    apiKey: apiKey.trim(),
    keys: [{
      id: `key-1`,
      label: 'Key 1',
      apiKey: apiKey.trim(),
      status: 'working'
    }]
  };

  reg.providers.push(newProvider);
  saveRegistry(reg);
  res.json({ ok: true, providerId: id });
});

apiRouter.delete('/providers/:id', (req, res) => {
  const { id } = req.params;
  const reg = getRegistry();
  reg.providers = reg.providers.filter(p => p.id !== id);
  reg.models = reg.models.filter(m => m.providerId !== id);
  saveRegistry(reg);
  res.json({ ok: true });
});

// Models CRUD (Stage 1)
apiRouter.post('/models', (req, res) => {
  const { providerId, modelName, kind, roles, priority, tier } = req.body;
  if (!providerId || !modelName) {
    return res.status(400).json({ error: 'Missing providerId or modelName.' });
  }

  const reg = getRegistry();
  const provider = reg.providers.find(p => p.id === providerId);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found.' });
  }

  const id = `model-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newModel: ModelRecord = {
    id,
    providerId,
    modelName: modelName.trim(),
    kind: kind === 'image' ? 'image' : 'text',
    roles: Array.isArray(roles) && roles.length > 0 ? roles : ['code'],
    priority: typeof priority === 'number' ? priority : 1,
    tier: ['fast', 'balanced', 'strong'].includes(tier) ? tier : suggestTier(modelName),
    status: 'working'
  };

  reg.models.push(newModel);
  saveRegistry(reg);
  res.json({ ok: true, model: newModel });
});

apiRouter.put('/models/:id', (req, res) => {
  const { id } = req.params;
  const { roles, priority, tier, status } = req.body;
  const reg = getRegistry();
  const model = reg.models.find(m => m.id === id);
  if (!model) {
    return res.status(404).json({ error: 'Model not found.' });
  }

  if (Array.isArray(roles)) model.roles = roles;
  if (typeof priority === 'number') model.priority = priority;
  if (tier) model.tier = tier;
  if (status) model.status = status;

  saveRegistry(reg);
  res.json({ ok: true, model });
});

apiRouter.delete('/models/:id', (req, res) => {
  const { id } = req.params;
  const reg = getRegistry();
  reg.models = reg.models.filter(m => m.id !== id);
  saveRegistry(reg);
  res.json({ ok: true });
});

// Test Connection & List Models (Dynamic model discovery, Principle 6.9)
apiRouter.post('/test-connection', async (req, res) => {
  const { providerType, apiKey, baseUrl } = req.body;
  if (!providerType || !apiKey) {
    return res.status(400).json({ ok: false, error: { type: 'bad_request', message: 'providerType and apiKey are required.' } });
  }

  const result = await testConnectionAndListModels(providerType, apiKey.trim(), baseUrl ? baseUrl.trim() : undefined);
  res.json(result);
});

// Test Chat (Stage 1)
apiRouter.post('/chat/test', async (req, res) => {
  const { modelId, message } = req.body;
  if (!modelId || !message) {
    return res.status(400).json({ ok: false, error: { message: 'modelId and message are required.' } });
  }

  const reg = getRegistry();
  const model = reg.models.find(m => m.id === modelId);
  if (!model) {
    return res.status(404).json({ ok: false, error: { message: 'Model not found in registry.' } });
  }

  const provider = reg.providers.find(p => p.id === model.providerId);
  if (!provider || !provider.apiKey) {
    return res.status(400).json({ ok: false, error: { message: 'Provider or API key not found.' } });
  }

  const startTime = Date.now();
  const caller = 'user-test';

  const result = await generateText({
    providerType: provider.type,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    modelName: model.modelName,
    messages: [{ role: 'user', content: message }]
  });

  const durationMs = Date.now() - startTime;

  addLog({
    time: new Date().toISOString(),
    caller,
    targetModelId: model.id,
    keyLabel: provider.keys?.[0]?.label || 'Key 1',
    status: result.ok ? 'ok' : 'error',
    errorType: result.error?.type,
    durationMs
  });

  addExchange({
    id: `ex-${Date.now()}`,
    time: new Date().toISOString(),
    caller,
    targetModelId: model.id,
    prompt: message,
    response: result.ok ? (result.text || '') : (result.error?.message || 'Error'),
    ok: result.ok,
    errorType: result.error?.type,
    durationMs,
    tokens: result.usage?.totalTokens
  });

  // Update model status based on test result
  if (result.ok) {
    model.status = 'working';
  } else if (result.error?.type === 'rate_limit_or_quota') {
    model.status = 'limit';
  } else {
    model.status = 'error';
  }
  saveRegistry(reg);

  res.json({
    ok: result.ok,
    text: result.text,
    error: result.error,
    durationMs
  });
});

// Logs & Exchanges endpoints
apiRouter.get('/logs', (_req, res) => {
  res.json(getLogs());
});

apiRouter.get('/exchanges', (_req, res) => {
  res.json(getExchanges());
});

// Orchestrator Chat (Stage 2A)
apiRouter.get('/orchestrator/chat', (_req, res) => {
  res.json(getChat());
});

apiRouter.post('/orchestrator/clear', (_req, res) => {
  saveChat([]);
  res.json({ ok: true });
});

apiRouter.post('/orchestrator/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ ok: false, error: 'Message cannot be empty.' });
  }

  const reg = getRegistry();
  // Find top priority model with role 'planning'
  const planningModels = reg.models
    .filter(m => m.roles.includes('planning'))
    .sort((a, b) => a.priority - b.priority);

  if (planningModels.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'No model configured with role "planning". Please go to Models and assign the planning role to at least one model.'
    });
  }

  const targetModel = planningModels[0];
  const provider = reg.providers.find(p => p.id === targetModel.providerId);
  if (!provider || !provider.apiKey) {
    return res.status(400).json({ ok: false, error: 'Provider or API key not found for planning model.' });
  }

  // Get current plan if exists
  const plansIndex = getPlansIndex();
  let currentPlanText = 'No plan created yet.';
  if (plansIndex.currentVersion > 0) {
    const rawPlan = getPlanContent(plansIndex.currentVersion);
    if (rawPlan) currentPlanText = rawPlan;
  }

  const branchStates = syncBranchesWithPlan();
  let branchStatusBlock = 'No active branches (No plan created yet).';
  if (branchStates.length > 0) {
    branchStatusBlock = branchStates.map(b => {
      const doneCount = b.steps.filter(s => s.status === 'done').length;
      const curStep = b.steps.find(s => s.n === b.currentStep);
      const blockedInfo = curStep?.blockedReason ? ` [BLOCKED: ${curStep.blockedReason}]` : '';
      return `- Branch "${b.name}" (role: ${b.role}): ${doneCount}/${b.steps.length} steps completed. Current: Step ${b.currentStep} (${curStep?.title || 'Done'}) status: ${curStep?.status || 'done'}${blockedInfo}`;
    }).join('\n');
  }

  const systemPrompt = `You are the Orchestrator in a personal multi-model AI agent system called "Orchestrator".
Your role in this chat is to discuss goals, clarify requirements, advise the user, and report on branch execution.

STRICT OPERATING RULES:
1. Always respond in the language of the user's last message.
2. In discussion, ask clear, clarifying questions to nail down requirements, scope, and technical approach.
3. The chat NEVER directly modifies the plan or forces execution; plan edits happen via Plan/Directives and execution starts only when user clicks Run buttons.
4. Current plan state:
${currentPlanText}

5. LIVE BRANCH EXECUTION STATUS:
${branchStatusBlock}

6. If the user asks about progress, report accurately based on the LIVE BRANCH EXECUTION STATUS above. If a branch is BLOCKED, explain the reason and suggest a directive or resolution.
7. Be concise, highly structured, and helpful.`;


  const chatHistory = getChat();
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}-u`,
    role: 'user',
    content: message.trim(),
    timestamp: new Date().toISOString()
  };
  chatHistory.push(userMsg);

  const formattedMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = chatHistory
    .slice(-15)
    .map(m => ({ role: m.role, content: m.content }));

  const startTime = Date.now();
  const caller = 'orchestrator';

  const result = await generateText({
    providerType: provider.type,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    modelName: targetModel.modelName,
    systemPrompt,
    messages: formattedMessages
  });

  const durationMs = Date.now() - startTime;

  addLog({
    time: new Date().toISOString(),
    caller,
    targetModelId: targetModel.id,
    keyLabel: provider.keys?.[0]?.label || 'Key 1',
    status: result.ok ? 'ok' : 'error',
    errorType: result.error?.type,
    durationMs
  });

  addExchange({
    id: `ex-${Date.now()}`,
    time: new Date().toISOString(),
    caller,
    targetModelId: targetModel.id,
    prompt: message,
    response: result.ok ? (result.text || '') : (result.error?.message || 'Error'),
    ok: result.ok,
    errorType: result.error?.type,
    durationMs,
    tokens: result.usage?.totalTokens
  });

  if (!result.ok) {
    // Return error without adding broken response
    return res.status(500).json({
      ok: false,
      error: result.error?.message || 'Failed to generate response from planning model.',
      errorType: result.error?.type
    });
  }

  const assistantMsg: ChatMessage = {
    id: `msg-${Date.now()}-a`,
    role: 'assistant',
    content: result.text || '',
    timestamp: new Date().toISOString()
  };
  chatHistory.push(assistantMsg);
  saveChat(chatHistory);

  res.json({
    ok: true,
    message: assistantMsg,
    durationMs
  });
});

// Plans Management (Stage 2B)
apiRouter.get('/plans', (_req, res) => {
  res.json(getPlansIndex());
});

apiRouter.get('/plans/current', (_req, res) => {
  const index = getPlansIndex();
  if (index.currentVersion === 0) {
    return res.json({ currentVersion: 0, meta: null, content: null });
  }
  const content = getPlanContent(index.currentVersion);
  const meta = index.versions.find(v => v.version === index.currentVersion) || null;
  res.json({ currentVersion: index.currentVersion, meta, content });
});

apiRouter.get('/plans/:version', (req, res) => {
  const version = parseInt(req.params.version, 10);
  const index = getPlansIndex();
  const meta = index.versions.find(v => v.version === version);
  if (!meta) {
    return res.status(404).json({ error: `Plan version ${version} not found.` });
  }
  const content = getPlanContent(version);
  res.json({ meta, content });
});

// Edit plan -> creates new version
apiRouter.post('/plans/edit', (req, res) => {
  const { content, note } = req.body;
  if (!content) {
    return res.status(400).json({ ok: false, errors: ['Content cannot be empty.'] });
  }

  const validation = validatePlanMarkdown(content);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  const meta = savePlanVersion(content, 'edited', note || 'Edited via Plan editor');
  res.json({ ok: true, meta, parsed: validation.parsed });
});

// Upload plan -> creates new version
apiRouter.post('/plans/upload', (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ ok: false, errors: ['Uploaded content is empty.'] });
  }

  const validation = validatePlanMarkdown(content);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  const meta = savePlanVersion(content, 'uploaded', 'Uploaded from file');
  res.json({ ok: true, meta, parsed: validation.parsed });
});

// Restore plan -> copies past version as new current version
apiRouter.post('/plans/:version/restore', (req, res) => {
  const version = parseInt(req.params.version, 10);
  const content = getPlanContent(version);
  if (!content) {
    return res.status(404).json({ ok: false, errors: [`Plan version ${version} not found.`] });
  }

  const validation = validatePlanMarkdown(content);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  const meta = savePlanVersion(content, 'restored', `Restored from version v${version}`);
  res.json({ ok: true, meta });
});

// Generate plan from discussion (Stage 2B)
apiRouter.post('/plan/generate', async (_req, res) => {
  const reg = getRegistry();
  const planningModels = reg.models
    .filter(m => m.roles.includes('planning'))
    .sort((a, b) => a.priority - b.priority);

  if (planningModels.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'No model configured with role "planning". Please configure one in Models.'
    });
  }

  const targetModel = planningModels[0];
  const provider = reg.providers.find(p => p.id === targetModel.providerId);
  if (!provider || !provider.apiKey) {
    return res.status(400).json({ ok: false, error: 'Provider or API key not found for planning model.' });
  }

  const chatHistory = getChat();
  if (chatHistory.length === 0) {
    return res.status(400).json({
      ok: false,
      error: 'Discussion is empty. Please talk to the Orchestrator first to discuss your project requirements.'
    });
  }

  const discussionSummary = chatHistory
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const plansIndex = getPlansIndex();
  const nextVer = plansIndex.currentVersion + 1;

  try {
    // Step A: Main planner call (caller planner:main) -> returns project goal and branch list
    const mainPrompt = `Based on the following discussion with the user, synthesize the overall Project Goal and isolated Branches.
Return strictly valid JSON with this exact schema:
{
  "goal": "Clear project goal statement",
  "branches": [
    {
      "name": "BranchName",
      "role": "code" | "ui" | "images" | "text" | "other",
      "branchGoal": "Clear goal statement for this branch"
    }
  ]
}

DISCUSSION:
${discussionSummary}`;

    const mainResult = await generateText({
      providerType: provider.type,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      modelName: targetModel.modelName,
      messages: [{ role: 'user', content: mainPrompt }]
    });

    addLog({
      time: new Date().toISOString(),
      caller: 'planner:main',
      targetModelId: targetModel.id,
      keyLabel: provider.keys?.[0]?.label || 'Key 1',
      status: mainResult.ok ? 'ok' : 'error',
      errorType: mainResult.error?.type,
      durationMs: 500
    });

    if (!mainResult.ok || !mainResult.text) {
      throw new Error(`Main planner call failed: ${mainResult.error?.message || 'Unknown error'}`);
    }

    // Clean JSON from code blocks
    const cleanedMainText = mainResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    let mainData: { goal: string; branches: Array<{ name: string; role: 'code' | 'ui' | 'images' | 'text' | 'other'; branchGoal: string }> };
    try {
      mainData = JSON.parse(cleanedMainText);
    } catch {
      throw new Error('Planner returned invalid JSON for project goal and branches.');
    }

    if (!mainData.goal || !Array.isArray(mainData.branches) || mainData.branches.length === 0) {
      throw new Error('Planner JSON missing goal or branches.');
    }

    // Step B: One call per branch (caller planner:<branch>) -> writes steps
    const branchStepsMap: Record<string, any[]> = {};

    for (const b of mainData.branches) {
      const branchPrompt = `You are planning concrete steps for branch "${b.name}" with role "${b.role}".
Project Goal: ${mainData.goal}
Branch Goal: ${b.branchGoal}

Write 2 to 6 concrete, small, isolated sequential steps to achieve the branch goal.
Return strictly valid JSON with this exact schema:
{
  "steps": [
    {
      "number": 1,
      "title": "Short title",
      "description": "Concrete explanation of what to implement or build",
      "acceptanceCriteria": "Clear verifiable checklist criteria",
      "complexity": "low" | "medium" | "high",
      "type": "code" | "ui" | "image" | "text" | "other",
      "status": "todo"
    }
  ]
}`;

      let branchResult = await generateText({
        providerType: provider.type,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        modelName: targetModel.modelName,
        messages: [{ role: 'user', content: branchPrompt }]
      });

      // Retry once if failed
      if (!branchResult.ok) {
        branchResult = await generateText({
          providerType: provider.type,
          apiKey: provider.apiKey,
          baseUrl: provider.baseUrl,
          modelName: targetModel.modelName,
          messages: [{ role: 'user', content: branchPrompt }]
        });
      }

      addLog({
        time: new Date().toISOString(),
        caller: `planner:${b.name.toLowerCase()}`,
        targetModelId: targetModel.id,
        keyLabel: provider.keys?.[0]?.label || 'Key 1',
        status: branchResult.ok ? 'ok' : 'error',
        errorType: branchResult.error?.type,
        durationMs: 500
      });

      if (!branchResult.ok || !branchResult.text) {
        throw new Error(`Branch planner call failed for branch ${b.name}`);
      }

      const cleanedBranchText = branchResult.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const stepsData = JSON.parse(cleanedBranchText);
      branchStepsMap[b.name] = stepsData.steps || [];
    }

    // Step C: Assemble into strict markdown
    let md = `# Project plan v${nextVer}\n\n`;
    md += `Goal: ${mainData.goal}\n\n`;

    for (const b of mainData.branches) {
      md += `## Branch: ${b.name} (role: ${b.role})\n`;
      md += `Branch goal: ${b.branchGoal}\n\n`;

      const steps = branchStepsMap[b.name] || [];
      steps.forEach((s, idx) => {
        md += `### Step ${idx + 1}: ${s.title || `Step ${idx + 1}`}\n`;
        md += `- Description: ${s.description || 'Step execution'}\n`;
        md += `- Acceptance criteria: ${s.acceptanceCriteria || 'Verified working'}\n`;
        md += `- Complexity: ${s.complexity || 'medium'}\n`;
        md += `- Type: ${s.type || (b.role === 'images' ? 'image' : 'code')}\n`;
        md += `- Status: todo\n\n`;
      });
    }

    const validation = validatePlanMarkdown(md);
    if (!validation.valid) {
      return res.status(500).json({
        ok: false,
        error: 'Generated plan failed format validation.',
        validationErrors: validation.errors,
        rawMarkdown: md
      });
    }

    const meta = savePlanVersion(md, 'generated', `Generated from discussion with ${targetModel.modelName}`);

    res.json({
      ok: true,
      meta,
      content: md,
      parsed: validation.parsed
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message || 'Failed to generate plan.'
    });
  }
});

// ==========================================
// Branches & Step Runners (Stage 3A)
// ==========================================

apiRouter.get('/branches', (_req, res) => {
  const branches = syncBranchesWithPlan();
  res.json(branches);
});

apiRouter.get('/branches/:slug', (req, res) => {
  const { slug } = req.params;
  const state = getBranchState(slug);
  if (!state) {
    return res.status(404).json({ error: `Branch ${slug} not found.` });
  }

  // Load outputs for steps
  const outputs: Record<number, string> = {};
  for (const step of state.steps) {
    const out = getStepOutput(slug, step.n);
    if (out) outputs[step.n] = out;
  }

  res.json({ state, outputs });
});

apiRouter.post('/branches/:slug/run-next', async (req, res) => {
  const { slug } = req.params;
  const result = await runNextStep(slug);
  res.json(result);
});

apiRouter.post('/branches/:slug/run-branch', async (req, res) => {
  const { slug } = req.params;
  const state = await runBranchSteps(slug);
  res.json({ ok: true, state });
});

apiRouter.post('/branches/run-all', async (_req, res) => {
  const states = await runAllBranches();
  res.json({ ok: true, states });
});

apiRouter.post('/branches/stop', (_req, res) => {
  requestStop();
  res.json({ ok: true, message: 'Stop requested.' });
});

apiRouter.get('/branches-runner/status', (_req, res) => {
  res.json({ isRunning: isRunnerActive() });
});

// ==========================================
// Directives (Stage 3B)
// ==========================================

apiRouter.post('/directive/preview', async (req, res) => {
  const { selectedBranches, instruction } = req.body;
  if (!Array.isArray(selectedBranches) || selectedBranches.length === 0 || !instruction?.trim()) {
    return res.status(400).json({
      ok: false,
      error: 'Please select at least one branch and provide an instruction.'
    });
  }

  const result = await previewDirective(selectedBranches, instruction.trim());
  res.json(result);
});

apiRouter.post('/directive/confirm', async (req, res) => {
  const { newMarkdown, instruction } = req.body;
  if (!newMarkdown || !instruction) {
    return res.status(400).json({
      ok: false,
      error: 'Missing newMarkdown or instruction.'
    });
  }

  const result = await confirmDirective(newMarkdown, instruction);
  res.json(result);
});

// ==========================================
// Project Assembly & Preview (Stage 4A)
// ==========================================

apiRouter.get('/project/files', (_req, res) => {
  const map = getProjectFilesMap();
  res.json(map);
});

apiRouter.get('/project/file', (req, res) => {
  const relPath = req.query.path as string;
  if (!relPath) return res.status(400).json({ error: 'Missing path query parameter.' });

  const result = getProjectFileContent(relPath);
  if (!result.exists) return res.status(404).json({ error: `File ${relPath} not found.` });

  if (result.isBinary && result.buffer) {
    let contentType = 'application/octet-stream';
    if (relPath.endsWith('.png')) contentType = 'image/png';
    else if (relPath.endsWith('.jpg') || relPath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (relPath.endsWith('.svg')) contentType = 'image/svg+xml';
    res.setHeader('Content-Type', contentType);
    return res.send(result.buffer);
  }

  res.json({ content: result.content });
});

// Sandboxed preview route for /index.html and assets
apiRouter.use('/project/preview', (req, res) => {
  let subPath = req.path.replace(/^\/+/, '');
  if (!subPath || subPath === '') subPath = 'index.html';

  const fullPath = path.join(PROJECT_DIR, subPath);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).send(`<h3>404 Not Found in Project: ${subPath}</h3><p>Make sure your code branch creates index.html.</p>`);
  }

  // Set appropriate content type
  if (subPath.endsWith('.html')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
  else if (subPath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  else if (subPath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=utf-8');
  else if (subPath.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  else if (subPath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
  else if (subPath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml');

  res.sendFile(fullPath);
});

// Download binary-safe ZIP of all project files
apiRouter.get('/project/zip', async (_req, res) => {
  try {
    const zip = new JSZip();
    const map = getProjectFilesMap();

    for (const [relPath] of Object.entries(map)) {
      const fileData = getProjectFileContent(relPath);
      if (fileData.exists) {
        if (fileData.isBinary && fileData.buffer) {
          zip.file(relPath, fileData.buffer, { binary: true });
        } else if (fileData.content !== undefined) {
          zip.file(relPath, fileData.content);
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="project.zip"');
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create ZIP archive: ' + err.message });
  }
});

apiRouter.post('/project/clear', (_req, res) => {
  clearProjectDirectory();
  res.json({ ok: true });
});

// ==========================================
// Image Generation & Test Image (Stage 4B)
// ==========================================

apiRouter.post('/image/test', async (req, res) => {
  const { modelId, prompt } = req.body;
  if (!modelId || !prompt?.trim()) {
    return res.status(400).json({ ok: false, error: { message: 'modelId and prompt are required.' } });
  }

  const reg = getRegistry();
  const model = reg.models.find(m => m.id === modelId);
  if (!model) {
    return res.status(404).json({ ok: false, error: { message: 'Image model not found.' } });
  }

  const provider = reg.providers.find(p => p.id === model.providerId);
  if (!provider || !provider.apiKey) {
    return res.status(400).json({ ok: false, error: { message: 'Provider API key missing.' } });
  }

  const startTime = Date.now();
  const caller = 'user-image-test';

  const result = await generateImage({
    providerType: provider.type,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    modelName: model.modelName,
    prompt: prompt.trim()
  });

  const durationMs = Date.now() - startTime;

  addLog({
    time: new Date().toISOString(),
    caller,
    targetModelId: model.id,
    keyLabel: provider.keys?.[0]?.label || 'Key 1',
    status: result.ok ? 'ok' : 'error',
    errorType: result.error?.type,
    durationMs
  });

  addExchange({
    id: `ex-${Date.now()}`,
    time: new Date().toISOString(),
    caller,
    targetModelId: model.id,
    prompt: `Image prompt: ${prompt}`,
    response: result.ok ? `[Image generated: ${result.mimeType || 'image/png'}]` : (result.error?.message || 'Error'),
    ok: result.ok,
    errorType: result.error?.type,
    durationMs
  });

  res.json({
    ok: result.ok,
    imageBase64: result.imageBase64,
    mimeType: result.mimeType,
    error: result.error,
    durationMs
  });
});

// ==========================================
// Live Canvas & Slot Assignment (Stage 5A/5B)
// ==========================================

apiRouter.get('/canvas', (_req, res) => {
  const reg = getRegistry();
  const branchStates = syncBranchesWithPlan();
  const savedPositions = getCanvasPositions();
  const logs = getLogs();

  // Find assigned planning model
  const planningModels = reg.models
    .filter(m => m.roles.includes('planning'))
    .sort((a, b) => a.priority - b.priority);
  const orchestratorModel = planningModels[0] || null;

  // Compute call counts per target model
  const callCountMap: Record<string, number> = {};
  const lastCallStatusMap: Record<string, string> = {};
  for (const log of logs) {
    callCountMap[log.targetModelId] = (callCountMap[log.targetModelId] || 0) + 1;
    if (!lastCallStatusMap[log.targetModelId]) {
      lastCallStatusMap[log.targetModelId] = log.status;
    }
  }

  // Active call check
  const runningLog = logs.find(l => l.status === 'running');

  // Build nodes
  const nodes: any[] = [];
  const edges: any[] = [];

  // Column positions defaults: You (x=50), Orchestrator (x=300), Branches (x=600), Models (x=950)
  nodes.push({
    id: 'you',
    type: 'youNode',
    position: savedPositions['you'] || { x: 50, y: 200 },
    data: { label: 'You' }
  });

  nodes.push({
    id: 'orchestrator',
    type: 'orchestratorNode',
    position: savedPositions['orchestrator'] || { x: 300, y: 180 },
    data: {
      label: 'Orchestrator',
      status: runningLog && runningLog.caller.startsWith('orchestrator') ? 'working' : 'idle',
      model: orchestratorModel
        ? { id: orchestratorModel.id, name: orchestratorModel.modelName, tier: orchestratorModel.tier }
        : null
    }
  });

  edges.push({
    id: 'e-you-orch',
    source: 'you',
    target: 'orchestrator',
    animated: !!runningLog
  });

  // Orchestrator to its model edge
  if (orchestratorModel) {
    const callCount = callCountMap[orchestratorModel.id] || 0;
    const isFailed = lastCallStatusMap[orchestratorModel.id] === 'error';
    edges.push({
      id: `e-orch-model-${orchestratorModel.id}`,
      source: 'orchestrator',
      target: `model-${orchestratorModel.id}`,
      label: `${callCount} calls`,
      animated: runningLog?.targetModelId === orchestratorModel.id,
      style: { stroke: isFailed ? '#ef4444' : '#10b981' }
    });
  }

  // Branch nodes
  branchStates.forEach((b, idx) => {
    const branchId = `branch-${b.slug}`;
    const branchModel = reg.models
      .filter(m => (m.roles as string[]).includes(b.role))
      .sort((a, b2) => a.priority - b2.priority)[0] || orchestratorModel;

    const doneCount = b.steps.filter(s => s.status === 'done').length;
    const hasBlocked = b.steps.some(s => s.status === 'blocked');
    const isRunning = runningLog && runningLog.caller.includes(b.slug);

    nodes.push({
      id: branchId,
      type: 'branchNode',
      position: savedPositions[branchId] || { x: 600, y: 80 + idx * 160 },
      data: {
        slug: b.slug,
        name: b.name,
        role: b.role,
        currentStep: b.currentStep,
        totalSteps: b.steps.length,
        doneSteps: doneCount,
        status: hasBlocked ? 'blocked' : doneCount === b.steps.length ? 'done' : isRunning ? 'working' : 'idle',
        assignedModel: branchModel ? { id: branchModel.id, name: branchModel.modelName, tier: branchModel.tier } : null
      }
    });

    // Orchestrator -> Branch dashed edge
    edges.push({
      id: `e-orch-branch-${b.slug}`,
      source: 'orchestrator',
      target: branchId,
      style: { strokeDasharray: '5,5', stroke: '#71717a' }
    });

    // Branch -> Model edge
    if (branchModel) {
      const callCount = callCountMap[branchModel.id] || 0;
      const isFailed = lastCallStatusMap[branchModel.id] === 'error';
      edges.push({
        id: `e-branch-${b.slug}-model-${branchModel.id}`,
        source: branchId,
        target: `model-${branchModel.id}`,
        label: `${callCount} calls`,
        animated: runningLog?.targetModelId === branchModel.id,
        style: { stroke: isFailed ? '#ef4444' : '#3b82f6' }
      });
    }
  });

  // Model nodes
  reg.models.forEach((m, idx) => {
    const modelNodeId = `model-${m.id}`;
    const prov = reg.providers.find(p => p.id === m.providerId);
    nodes.push({
      id: modelNodeId,
      type: 'modelNode',
      position: savedPositions[modelNodeId] || { x: 950, y: 60 + idx * 110 },
      data: {
        id: m.id,
        modelName: m.modelName,
        provider: prov?.name || m.providerId,
        kind: m.kind,
        tier: m.tier,
        status: m.status,
        roles: m.roles,
        priority: m.priority
      }
    });
  });

  res.json({
    nodes,
    edges,
    orchestratorModel,
    branches: branchStates,
    allModels: reg.models
  });
});

apiRouter.post('/canvas/positions', (req, res) => {
  const { positions } = req.body;
  if (positions && typeof positions === 'object') {
    saveCanvasPositions(positions);
  }
  res.json({ ok: true });
});

// Slot assignment from Canvas (Stage 5B: updates role priority, logs change)
apiRouter.post('/canvas/assign-slot', (req, res) => {
  const { targetType, targetSlug, modelId, role } = req.body;
  const reg = getRegistry();
  const targetModel = reg.models.find(m => m.id === modelId);

  if (!targetModel) {
    return res.status(404).json({ error: 'Model not found.' });
  }

  const roleToAssign = role || (targetType === 'orchestrator' ? 'planning' : 'code');

  // Promote this model to priority 1 for this role
  if (!targetModel.roles.includes(roleToAssign)) {
    targetModel.roles.push(roleToAssign);
  }
  targetModel.priority = 1;

  // Shift other models holding this role down
  reg.models.forEach(m => {
    if (m.id !== modelId && m.roles.includes(roleToAssign)) {
      m.priority = (m.priority || 1) + 1;
    }
  });

  saveRegistry(reg);

  logRegistryChange({
    action: `assigned_${roleToAssign}`,
    targetId: targetSlug || targetType,
    role: roleToAssign,
    modelName: targetModel.modelName,
    time: new Date().toISOString()
  });

  res.json({ ok: true, model: targetModel });
});

// ==========================================
// Multi-Key Management (Stage 6B)
// ==========================================

apiRouter.post('/providers/:id/keys', (req, res) => {
  const { id } = req.params;
  const { label, apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'apiKey is required.' });
  }

  const reg = getRegistry();
  const provider = reg.providers.find(p => p.id === id);
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found.' });
  }

  if (!provider.keys) provider.keys = [];
  const keyId = `key-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const newKey = {
    id: keyId,
    label: (label && label.trim()) || `Key ${provider.keys.length + 1}`,
    apiKey: apiKey.trim(),
    status: 'working' as const
  };

  provider.keys.push(newKey);
  saveRegistry(reg);
  res.json({ ok: true, key: { ...newKey, apiKey: `****${newKey.apiKey.slice(-4)}` } });
});

apiRouter.put('/providers/:id/keys/:keyId', (req, res) => {
  const { id, keyId } = req.params;
  const { label, status, apiKey } = req.body;

  const reg = getRegistry();
  const provider = reg.providers.find(p => p.id === id);
  if (!provider || !provider.keys) {
    return res.status(404).json({ error: 'Provider or keys not found.' });
  }

  const key = provider.keys.find(k => k.id === keyId);
  if (!key) {
    return res.status(404).json({ error: 'Key not found.' });
  }

  if (label) key.label = label.trim();
  if (status && ['working', 'limit', 'invalid'].includes(status)) key.status = status;
  if (apiKey && apiKey.trim()) key.apiKey = apiKey.trim();

  saveRegistry(reg);
  res.json({ ok: true, key: { ...key, apiKey: `****${key.apiKey.slice(-4)}` } });
});

apiRouter.delete('/providers/:id/keys/:keyId', (req, res) => {
  const { id, keyId } = req.params;
  const reg = getRegistry();
  const provider = reg.providers.find(p => p.id === id);
  if (!provider || !provider.keys) {
    return res.status(404).json({ error: 'Provider not found.' });
  }

  if (provider.keys.length <= 1) {
    return res.status(400).json({ error: 'Cannot delete the only key for this provider.' });
  }

  provider.keys = provider.keys.filter(k => k.id !== keyId);
  saveRegistry(reg);
  res.json({ ok: true });
});

// ==========================================
// Router Config, Cooldowns & Testing Aids (Stage 6A/6B)
// ==========================================

apiRouter.get('/router/state', (_req, res) => {
  const config = getRouterConfig();
  const state = getRouterState();
  const reg = getRegistry();

  // Attach human-readable label to active cooldowns
  const now = Date.now();
  const activeCooldowns: Array<{ key: string; modelName: string; keyLabel: string; expiresAt: string; secondsLeft: number }> = [];

  for (const [pairKey, exp] of Object.entries(state.cooldowns)) {
    if (exp > now) {
      const [modelId, keyId] = pairKey.split(':');
      const model = reg.models.find(m => m.id === modelId);
      const prov = reg.providers.find(p => p.id === model?.providerId);
      const keyObj = prov?.keys?.find(k => k.id === keyId);

      activeCooldowns.push({
        key: pairKey,
        modelName: model?.modelName || modelId,
        keyLabel: keyObj?.label || keyId || 'Default',
        expiresAt: new Date(exp).toISOString(),
        secondsLeft: Math.round((exp - now) / 1000)
      });
    }
  }

  res.json({
    config,
    state: {
      ...state,
      activeCooldowns
    }
  });
});

apiRouter.put('/router/config', (req, res) => {
  const { limitCooldownMin, notFoundCooldownMin, maxSwitchesPerStep, maxReworksPerStep, allowOtherProvidersForPlanning, allowRunningGeneratedCode } = req.body;
  const current = getRouterConfig();

  const updated = {
    ...current,
    limitCooldownMin: typeof limitCooldownMin === 'number' ? limitCooldownMin : current.limitCooldownMin,
    notFoundCooldownMin: typeof notFoundCooldownMin === 'number' ? notFoundCooldownMin : current.notFoundCooldownMin,
    maxSwitchesPerStep: typeof maxSwitchesPerStep === 'number' ? maxSwitchesPerStep : current.maxSwitchesPerStep,
    maxReworksPerStep: typeof maxReworksPerStep === 'number' ? maxReworksPerStep : current.maxReworksPerStep,
    allowOtherProvidersForPlanning: typeof allowOtherProvidersForPlanning === 'boolean' ? allowOtherProvidersForPlanning : current.allowOtherProvidersForPlanning,
    allowRunningGeneratedCode: typeof allowRunningGeneratedCode === 'boolean' ? allowRunningGeneratedCode : current.allowRunningGeneratedCode
  };

  saveRouterConfig(updated);
  res.json({ ok: true, config: updated });
});

apiRouter.post('/router/clear-cooldown', (req, res) => {
  const { key } = req.body;
  const state = getRouterState();
  if (key) {
    delete state.cooldowns[key];
  } else {
    state.cooldowns = {};
  }
  saveRouterState(state);
  res.json({ ok: true, state });
});

// Testing Aid: Force next call failure on a model (Rule 6.14)
apiRouter.post('/router/force-failure', (req, res) => {
  const { modelId, errorType } = req.body;
  if (!modelId || !errorType) {
    return res.status(400).json({ error: 'modelId and errorType are required.' });
  }

  const state = getRouterState();
  state.forceFailures[modelId] = errorType;
  saveRouterState(state);
  res.json({ ok: true, forced: state.forceFailures });
});

// Testing Aid: Simulated provider outage (Rule 6.14)
apiRouter.post('/router/simulated-outage', (req, res) => {
  const { providerId, errorType } = req.body;
  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required.' });
  }

  const state = getRouterState();
  if (errorType) {
    state.simulatedOutages[providerId] = errorType;
  } else {
    delete state.simulatedOutages[providerId];
  }
  saveRouterState(state);
  res.json({ ok: true, outages: state.simulatedOutages });
});

// Testing Aid: Force next N reviews to fail (Rule 7.8)
apiRouter.post('/router/force-review-fail', (req, res) => {
  const { count } = req.body;
  const num = typeof count === 'number' ? Math.max(0, Math.min(5, count)) : 1;
  const state = getRouterState();
  state.forceReviewFailCount = num;
  saveRouterState(state);
  res.json({ ok: true, forceReviewFailCount: num });
});

apiRouter.post('/router/clear-testing-aids', (_req, res) => {
  const state = getRouterState();
  state.forceFailures = {};
  state.simulatedOutages = {};
  state.forceReviewFailCount = 0;
  saveRouterState(state);
  res.json({ ok: true });
});

// ==========================================
// Project Review & Static Inspection (Stage 7B)
// ==========================================

apiRouter.get('/project/audit', (_req, res) => {
  const cfg = getRouterConfig();
  const report = runProjectIntegrationReview(cfg.allowRunningGeneratedCode ?? true);
  res.json(report);
});

apiRouter.post('/project/apply-audit-directive', async (req, res) => {
  const { branch, suggestion } = req.body;
  if (!branch || !suggestion) {
    return res.status(400).json({ error: 'branch and suggestion are required.' });
  }

  const preview = await previewDirective([branch], suggestion);
  if (!preview.ok || !preview.newMarkdown) {
    return res.status(400).json({ error: preview.error || 'Failed to generate directive.' });
  }

  const confirmed = await confirmDirective(preview.newMarkdown, suggestion);
  res.json({ ok: confirmed.ok, version: confirmed.version, preview });
});

// ==========================================
// Authentication Routes (Stage 9A)
// ==========================================

apiRouter.get('/auth/status', (req, res) => {
  const cfg = getAuthConfig();
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.headers['x-auth-token'] as string);

  const authenticated = !cfg.enabled || (!!token && verifySessionToken(token));
  res.json({
    enabled: cfg.enabled,
    authenticated
  });
});

apiRouter.post('/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ ok: false, error: 'Password required' });
  }

  const result = verifyLogin(password);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: 'Invalid password or PIN' });
  }

  res.json({ ok: true, token: result.token });
});

apiRouter.post('/auth/setup', (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, error: 'Password must be at least 4 characters.' });
  }

  const ok = setupAuth(password);
  res.json({ ok });
});

apiRouter.post('/auth/disable', (_req, res) => {
  disableAuth();
  res.json({ ok: true });
});

apiRouter.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.headers['x-auth-token'] as string);

  if (token) revokeSessionToken(token);
  res.json({ ok: true });
});

// ==========================================
// Notifications Routes (Stage 8A)
// ==========================================

apiRouter.get('/notifications', (_req, res) => {
  res.json(getNotifications());
});

apiRouter.post('/notifications/read', (_req, res) => {
  markAllNotificationsRead();
  res.json({ ok: true });
});

apiRouter.post('/notifications/clear', (_req, res) => {
  clearNotifications();
  res.json({ ok: true });
});

// ==========================================
// Telegram Bot Routes (Stage 8B)
// ==========================================

apiRouter.get('/telegram/config', (_req, res) => {
  const cfg = getTelegramConfig();
  // Mask bot token for UI security
  const maskedToken = cfg.botToken ? `****${cfg.botToken.slice(-6)}` : '';
  res.json({
    ...cfg,
    botToken: maskedToken,
    hasToken: !!cfg.botToken
  });
});

apiRouter.post('/telegram/config', (req, res) => {
  const { enabled, botToken, chatId, notifyOnStepDone, notifyOnBlocked, notifyOnDirective } = req.body;
  const current = getTelegramConfig();

  const updated = {
    ...current,
    enabled: typeof enabled === 'boolean' ? enabled : current.enabled,
    botToken: (botToken && !botToken.startsWith('****')) ? botToken.trim() : current.botToken,
    chatId: chatId !== undefined ? chatId.trim() : current.chatId,
    notifyOnStepDone: typeof notifyOnStepDone === 'boolean' ? notifyOnStepDone : current.notifyOnStepDone,
    notifyOnBlocked: typeof notifyOnBlocked === 'boolean' ? notifyOnBlocked : current.notifyOnBlocked,
    notifyOnDirective: typeof notifyOnDirective === 'boolean' ? notifyOnDirective : current.notifyOnDirective
  };

  saveTelegramConfig(updated);
  res.json({ ok: true, config: { ...updated, botToken: updated.botToken ? `****${updated.botToken.slice(-6)}` : '' } });
});

apiRouter.post('/telegram/test', async (_req, res) => {
  const result = await sendTelegramMessage('🔔 <b>Orchestrator Test Ping</b>\nTelegram integration is working correctly!');
  res.json(result);
});

// ==========================================
// Plugins / Instruction Packs Routes (Stage 8C)
// ==========================================

apiRouter.get('/plugins', (_req, res) => {
  res.json(getPlugins());
});

apiRouter.post('/plugins', (req, res) => {
  const { name, description, targetRoles, instructions } = req.body;
  if (!name || !instructions) {
    return res.status(400).json({ error: 'Name and instructions are required.' });
  }

  const list = getPlugins();
  const id = `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const newItem: PluginItem = {
    id,
    name: name.trim(),
    description: (description && description.trim()) || '',
    targetRoles: Array.isArray(targetRoles) && targetRoles.length > 0 ? targetRoles : ['code'],
    instructions: instructions.trim(),
    enabled: true,
    isBuiltin: false
  };

  list.push(newItem);
  savePlugins(list);
  res.json({ ok: true, plugin: newItem });
});

apiRouter.post('/plugins/:id/toggle', (req, res) => {
  const { id } = req.params;
  const list = getPlugins();
  const p = list.find((item) => item.id === id);
  if (!p) {
    return res.status(404).json({ error: 'Plugin not found' });
  }

  p.enabled = !p.enabled;
  savePlugins(list);
  res.json({ ok: true, plugin: p });
});

apiRouter.delete('/plugins/:id', (req, res) => {
  const { id } = req.params;
  let list = getPlugins();
  const target = list.find((p) => p.id === id);
  if (!target) return res.status(404).json({ error: 'Plugin not found' });
  if (target.isBuiltin) return res.status(400).json({ error: 'Cannot delete built-in pack' });

  list = list.filter((p) => p.id !== id);
  savePlugins(list);
  res.json({ ok: true });
});

// ==========================================
// Full Data Backup & Restore (Stage 9A)
// ==========================================

apiRouter.get('/backup/export', async (_req, res) => {
  try {
    const buffer = await createFullDataBackup();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="orchestrator-data-backup.zip"');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate backup ZIP: ' + err.message });
  }
});

apiRouter.post('/backup/restore', express.raw({ type: 'application/zip', limit: '50mb' }), async (req, res) => {
  try {
    const buffer = Buffer.isBuffer(req.body)
      ? req.body
      : (req.body?.zipBase64 ? Buffer.from(req.body.zipBase64, 'base64') : null);

    if (!buffer) {
      return res.status(400).json({ ok: false, error: 'Missing ZIP buffer or zipBase64' });
    }

    const result = await restoreDataFromBackup(buffer);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});




