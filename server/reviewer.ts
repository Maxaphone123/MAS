import {
  getRegistry,
  getRouterState,
  saveRouterState,
  getRouterConfig,
  deleteProjectFilesByStep,
  addLog,
  addExchange,
  ModelRecord
} from './storage.js';
import { callWithRouting } from './router.js';

export interface ReviewProblem {
  severity: 'low' | 'medium' | 'high';
  text: string;
}

export interface ReviewVerdict {
  verdict: 'PASS' | 'FAIL';
  problems: ReviewProblem[];
  out_of_scope: string[];
  style_conflicts: string[];
}

export interface StepReviewResult {
  reviewState: 'pass' | 'fail' | 'reworking' | 'unreviewed' | 'skipped';
  reviewerModel?: string;
  problems: ReviewProblem[];
  reworkCount: number;
  time: string;
  simulated?: boolean;
}

export async function reviewStep(options: {
  branchName: string;
  branchSlug: string;
  stepNumber: number;
  stepTitle: string;
  stepDescription: string;
  stepCriteria: string;
  stepType: string;
  stepComplexity: string;
  stepResult: string;
  filesWritten: Array<{ path: string; content: string }>;
  branchDecisions: string[];
  projectGoal: string;
  branchGoal: string;
  executorModelName?: string;
}): Promise<StepReviewResult> {
  const {
    branchName,
    branchSlug,
    stepNumber,
    stepTitle,
    stepDescription,
    stepCriteria,
    stepType,
    stepResult,
    filesWritten,
    branchDecisions,
    projectGoal,
    branchGoal,
    executorModelName
  } = options;

  const reg = getRegistry();
  const routerState = getRouterState();

  // Check Testing Aid: Force next N reviews to FAIL (Rule 7.8)
  if (routerState.forceReviewFailCount > 0) {
    routerState.forceReviewFailCount--;
    saveRouterState(routerState);

    return {
      reviewState: 'fail',
      reviewerModel: 'Simulated Reviewer',
      problems: [{ severity: 'high', text: 'Simulated review failure (Testing aid active)' }],
      reworkCount: 1,
      time: new Date().toISOString(),
      simulated: true
    };
  }

  // Find models with role 'review'
  let reviewModels = reg.models.filter((m) => (m.roles as string[]).includes('review'));
  if (reviewModels.length === 0) {
    // If no dedicated reviewer model, check planning models
    reviewModels = reg.models.filter((m) => m.roles.includes('planning'));
  }

  // Prefer model different than executor
  if (reviewModels.length > 1 && executorModelName) {
    const alternative = reviewModels.find((m) => m.modelName !== executorModelName);
    if (alternative) {
      reviewModels = [alternative, ...reviewModels.filter((m) => m.id !== alternative.id)];
    }
  }

  if (reviewModels.length === 0) {
    return {
      reviewState: 'unreviewed',
      problems: [{ severity: 'low', text: 'No review model configured in Models registry.' }],
      reworkCount: 0,
      time: new Date().toISOString()
    };
  }

  // Format files content (max 20,000 chars total per Rule 7.8)
  let filesText = '';
  let charCount = 0;
  for (const f of filesWritten) {
    if (charCount > 20000) {
      filesText += `\n[Remaining files truncated beyond 20,000 characters limit]\n`;
      break;
    }
    const snippet = f.content.slice(0, 5000);
    filesText += `\n--- File: ${f.path} ---\n${snippet}\n`;
    charCount += snippet.length;
  }

  const prompt = `You are an AI Reviewer model inspecting a finished step for branch "${branchName}".
Your role is to strictly verify the work against acceptance criteria and technical requirements.
You CANNOT modify files; you only evaluate and output PASS or FAIL.

PROJECT GOAL:
${projectGoal}

BRANCH GOAL:
${branchGoal}

BRANCH DECISIONS LOG:
${branchDecisions.length > 0 ? branchDecisions.map((d) => `- ${d}`).join('\n') : '(None)'}

STEP TO REVIEW:
Step ${stepNumber}: ${stepTitle}
- Description: ${stepDescription}
- Acceptance Criteria: ${stepCriteria}
- Type: ${stepType}

EXECUTOR RESULT:
${stepResult}

FILES WRITTEN:
${filesText || '(No files written directly)'}

VERIFICATION CHECKLIST:
1. Every acceptance criterion is met.
2. Nothing outside the step scope was added.
3. Names and coding style follow the decisions log.
4. No API keys, passwords, or secrets leaked into files.
5. Obvious syntax errors, broken imports, or missing files.

RETURN STRICTLY VALID JSON ONLY:
{
  "verdict": "PASS" | "FAIL",
  "problems": [
    { "severity": "low" | "medium" | "high", "text": "Concrete explanation of issue" }
  ],
  "out_of_scope": [],
  "style_conflicts": []
}`;

  const caller = `reviewer:${branchSlug}:step${stepNumber}`;

  const res = await callWithRouting({
    role: 'review',
    complexity: 'medium',
    systemPrompt: 'You are a rigorous code and plan reviewer. Return raw JSON verdict only.',
    messages: [{ role: 'user', content: prompt }],
    caller,
    autoModelSelection: true
  });

  if (!res.ok || !res.text) {
    // If reviewer fails, step stays unreviewed with warning (Rule 7.8: never block work because of reviewer)
    return {
      reviewState: 'unreviewed',
      reviewerModel: res.modelUsed,
      problems: [{ severity: 'low', text: 'Reviewer call failed to respond.' }],
      reworkCount: 0,
      time: new Date().toISOString()
    };
  }

  try {
    const cleaned = res.text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed: ReviewVerdict = JSON.parse(cleaned);

    const verdict = parsed.verdict === 'PASS' ? 'pass' : 'fail';
    return {
      reviewState: verdict,
      reviewerModel: res.modelUsed,
      problems: Array.isArray(parsed.problems) ? parsed.problems : [],
      reworkCount: verdict === 'fail' ? 1 : 0,
      time: new Date().toISOString()
    };
  } catch {
    return {
      reviewState: 'unreviewed',
      reviewerModel: res.modelUsed,
      problems: [{ severity: 'low', text: 'Reviewer returned unparseable verdict.' }],
      reworkCount: 0,
      time: new Date().toISOString()
    };
  }
}
