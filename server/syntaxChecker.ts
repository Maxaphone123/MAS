import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { PROJECT_DIR, getProjectFilesMap } from './storage.js';

export interface StaticCheckProblem {
  file: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
}

export interface IntegrationReviewReport {
  timestamp: string;
  totalFiles: number;
  hasIndexHtml: boolean;
  score: number; // 0 to 100
  passed: boolean;
  staticProblems: StaticCheckProblem[];
  brokenReferences: Array<{ fromFile: string; referencedPath: string }>;
  syntaxProblems: Array<{ file: string; error: string }>;
  suggestedDirectives: Array<{ branch: string; suggestion: string }>;
  localRunChecks: {
    enabled: boolean;
    executedFiles: number;
    errors: Array<{ file: string; error: string }>;
  };
}

export function runProjectIntegrationReview(allowLocalRun = true): IntegrationReviewReport {
  const map = getProjectFilesMap();
  const filePaths = Object.keys(map);
  const staticProblems: StaticCheckProblem[] = [];
  const brokenReferences: Array<{ fromFile: string; referencedPath: string }> = [];
  const syntaxProblems: Array<{ file: string; error: string }> = [];
  const localRunErrors: Array<{ file: string; error: string }> = [];

  const hasIndexHtml = filePaths.includes('index.html');
  if (!hasIndexHtml) {
    staticProblems.push({
      file: 'project root',
      severity: 'high',
      message: 'Missing entrypoint index.html in project root.'
    });
  }

  let checkedCodeFiles = 0;

  for (const relPath of filePaths) {
    const fullPath = path.join(PROJECT_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue;

    // 1. JSON check
    if (relPath.endsWith('.json')) {
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        JSON.parse(raw);
      } catch (err: any) {
        staticProblems.push({
          file: relPath,
          severity: 'high',
          message: `JSON syntax error: ${err.message}`
        });
        syntaxProblems.push({ file: relPath, error: err.message });
      }
    }

    // 2. JavaScript / TypeScript syntax check (Stage 7B: Node --check)
    if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) {
      checkedCodeFiles++;
      try {
        const res = spawnSync('node', ['--check', fullPath], { encoding: 'utf8', timeout: 5000 });
        if (res.status !== 0) {
          const errMsg = (res.stderr || res.stdout || 'Syntax check failed').trim();
          syntaxProblems.push({ file: relPath, error: errMsg.slice(0, 200) });
          staticProblems.push({
            file: relPath,
            severity: 'high',
            message: `JavaScript syntax error: ${errMsg.split('\n')[0]}`
          });
        }
      } catch (e: any) {
        localRunErrors.push({ file: relPath, error: e.message });
      }
    }

    // 3. CSS basic syntax validation (bracket pairing)
    if (relPath.endsWith('.css')) {
      try {
        const css = fs.readFileSync(fullPath, 'utf8');
        let braces = 0;
        for (const char of css) {
          if (char === '{') braces++;
          if (char === '}') braces--;
          if (braces < 0) break;
        }
        if (braces !== 0) {
          staticProblems.push({
            file: relPath,
            severity: 'medium',
            message: 'Unbalanced braces in CSS stylesheet.'
          });
        }
      } catch {}
    }

    // 4. HTML reference check
    if (relPath.endsWith('.html')) {
      try {
        const html = fs.readFileSync(fullPath, 'utf8');

        // Check <script src="...">
        const scriptMatches = html.matchAll(/src=["']([^"']+)["']/gi);
        for (const match of scriptMatches) {
          const src = match[1];
          if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//') && !src.startsWith('data:')) {
            const cleanSrc = src.replace(/^\/+/, '');
            if (!filePaths.includes(cleanSrc) && !cleanSrc.startsWith('api/')) {
              brokenReferences.push({ fromFile: relPath, referencedPath: cleanSrc });
            }
          }
        }

        // Check <link href="...">
        const linkMatches = html.matchAll(/href=["']([^"']+)["']/gi);
        for (const match of linkMatches) {
          const href = match[1];
          if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('data:')) {
            const cleanHref = href.replace(/^\/+/, '');
            if (!filePaths.includes(cleanHref) && !cleanHref.startsWith('api/')) {
              brokenReferences.push({ fromFile: relPath, referencedPath: cleanHref });
            }
          }
        }
      } catch (err: any) {
        staticProblems.push({
          file: relPath,
          severity: 'medium',
          message: `HTML inspection error: ${err.message}`
        });
      }
    }
  }

  // Generate suggested directives to specific owner branches
  const suggestedDirectives: Array<{ branch: string; suggestion: string }> = [];

  if (!hasIndexHtml) {
    const owner = filePaths.some(p => map[p]?.ownerBranch === 'UI') ? 'UI' : 'Core';
    suggestedDirectives.push({
      branch: owner,
      suggestion: 'Create an index.html entrypoint for the application with standard HTML5 layout and style links.'
    });
  }

  for (const ref of brokenReferences) {
    const owner = map[ref.fromFile]?.ownerBranch || 'UI';
    suggestedDirectives.push({
      branch: owner,
      suggestion: `Fix missing asset or file reference "${ref.referencedPath}" referenced in ${ref.fromFile}.`
    });
  }

  for (const sp of syntaxProblems) {
    const owner = map[sp.file]?.ownerBranch || 'Core';
    suggestedDirectives.push({
      branch: owner,
      suggestion: `Fix syntax errors in ${sp.file}: ${sp.error.slice(0, 100)}`
    });
  }

  const highCount = staticProblems.filter(p => p.severity === 'high').length;
  const medCount = staticProblems.filter(p => p.severity === 'medium').length;
  const score = Math.max(0, 100 - highCount * 25 - medCount * 10 - brokenReferences.length * 15);
  const passed = score >= 75 && highCount === 0;

  return {
    timestamp: new Date().toISOString(),
    totalFiles: filePaths.length,
    hasIndexHtml,
    score,
    passed,
    staticProblems,
    brokenReferences,
    syntaxProblems,
    suggestedDirectives,
    localRunChecks: {
      enabled: allowLocalRun,
      executedFiles: checkedCodeFiles,
      errors: localRunErrors
    }
  };
}
