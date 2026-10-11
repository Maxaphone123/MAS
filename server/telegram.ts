import fs from 'fs';
import path from 'path';
import { getPlansIndex, getPlanContent, getAllBranchStates } from './storage.js';
import { runAllBranches, runBranchSteps, requestStop, isRunnerActive } from './branchRunner.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const TG_FILE = path.join(DATA_DIR, 'telegram.json');

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  notifyOnStepDone: boolean;
  notifyOnBlocked: boolean;
  notifyOnDirective: boolean;
}

let pollingInterval: NodeJS.Timeout | null = null;
let lastUpdateId = 0;

export function getTelegramConfig(): TelegramConfig {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const defaultCfg: TelegramConfig = {
    enabled: false,
    botToken: '',
    chatId: '',
    notifyOnStepDone: true,
    notifyOnBlocked: true,
    notifyOnDirective: true
  };
  if (!fs.existsSync(TG_FILE)) {
    fs.writeFileSync(TG_FILE, JSON.stringify(defaultCfg, null, 2), 'utf8');
    return defaultCfg;
  }
  try {
    return { ...defaultCfg, ...JSON.parse(fs.readFileSync(TG_FILE, 'utf8')) };
  } catch {
    return defaultCfg;
  }
}

export function saveTelegramConfig(cfg: TelegramConfig) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(TG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  restartTelegramService();
}

export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled || !cfg.botToken || !cfg.chatId) {
    return { ok: false, error: 'Telegram is not configured or disabled.' };
  }

  try {
    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description || 'Telegram API error' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error reaching Telegram' };
  }
}

// Command dispatcher
async function processTelegramCommand(text: string): Promise<string> {
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const args = text.trim().split(' ').slice(1).join(' ').trim();

  if (cmd === '/start' || cmd === '/help') {
    return `🤖 <b>Orchestrator Agent Bot</b>\n\nAvailable commands:\n• <code>/status</code> — Current execution & model stats\n• <code>/plan</code> — Current project goal & branches\n• <code>/branches</code> — List branch progress\n• <code>/run all</code> — Execute all branches\n• <code>/run &lt;slug&gt;</code> — Execute single branch\n• <code>/stop</code> — Stop active execution`;
  }

  if (cmd === '/status') {
    const pIdx = getPlansIndex();
    const branches = getAllBranchStates();
    const running = isRunnerActive();
    const totalDone = branches.reduce((acc, b) => acc + b.steps.filter((s) => s.status === 'done').length, 0);
    const totalSteps = branches.reduce((acc, b) => acc + b.steps.length, 0);
    const blockedCount = branches.filter((b) => b.steps.some((s) => s.status === 'blocked')).length;

    return `📊 <b>Orchestrator Status:</b>\n• Plan Version: <b>v${pIdx.currentVersion}</b>\n• Runner Status: <b>${running ? '⚙️ RUNNING' : '⏸ IDLE'}</b>\n• Progress: <b>${totalDone} / ${totalSteps} steps completed</b>\n• Blocked Branches: <b>${blockedCount}</b>`;
  }

  if (cmd === '/plan') {
    const pIdx = getPlansIndex();
    if (pIdx.currentVersion === 0) return 'No plan created yet.';
    const raw = getPlanContent(pIdx.currentVersion) || 'Empty plan';
    const firstLines = raw.split('\n').slice(0, 15).join('\n');
    return `📋 <b>Plan v${pIdx.currentVersion} Overview:</b>\n<pre>${firstLines}</pre>`;
  }

  if (cmd === '/branches') {
    const branches = getAllBranchStates();
    if (branches.length === 0) return 'No active branches found.';
    const lines = branches.map((b) => {
      const done = b.steps.filter((s) => s.status === 'done').length;
      const isBlocked = b.steps.some((s) => s.status === 'blocked');
      const icon = isBlocked ? '🔴' : done === b.steps.length ? '🟢' : '🟡';
      return `${icon} <b>${b.name}</b> (${b.role}): ${done}/${b.steps.length} done`;
    });
    return `🌳 <b>Branches Overview:</b>\n${lines.join('\n')}`;
  }

  if (cmd === '/run') {
    if (args.toLowerCase() === 'all' || !args) {
      runAllBranches().catch(console.error);
      return '🚀 Started executing all branches sequentially!';
    }
    const branches = getAllBranchStates();
    const target = branches.find((b) => b.slug.toLowerCase() === args.toLowerCase() || b.name.toLowerCase() === args.toLowerCase());
    if (!target) {
      return `❌ Branch "${args}" not found. Available: ${branches.map((b) => b.slug).join(', ')}`;
    }
    runBranchSteps(target.slug).catch(console.error);
    return `🚀 Started executing branch "${target.name}"!`;
  }

  if (cmd === '/stop') {
    requestStop();
    return '🛑 Stop signal sent to branch runners.';
  }

  return `Unknown command: ${cmd}. Type /help for list.`;
}

// Telegram polling worker
export function restartTelegramService() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  const cfg = getTelegramConfig();
  if (!cfg.enabled || !cfg.botToken) return;

  pollingInterval = setInterval(async () => {
    try {
      const url = `https://api.telegram.org/bot${cfg.botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=2`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          const msg = update.message;
          if (msg && msg.text && msg.text.startsWith('/')) {
            const reply = await processTelegramCommand(msg.text);
            await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: msg.chat.id,
                text: reply,
                parse_mode: 'HTML'
              })
            });
          }
        }
      }
    } catch {}
  }, 5000);
}
