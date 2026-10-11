import {
  getPlansIndex,
  getPlanContent,
  savePlanVersion,
  getRegistry,
  addLog,
  slugify,
  getBranchState
} from './storage.js';
import { validatePlanMarkdown, ParsedPlan } from './planValidator.js';
import { generateText } from './adapters.js';
import { syncBranchesWithPlan } from './branchRunner.js';
import { addNotification } from './notifications.js';
import { sendTelegramMessage, getTelegramConfig } from './telegram.js';

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

export async function previewDirective(
  selectedBranchSlugs: string[],
  instruction: string
): Promise<DirectivePreviewResult> {
  const planIndex = getPlansIndex();
  if (planIndex.currentVersion === 0) {
    return { ok: false, error: 'No active plan exists to apply directives to.' };
  }

  const currentMd = getPlanContent(planIndex.currentVersion);
  if (!currentMd) {
    return { ok: false, error: 'Current plan file not found.' };
  }

  const parsedCurrent = validatePlanMarkdown(currentMd);
  if (!parsedCurrent.valid || !parsedCurrent.parsed) {
    return { ok: false, error: 'Current plan failed validation.' };
  }

  const reg = getRegistry();
  const planningModels = reg.models
    .filter((m) => m.roles.includes('planning'))
    .sort((a, b) => a.priority - b.priority);

  if (planningModels.length === 0) {
    return { ok: false, error: 'No model configured with role "planning".' };
  }

  const targetModel = planningModels[0];
  const provider = reg.providers.find((p) => p.id === targetModel.providerId);
  if (!provider || !provider.apiKey) {
    return { ok: false, error: 'Provider or API key not found for planning model.' };
  }

  // Find branches that will be modified
  const currentBranches = parsedCurrent.parsed.branches;
  const targetBranches = currentBranches.filter((b) =>
    selectedBranchSlugs.includes(slugify(b.name))
  );

  if (targetBranches.length === 0) {
    return { ok: false, error: 'None of the selected branches were found in the current plan.' };
  }

  const nextVer = planIndex.currentVersion + 1;

  // Prompt the planning model to rewrite ONLY the target branches
  const prompt = `You are updating specific isolated branches of a project plan based on a user DIRECTIVE.
Project Goal: ${parsedCurrent.parsed.goal}
User Directive: ${instruction}

TARGET BRANCHES TO REWRITE:
${targetBranches.map((b) => `- ${b.name} (role: ${b.role}, goal: ${b.branchGoal})`).join('\n')}

For EACH target branch, generate updated steps adhering to the user directive.
Return strictly valid JSON with this exact schema:
{
  "updatedBranches": [
    {
      "name": "BranchName",
      "branchGoal": "Updated or current branch goal",
      "steps": [
        {
          "number": 1,
          "title": "Short title",
          "description": "Concrete explanation",
          "acceptanceCriteria": "Criteria",
          "complexity": "low" | "medium" | "high",
          "type": "code" | "ui" | "image" | "text" | "other",
          "status": "todo"
        }
      ]
    }
  ]
}`;

  const caller = 'planner:directive';
  const result = await generateText({
    providerType: provider.type,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    modelName: targetModel.modelName,
    messages: [{ role: 'user', content: prompt }]
  });

  addLog({
    time: new Date().toISOString(),
    caller,
    targetModelId: targetModel.id,
    keyLabel: provider.keys?.[0]?.label || 'Key 1',
    status: result.ok ? 'ok' : 'error',
    errorType: result.error?.type,
    durationMs: 500
  });

  if (!result.ok || !result.text) {
    return { ok: false, error: result.error?.message || 'Directive planning call failed.' };
  }

  let updatedData: { updatedBranches: any[] };
  try {
    const cleaned = result.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    updatedData = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: 'Planner returned invalid JSON for directive.' };
  }

  // Compose new plan markdown: keep unselected branches byte-identical!
  let newMd = `# Project plan v${nextVer}\n\n`;
  newMd += `Goal: ${parsedCurrent.parsed.goal}\n\n`;

  const diff: DirectiveDiff = {
    affectedBranches: targetBranches.map((b) => b.name),
    addedSteps: [],
    modifiedSteps: [],
    removedSteps: [],
    doneStepsToResetCount: 0
  };

  for (const b of currentBranches) {
    const isTarget = selectedBranchSlugs.includes(slugify(b.name));
    if (!isTarget) {
      // Byte-identical reproduction of unselected branch
      newMd += `## Branch: ${b.name} (role: ${b.role})\n`;
      newMd += `Branch goal: ${b.branchGoal}\n\n`;
      for (const s of b.steps) {
        newMd += `### Step ${s.number}: ${s.title}\n`;
        newMd += `- Description: ${s.description}\n`;
        newMd += `- Acceptance criteria: ${s.acceptanceCriteria}\n`;
        newMd += `- Complexity: ${s.complexity}\n`;
        newMd += `- Type: ${s.type}\n`;
        newMd += `- Status: ${s.status}\n\n`;
      }
    } else {
      // Insert rewritten branch
      const updated = updatedData.updatedBranches.find((u) => slugify(u.name) === slugify(b.name)) || b;
      newMd += `## Branch: ${b.name} (role: ${b.role})\n`;
      newMd += `Branch goal: ${updated.branchGoal || b.branchGoal}\n\n`;

      const existingState = getBranchState(slugify(b.name));
      const steps = updated.steps || [];

      // Compute diff
      const oldStepTitles = b.steps.map((s) => s.title);
      const newStepTitles = steps.map((s: any) => s.title);

      for (const st of steps) {
        if (!oldStepTitles.includes(st.title)) {
          diff.addedSteps.push({ branch: b.name, title: st.title });
        } else {
          const oldSt = b.steps.find((s) => s.title === st.title);
          if (oldSt && oldSt.description !== st.description) {
            diff.modifiedSteps.push({ branch: b.name, title: st.title });
          }
        }
      }

      for (const oldSt of b.steps) {
        if (!newStepTitles.includes(oldSt.title)) {
          diff.removedSteps.push({ branch: b.name, title: oldSt.title });
        }
        // Check if a done step will be redone
        const matchingState = existingState?.steps?.find((s) => s.n === oldSt.number);
        if (matchingState?.status === 'done') {
          const newMatching = steps.find((s: any) => s.title === oldSt.title && s.description === oldSt.description);
          if (!newMatching) {
            diff.doneStepsToResetCount++;
          }
        }
      }

      steps.forEach((s: any, idx: number) => {
        newMd += `### Step ${idx + 1}: ${s.title}\n`;
        newMd += `- Description: ${s.description}\n`;
        newMd += `- Acceptance criteria: ${s.acceptanceCriteria}\n`;
        newMd += `- Complexity: ${s.complexity || 'medium'}\n`;
        newMd += `- Type: ${s.type || (b.role === 'images' ? 'image' : 'code')}\n`;
        newMd += `- Status: todo\n\n`;
      });
    }
  }

  // Validate the new plan
  const validation = validatePlanMarkdown(newMd);
  if (!validation.valid) {
    return { ok: false, error: 'Directive generated invalid plan format.', newMarkdown: newMd };
  }

  return {
    ok: true,
    diff,
    newMarkdown: newMd
  };
}

export async function confirmDirective(
  newMarkdown: string,
  instruction: string
): Promise<{ ok: boolean; version?: number; error?: string }> {
  const validation = validatePlanMarkdown(newMarkdown);
  if (!validation.valid) {
    return { ok: false, error: 'Invalid plan markdown for directive confirmation.' };
  }

  const meta = savePlanVersion(newMarkdown, 'directive', `Directive: ${instruction}`);
  syncBranchesWithPlan();

  addNotification({
    type: 'info',
    title: `Directive applied (Plan v${meta.version})`,
    message: instruction
  });

  if (getTelegramConfig().notifyOnDirective) {
    sendTelegramMessage(`📝 <b>Directive Applied</b> (Plan v${meta.version})\n<code>${instruction}</code>`).catch(() => {});
  }

  return { ok: true, version: meta.version };
}
