export interface StepData {
  number: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  complexity: 'low' | 'medium' | 'high';
  type: 'code' | 'ui' | 'image' | 'text' | 'other';
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
}

export interface BranchData {
  name: string;
  role: 'code' | 'ui' | 'images' | 'text' | 'other';
  branchGoal: string;
  steps: StepData[];
}

export interface ParsedPlan {
  version: number;
  goal: string;
  branches: BranchData[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsed?: ParsedPlan;
}

const VALID_ROLES = ['code', 'ui', 'images', 'text', 'other'];
const VALID_COMPLEXITIES = ['low', 'medium', 'high'];
const VALID_TYPES = ['code', 'ui', 'image', 'text', 'other'];
const VALID_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];

export function validatePlanMarkdown(markdown: string): ValidationResult {
  const errors: string[] = [];
  if (!markdown || !markdown.trim()) {
    return { valid: false, errors: ['Plan content is completely empty.'] };
  }

  const lines = markdown.split(/\r?\n/);
  
  // 1. Check title line: # Project plan v<N>
  const firstNonEmpty = lines.find(l => l.trim().length > 0) || '';
  const titleMatch = firstNonEmpty.trim().match(/^#\s+Project\s+plan\s+v(\d+)/i);
  let version = 1;
  if (!titleMatch) {
    errors.push('Missing or invalid header. Must start with "# Project plan v<N>" (e.g. "# Project plan v1").');
  } else {
    version = parseInt(titleMatch[1], 10);
  }

  // 2. Check Goal: <text>
  const goalLine = lines.find(l => /^Goal:\s+/i.test(l.trim()));
  let goal = '';
  if (!goalLine) {
    errors.push('Missing "Goal: <text>" line.');
  } else {
    goal = goalLine.replace(/^Goal:\s+/i, '').trim();
    if (!goal) {
      errors.push('"Goal:" cannot be empty.');
    }
  }

  // 3. Parse branches
  const branches: BranchData[] = [];
  let currentBranch: Partial<BranchData> | null = null;
  let currentStep: Partial<StepData> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Branch header: ## Branch: <name> (role: <role>)
    const branchMatch = line.match(/^##\s+Branch:\s*(.*?)\s*\(\s*role:\s*(.*?)\s*\)$/i);
    if (branchMatch) {
      if (currentBranch) {
        if (currentStep) {
          finalizeStep(currentStep, currentBranch, errors);
          currentStep = null;
        }
        finalizeBranch(currentBranch, branches, errors);
      }
      const bName = branchMatch[1].trim();
      const bRole = branchMatch[2].trim().toLowerCase() as any;
      if (!VALID_ROLES.includes(bRole)) {
        errors.push(`Branch "${bName}" has invalid role "${bRole}". Allowed roles: ${VALID_ROLES.join(', ')}.`);
      }
      currentBranch = {
        name: bName,
        role: bRole,
        branchGoal: '',
        steps: []
      };
      continue;
    }

    if (currentBranch) {
      // Branch goal: Branch goal: <text>
      if (/^Branch goal:\s+/i.test(line)) {
        currentBranch.branchGoal = line.replace(/^Branch goal:\s+/i, '').trim();
        continue;
      }

      // Step header: ### Step <n>: <title>
      const stepMatch = line.match(/^###\s+Step\s+(\d+):\s*(.*)$/i);
      if (stepMatch) {
        if (currentStep) {
          finalizeStep(currentStep, currentBranch, errors);
        }
        currentStep = {
          number: parseInt(stepMatch[1], 10),
          title: stepMatch[2].trim(),
          description: '',
          acceptanceCriteria: '',
          complexity: undefined,
          type: undefined,
          status: undefined
        };
        continue;
      }

      // Inside step fields
      if (currentStep) {
        if (/^-\s+Description:\s*/i.test(line)) {
          currentStep.description = line.replace(/^-\s+Description:\s*/i, '').trim();
        } else if (/^-\s+Acceptance criteria:\s*/i.test(line)) {
          currentStep.acceptanceCriteria = line.replace(/^-\s+Acceptance criteria:\s*/i, '').trim();
        } else if (/^-\s+Complexity:\s*/i.test(line)) {
          const comp = line.replace(/^-\s+Complexity:\s*/i, '').trim().toLowerCase() as any;
          if (VALID_COMPLEXITIES.includes(comp)) {
            currentStep.complexity = comp;
          } else {
            errors.push(`Step ${currentStep.number} (${currentBranch.name}) invalid Complexity "${comp}". Expected low | medium | high.`);
          }
        } else if (/^-\s+Type:\s*/i.test(line)) {
          const typ = line.replace(/^-\s+Type:\s*/i, '').trim().toLowerCase() as any;
          if (VALID_TYPES.includes(typ)) {
            currentStep.type = typ;
          } else {
            errors.push(`Step ${currentStep.number} (${currentBranch.name}) invalid Type "${typ}". Expected code | ui | image | text | other.`);
          }
        } else if (/^-\s+Status:\s*/i.test(line)) {
          const st = line.replace(/^-\s+Status:\s*/i, '').trim().toLowerCase() as any;
          if (VALID_STATUSES.includes(st)) {
            currentStep.status = st;
          } else {
            errors.push(`Step ${currentStep.number} (${currentBranch.name}) invalid Status "${st}". Expected todo | in_progress | done | blocked.`);
          }
        }
      }
    }
  }

  if (currentBranch) {
    if (currentStep) {
      finalizeStep(currentStep, currentBranch, errors);
    }
    finalizeBranch(currentBranch, branches, errors);
  }

  if (branches.length === 0) {
    errors.push('Plan must define at least one Branch with "## Branch: <name> (role: <role>)".');
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? { version, goal, branches } : undefined
  };
}

function finalizeStep(step: Partial<StepData>, branch: Partial<BranchData>, errors: string[]) {
  if (!step.description) {
    errors.push(`Step ${step.number || '?'} in branch "${branch.name}" is missing "- Description: <text>".`);
  }
  if (!step.acceptanceCriteria) {
    errors.push(`Step ${step.number || '?'} in branch "${branch.name}" is missing "- Acceptance criteria: <text>".`);
  }
  if (!step.complexity) {
    errors.push(`Step ${step.number || '?'} in branch "${branch.name}" is missing valid "- Complexity: low|medium|high".`);
  }
  if (!step.type) {
    errors.push(`Step ${step.number || '?'} in branch "${branch.name}" is missing valid "- Type: code|ui|image|text|other".`);
  }
  if (!step.status) {
    errors.push(`Step ${step.number || '?'} in branch "${branch.name}" is missing valid "- Status: todo|in_progress|done|blocked".`);
  }
  if (branch.steps) {
    branch.steps.push(step as StepData);
  }
}

function finalizeBranch(branch: Partial<BranchData>, branches: BranchData[], errors: string[]) {
  if (!branch.branchGoal) {
    errors.push(`Branch "${branch.name}" is missing "Branch goal: <text>".`);
  }
  if (!branch.steps || branch.steps.length === 0) {
    errors.push(`Branch "${branch.name}" must have at least one step.`);
  }
  branches.push(branch as BranchData);
}
