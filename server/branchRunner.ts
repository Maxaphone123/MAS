import {
  getBranchState,
  saveBranchState,
  saveStepOutput,
  getStepOutput,
  getAllBranchStates,
  slugify,
  getPlansIndex,
  getPlanContent,
  getRegistry,
  addLog,
  addExchange,
  BranchState,
  BranchStepState,
  getProjectFilesMap,
  saveProjectFile,
  deleteProjectFilesByStep
} from './storage.js';
import { validatePlanMarkdown, ParsedPlan } from './planValidator.js';
import { generateText, generateImage } from './adapters.js';
import { callWithRouting } from './router.js';
import { reviewStep } from './reviewer.js';
import { addNotification } from './notifications.js';
import { sendTelegramMessage, getTelegramConfig } from './telegram.js';
import { getEnrichedSystemPrompt } from './plugins.js';




let stopRequested = false;
let isRunning = false;

export function requestStop() {
  stopRequested = true;
}

export function isRunnerActive() {
  return isRunning;
}

// Synchronize all branches with the active plan according to Section 7.4 re-sync rule:
// A step keeps its state only if its title and description are unchanged; otherwise resets to todo.
export function syncBranchesWithPlan(): BranchState[] {
  const planIndex = getPlansIndex();
  if (planIndex.currentVersion === 0) return [];

  const rawPlan = getPlanContent(planIndex.currentVersion);
  if (!rawPlan) return [];

  const validation = validatePlanMarkdown(rawPlan);
  if (!validation.valid || !validation.parsed) return [];

  const parsedPlan: ParsedPlan = validation.parsed;
  const currentBranchStates: BranchState[] = [];

  for (const b of parsedPlan.branches) {
    const slug = slugify(b.name);
    const existing = getBranchState(slug);

    const stepsState: BranchStepState[] = b.steps.map((st) => {
      const existingStep = existing?.steps?.find((s) => s.n === st.number);

      // Re-sync rule: identical title & description keeps state
      if (
        existingStep &&
        existingStep.title === st.title &&
        existingStep.description === st.description
      ) {
        return {
          ...existingStep,
          acceptanceCriteria: st.acceptanceCriteria,
          complexity: st.complexity,
          type: st.type,
          status: existingStep.status // preserves status (done, in_progress, etc.)
        };
      }

      // Changed or new step -> reset to todo
      return {
        n: st.number,
        title: st.title,
        description: st.description,
        acceptanceCriteria: st.acceptanceCriteria,
        complexity: st.complexity,
        type: st.type,
        status: 'todo',
        attempts: []
      };
    });

    const currentStepNum = stepsState.find((s) => s.status === 'todo' || s.status === 'in_progress')?.n || 1;

    const newState: BranchState = {
      slug,
      name: b.name,
      role: b.role,
      branchGoal: b.branchGoal,
      planVersion: parsedPlan.version,
      currentStep: currentStepNum,
      steps: stepsState,
      decisions: existing?.decisions || []
    };

    saveBranchState(slug, newState);
    currentBranchStates.push(newState);
  }

  return currentBranchStates;
}

// Run single step for a branch
export async function runNextStep(slug: string): Promise<{
  ok: boolean;
  branchState: BranchState | null;
  stepNumber?: number;
  status?: string;
  error?: string;
}> {
  const state = getBranchState(slug);
  if (!state) {
    return { ok: false, branchState: null, error: `Branch ${slug} not found.` };
  }

  // Find next step to run
  const step = state.steps.find((s) => s.status === 'todo' || s.status === 'in_progress');
  if (!step) {
    return { ok: true, branchState: state, status: 'all_done' };
  }

  // Image step execution flow (Stage 4B)
  if (step.type === 'image') {
    const reg = getRegistry();
    const imageModel = reg.models.find(
      (m) => m.kind === 'image' || (m.roles as string[]).includes('images')
    );
    if (!imageModel) {
      step.status = 'blocked';
      step.blockedReason = 'No image model configured';
      saveBranchState(slug, state);
      return { ok: true, branchState: state, stepNumber: step.n, status: 'blocked' };
    }

    const imgProvider = reg.providers.find((p) => p.id === imageModel.providerId);
    if (!imgProvider || !imgProvider.apiKey) {
      step.status = 'blocked';
      step.blockedReason = 'API key missing for image model provider';
      saveBranchState(slug, state);
      return { ok: true, branchState: state, stepNumber: step.n, status: 'blocked' };
    }

    step.status = 'in_progress';
    state.currentStep = step.n;
    saveBranchState(slug, state);

    // Use planning model to generate image prompts (max 4)
    const planningModels = reg.models
      .filter((m) => (m.roles as string[]).includes('planning'))
      .sort((a, b) => a.priority - b.priority);
    const planModel = planningModels[0] || imageModel;
    const planProvider = reg.providers.find((p) => p.id === planModel.providerId) || imgProvider;

    const imgPlannerPrompt = `Generate up to 4 image generation prompts for this image step:
Step Title: ${step.title}
Description: ${step.description}
Acceptance Criteria: ${step.acceptanceCriteria}

Return strictly valid JSON:
{
  "images": [
    {
      "filename": "asset_name.png",
      "prompt": "Detailed descriptive visual prompt for generation"
    }
  ]
}`;

    const planRes = await generateText({
      providerType: planProvider.type,
      apiKey: planProvider.apiKey || '',
      baseUrl: planProvider.baseUrl,
      modelName: planModel.modelName,
      messages: [{ role: 'user', content: imgPlannerPrompt }]
    });

    let imagePrompts: Array<{ filename: string; prompt: string }> = [
      { filename: `${slugify(step.title)}.png`, prompt: step.description }
    ];

    if (planRes.ok && planRes.text) {
      try {
        const parsed = JSON.parse(planRes.text.replace(/```json/gi, '').replace(/```/g, '').trim());
        if (Array.isArray(parsed.images) && parsed.images.length > 0) {
          imagePrompts = parsed.images.slice(0, 4);
        }
      } catch {}
    }

    const generatedAssets: string[] = [];
    for (const item of imagePrompts) {
      const cleanFileName = item.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalRelPath = `assets/${cleanFileName.endsWith('.png') ? cleanFileName : cleanFileName + '.png'}`;
      const imgRes = await generateImage({
        providerType: imgProvider.type,
        apiKey: imgProvider.apiKey,
        baseUrl: imgProvider.baseUrl,
        modelName: imageModel.modelName,
        prompt: item.prompt
      });

      if (imgRes.ok && imgRes.imageBase64) {
        const buffer = Buffer.from(imgRes.imageBase64, 'base64');
        saveProjectFile(finalRelPath, buffer, state.name, step.n);
        generatedAssets.push(finalRelPath);
      }
    }

    const resultMd = `### Generated Image Assets\n` +
      generatedAssets.map((p) => `- \`${p}\``).join('\n') +
      `\n\nPrompt description: ${step.description}`;

    const resultPath = saveStepOutput(slug, step.n, resultMd);
    step.status = 'done';
    step.resultPath = resultPath;
    step.modelUsed = imageModel.modelName;
    step.finishedAt = new Date().toISOString();
    step.blockedReason = undefined;

    const nextStep = state.steps.find((s) => s.n > step.n && s.status === 'todo');
    state.currentStep = nextStep ? nextStep.n : step.n;
    saveBranchState(slug, state);
    return { ok: true, branchState: state, stepNumber: step.n, status: 'done' };
  }


  // Select model according to Stage 3A: model whose role equals branch role, or fallback to planning
  const reg = getRegistry();
  const matchingModels = reg.models
    .filter((m) => (m.roles as string[]).includes(state.role))
    .sort((a, b) => a.priority - b.priority);


  const fallbackPlanning = reg.models
    .filter((m) => m.roles.includes('planning'))
    .sort((a, b) => a.priority - b.priority);

  const targetModel = matchingModels[0] || fallbackPlanning[0];
  if (!targetModel) {
    step.status = 'blocked';
    step.blockedReason = `No model configured for role "${state.role}" or "planning" in Models registry.`;
    saveBranchState(slug, state);
    return { ok: false, branchState: state, error: step.blockedReason };
  }

  const provider = reg.providers.find((p) => p.id === targetModel.providerId);
  if (!provider || !provider.apiKey) {
    step.status = 'blocked';
    step.blockedReason = 'Provider or API key missing for executor model.';
    saveBranchState(slug, state);
    return { ok: false, branchState: state, error: step.blockedReason };
  }

  // Mark step in_progress
  step.status = 'in_progress';
  state.currentStep = step.n;
  saveBranchState(slug, state);

  // Gather isolated context for executor (Rule 6.3)
  // Executor sees: current step, branch goal, project goal, branch decisions log, outputs of previous steps of ITS OWN branch
  const planIndex = getPlansIndex();
  let projectGoal = 'Build the application';
  if (planIndex.currentVersion > 0) {
    const raw = getPlanContent(planIndex.currentVersion) || '';
    const parsed = validatePlanMarkdown(raw);
    if (parsed.parsed) projectGoal = parsed.parsed.goal;
  }

  // Previous outputs of THIS branch only
  const previousOutputs: string[] = [];
  for (let i = 1; i < step.n; i++) {
    const out = getStepOutput(slug, i);
    if (out) {
      previousOutputs.push(`### Output of Step ${i}:\n${out}`);
    }
  }

  // One line titles of other steps in THIS branch
  const otherStepsOverview = state.steps
    .map((s) => `Step ${s.n}: ${s.title} (${s.status})`)
    .join('\n');

  const executorPrompt = `You are an AI Executor model for branch "${state.name}" (role: ${state.role}).
Follow the approved plan contract strictly. You CANNOT change the plan or skip steps.

PROJECT GOAL:
${projectGoal}

BRANCH GOAL:
${state.branchGoal}

BRANCH STEPS OVERVIEW:
${otherStepsOverview}

BRANCH DECISIONS LOG SO FAR:
${state.decisions.length > 0 ? state.decisions.map((d) => `- ${d}`).join('\n') : '(None yet)'}

PREVIOUS STEP OUTPUTS IN THIS BRANCH:
${previousOutputs.length > 0 ? previousOutputs.join('\n\n') : '(First step in this branch)'}

EXISTING PROJECT FILES (PATHS & OWNERS):
${Object.keys(getProjectFilesMap()).length > 0
  ? Object.keys(getProjectFilesMap()).map(p => `- ${p} (owned by ${getProjectFilesMap()[p].ownerBranch})`).join('\n')
  : '(No files created in project yet)'}

--------------------------------------------------
YOUR CURRENT ASSIGNED STEP (EXECUTE THIS STEP ONLY):

Step ${step.n}: ${step.title}
- Description: ${step.description}
- Acceptance Criteria: ${step.acceptanceCriteria}
- Complexity: ${step.complexity}
- Type: ${step.type}

INSTRUCTIONS:
Perform the work required for this step. If it involves code or files, specify the relative paths and contents.
If the step cannot be completed due to missing dependencies or impossibility, return status "BLOCKED" with a reason.
Otherwise return status "DONE".

RETURN STRICTLY VALID JSON ONLY (no markdown formatting, no commentary outside json):
{
  "status": "DONE" | "BLOCKED",
  "result": "Detailed markdown explanation of what was implemented and achieved",
  "decisions": ["Any technical decision made, e.g. 'Used local state for storage'"],
  "reason": "If BLOCKED, exact reason why this step cannot proceed",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "file content here"
    }
  ]
}`;

  const caller = `executor:${slug}:step${step.n}`;
  const enrichedPrompt = getEnrichedSystemPrompt(executorPrompt, state.role);

  let execResult = await callWithRouting({
    role: state.role,
    complexity: step.complexity,
    branchSlug: slug,
    caller,
    messages: [{ role: 'user', content: enrichedPrompt }],
    autoModelSelection: (state as any).autoModelSelection !== false,
    allowOtherProviders: (state as any).allowOtherProviders === true
  });

  if (!execResult.ok || !execResult.text) {
    step.status = 'blocked';
    step.blockedReason = execResult.error?.message || 'Model execution failed.';
    if (execResult.attempts) {
      step.attempts.push(...execResult.attempts);
    }
    saveBranchState(slug, state);
    return { ok: false, branchState: state, stepNumber: step.n, status: 'blocked', error: step.blockedReason };
  }

  // Parse executor JSON output
  let parsedOutput: {
    status: 'DONE' | 'BLOCKED';
    result?: string;
    decisions?: string[];
    reason?: string;
    files?: Array<{ path: string; content: string }>;
  };

  try {
    const cleanedText = execResult.text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    parsedOutput = JSON.parse(cleanedText);
  } catch {
    // Retry once for JSON parse failure
    const retryPrompt = `${executorPrompt}\n\nIMPORTANT: Your previous output was invalid JSON. You MUST return strictly valid raw JSON only!`;
    const retryResult = await callWithRouting({
      role: state.role,
      complexity: step.complexity,
      branchSlug: slug,
      caller: `${caller}:retry-json`,
      messages: [{ role: 'user', content: retryPrompt }],
      autoModelSelection: (state as any).autoModelSelection !== false,
      allowOtherProviders: (state as any).allowOtherProviders === true
    });

    if (retryResult.ok && retryResult.text) {
      try {
        const cleanedRetry = retryResult.text
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();
        parsedOutput = JSON.parse(cleanedRetry);
      } catch {
        step.status = 'blocked';
        step.blockedReason = 'invalid executor output (failed JSON parsing twice)';
        step.attempts.push({
          model: retryResult.modelUsed || 'unknown',
          errorType: 'bad_request',
          time: new Date().toISOString()
        });
        saveBranchState(slug, state);
        return { ok: false, branchState: state, stepNumber: step.n, status: 'blocked', error: step.blockedReason };
      }
    } else {
      step.status = 'blocked';
      step.blockedReason = 'invalid executor output';
      saveBranchState(slug, state);
      return { ok: false, branchState: state, stepNumber: step.n, status: 'blocked', error: step.blockedReason };
    }
  }

  // Process DONE or BLOCKED
  if (parsedOutput.status === 'DONE') {
    // Assemble files if returned (Stage 4A)
    const filesWritten = Array.isArray(parsedOutput.files) ? parsedOutput.files : [];
    for (const file of filesWritten) {
      if (file && typeof file.path === 'string' && file.content !== undefined) {
        const saveRes = saveProjectFile(file.path, file.content, state.name, step.n);
        if (!saveRes.ok) {
          step.status = 'blocked';
          step.blockedReason = saveRes.conflict || 'File save error';
          saveBranchState(slug, state);
          return { ok: false, branchState: state, stepNumber: step.n, status: 'blocked', error: step.blockedReason };
        }
      }
    }

    const resultMd = parsedOutput.result || 'Step completed successfully.';
    const resultPath = saveStepOutput(slug, step.n, resultMd);

    step.resultPath = resultPath;
    step.modelUsed = execResult.modelUsed;
    step.finishedAt = new Date().toISOString();
    step.blockedReason = undefined;

    // Append decisions
    if (Array.isArray(parsedOutput.decisions)) {
      for (const d of parsedOutput.decisions) {
        if (typeof d === 'string' && !state.decisions.includes(d)) {
          state.decisions.push(d);
        }
      }
    }

    // Stage 7A Reviewer Step Loop (Auto Review)
    const autoReviewEnabled = (state as any).autoReview !== false;
    if (autoReviewEnabled) {
      step.status = 'in_progress';
      const reviewResult = await reviewStep({
        branchName: state.name,
        branchSlug: slug,
        stepNumber: step.n,
        stepTitle: step.title,
        stepDescription: step.description,
        stepCriteria: step.acceptanceCriteria,
        stepType: step.type,
        stepComplexity: step.complexity,
        stepResult: resultMd,
        filesWritten,
        branchDecisions: state.decisions,
        projectGoal,
        branchGoal: state.branchGoal,
        executorModelName: execResult.modelUsed
      });

      step.review = reviewResult;

      if (reviewResult.reviewState === 'fail') {
        // Rule 7.8 Rework loop: delete failed attempt files
        deleteProjectFilesByStep(state.name, step.n);

        // Re-execute with review feedback and escalated tier
        const reworkPrompt = `${executorPrompt}\n\nCRITICAL REWORK: Reviewer rejected the previous attempt with these problems:\n` +
          reviewResult.problems.map((p) => `- [${p.severity}] ${p.text}`).join('\n') +
          `\nFix all problems and return complete, corrected files.`;

        const reworkRes = await callWithRouting({
          role: state.role,
          complexity: 'high', // escalate to strong tier on rework
          branchSlug: slug,
          caller: `${caller}:rework1`,
          messages: [{ role: 'user', content: reworkPrompt }],
          autoModelSelection: true,
          allowOtherProviders: (state as any).allowOtherProviders === true
        });

        if (reworkRes.ok && reworkRes.text) {
          try {
            const cleanedRework = reworkRes.text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const reworkParsed = JSON.parse(cleanedRework);
            if (reworkParsed.status === 'DONE') {
              if (Array.isArray(reworkParsed.files)) {
                for (const f of reworkParsed.files) {
                  saveProjectFile(f.path, f.content, state.name, step.n);
                }
              }
              const reworkMd = reworkParsed.result || 'Rework completed successfully.';
              saveStepOutput(slug, step.n, reworkMd);
              step.status = 'done';
              step.review = {
                reviewState: 'pass',
                reworkCount: 1,
                problems: [],
                time: new Date().toISOString()
              };
              step.modelUsed = reworkRes.modelUsed;
            } else {
              step.status = 'blocked';
              step.blockedReason = 'review failed: ' + (reworkParsed.reason || 'Rework rejected');
            }
          } catch {
            step.status = 'blocked';
            step.blockedReason = 'review failed (invalid output on rework attempt)';
          }
        } else {
          step.status = 'blocked';
          step.blockedReason = 'review failed: ' + (reviewResult.problems[0]?.text || 'Rework call failed');
        }
      } else {
        step.status = 'done';
      }
    } else {
      step.status = 'done';
      step.review = {
        reviewState: 'skipped',
        problems: [],
        reworkCount: 0,
        time: new Date().toISOString()
      };
    }


    // Set next currentStep
    const nextStep = state.steps.find((s) => s.n > step.n && s.status === 'todo');
    state.currentStep = nextStep ? nextStep.n : step.n;

    if (step.status === 'done') {
      addNotification({
        type: 'success',
        title: `Step ${step.n} completed`,
        message: `Branch "${state.name}": "${step.title}" finished.`
      });
      if (getTelegramConfig().notifyOnStepDone) {
        sendTelegramMessage(`✅ <b>Step ${step.n} Completed</b>\nBranch: <code>${state.name}</code>\nStep: ${step.title}\nModel: ${step.modelUsed || 'default'}`).catch(() => {});
      }
    } else if (step.status === 'blocked') {
      addNotification({
        type: 'error',
        title: `Step ${step.n} blocked`,
        message: `Branch "${state.name}": ${step.blockedReason || 'Step blocked'}`
      });
      if (getTelegramConfig().notifyOnBlocked) {
        sendTelegramMessage(`🔴 <b>Step ${step.n} BLOCKED</b>\nBranch: <code>${state.name}</code>\nReason: ${step.blockedReason || 'Error'}`).catch(() => {});
      }
    }
  } else {
    step.status = 'blocked';
    step.blockedReason = parsedOutput.reason || 'Blocked by model decision.';
    addNotification({
      type: 'error',
      title: `Step ${step.n} blocked`,
      message: `Branch "${state.name}": ${step.blockedReason}`
    });
    if (getTelegramConfig().notifyOnBlocked) {
      sendTelegramMessage(`🔴 <b>Step ${step.n} BLOCKED</b>\nBranch: <code>${state.name}</code>\nReason: ${step.blockedReason}`).catch(() => {});
    }
  }

  saveBranchState(slug, state);
  return { ok: true, branchState: state, stepNumber: step.n, status: step.status };
}

// Run all remaining steps for a single branch
export async function runBranchSteps(slug: string): Promise<BranchState | null> {
  stopRequested = false;
  isRunning = true;
  try {
    let continueLoop = true;
    let finalState: BranchState | null = null;

    while (continueLoop && !stopRequested) {
      const res = await runNextStep(slug);
      finalState = res.branchState;
      if (!res.ok || res.status === 'all_done' || res.status === 'blocked') {
        continueLoop = false;
      }
    }

    return finalState;
  } finally {
    isRunning = false;
    stopRequested = false;
  }
}

// Run all branches sequentially
export async function runAllBranches(): Promise<BranchState[]> {
  stopRequested = false;
  isRunning = true;
  try {
    const states = syncBranchesWithPlan();
    for (const b of states) {
      if (stopRequested) break;
      await runBranchSteps(b.slug);
    }
    return getAllBranchStates();
  } finally {
    isRunning = false;
    stopRequested = false;
  }
}
