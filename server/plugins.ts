import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PLUGINS_FILE = path.join(DATA_DIR, 'plugins.json');

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  targetRoles: Array<'planning' | 'code' | 'ui' | 'images' | 'review'>;
  instructions: string;
  enabled: boolean;
  isBuiltin: boolean;
}

const BUILTIN_PLUGINS: PluginItem[] = [
  {
    id: 'pack-fullstack',
    name: 'Fullstack Web & TypeScript Pack',
    description: 'Enforces modern TypeScript, React, Tailwind CSS, and strict type safety.',
    targetRoles: ['code', 'ui', 'planning'],
    instructions: `FULLSTACK WEB PACK GUIDELINES:
- Use clean TypeScript with explicit types; avoid 'any'.
- Use Tailwind CSS for utility-first styling with high-contrast, modern aesthetics.
- Ensure all relative script and asset links in HTML point to valid files.
- Favor component modularity and clear state lifecycles.`,
    enabled: true,
    isBuiltin: true
  },
  {
    id: 'pack-python-data',
    name: 'Python & Data Science Pack',
    description: 'Guidelines for Python scripts, data processing, and statistical algorithms.',
    targetRoles: ['code', 'planning'],
    instructions: `PYTHON & DATA PACK GUIDELINES:
- Write idiomatic Python (PEP 8) with type annotations.
- Include docstrings explaining input arguments and return structures.
- Validate dataset integrity and handle missing values gracefully.`,
    enabled: false,
    isBuiltin: true
  },
  {
    id: 'pack-canvas-games',
    name: 'Canvas & 2D/3D Games Pack',
    description: 'Instruction pack for HTML5 Canvas, smooth animation loops, and games.',
    targetRoles: ['code', 'ui'],
    instructions: `CANVAS & GAMES PACK GUIDELINES:
- Implement delta-time (dt) based animation using requestAnimationFrame.
- Support responsive viewport resizing without aspect ratio distortion.
- Provide keyboard, mouse, and touch event handlers.`,
    enabled: false,
    isBuiltin: true
  },
  {
    id: 'pack-api-microservices',
    name: 'API & Microservices Architecture',
    description: 'Robust RESTful API design, consistent error envelopes, and schema validation.',
    targetRoles: ['code', 'planning', 'review'],
    instructions: `API ARCHITECTURE PACK GUIDELINES:
- Return consistent JSON response envelopes: { ok: true, data: ... } or { ok: false, error: ... }.
- Use proper HTTP status codes (200, 201, 400, 401, 404, 500).
- Sanitize input parameters and validate JSON request bodies.`,
    enabled: false,
    isBuiltin: true
  },
  {
    id: 'pack-minimalist-mvp',
    name: 'Minimalist Lean MVP Pack',
    description: 'Prioritizes minimal complexity, clean single-file structures, and zero bloat.',
    targetRoles: ['planning', 'code', 'ui'],
    instructions: `MINIMALIST MVP GUIDELINES:
- Keep the implementation as concise and direct as possible.
- Avoid unnecessary abstractions or excessive dependencies.
- Make code self-contained and immediately executable.`,
    enabled: false,
    isBuiltin: true
  }
];

export function getPlugins(): PluginItem[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PLUGINS_FILE)) {
    fs.writeFileSync(PLUGINS_FILE, JSON.stringify(BUILTIN_PLUGINS, null, 2), 'utf8');
    return BUILTIN_PLUGINS;
  }
  try {
    const custom: PluginItem[] = JSON.parse(fs.readFileSync(PLUGINS_FILE, 'utf8') || '[]');
    // Ensure all built-in plugins exist in the array
    const merged = [...custom];
    for (const b of BUILTIN_PLUGINS) {
      if (!merged.some((p) => p.id === b.id)) {
        merged.push(b);
      }
    }
    return merged;
  } catch {
    return BUILTIN_PLUGINS;
  }
}

export function savePlugins(list: PluginItem[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(PLUGINS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

export function getEnrichedSystemPrompt(basePrompt: string, role: string): string {
  const plugins = getPlugins();
  const activeForRole = plugins.filter((p) => p.enabled && p.targetRoles.includes(role as any));
  if (activeForRole.length === 0) return basePrompt;

  const pluginSections = activeForRole
    .map((p) => `--- [Plugin: ${p.name}] ---\n${p.instructions}`)
    .join('\n\n');

  return `${basePrompt}\n\nACTIVE INSTRUCTION PLUGINS:\n${pluginSections}`;
}
