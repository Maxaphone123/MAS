import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

export interface AuthConfig {
  enabled: boolean;
  passwordHash?: string;
  salt?: string;
}

const activeSessions = new Set<string>();

export function getAuthConfig(): AuthConfig {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const defaultCfg: AuthConfig = { enabled: false };
  if (!fs.existsSync(AUTH_FILE)) {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(defaultCfg, null, 2), 'utf8');
    return defaultCfg;
  }
  try {
    return { ...defaultCfg, ...JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) };
  } catch {
    return defaultCfg;
  }
}

export function saveAuthConfig(cfg: AuthConfig) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

export function setupAuth(password: string): boolean {
  if (!password || password.length < 4) return false;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  saveAuthConfig({
    enabled: true,
    passwordHash,
    salt
  });
  return true;
}

export function disableAuth(): boolean {
  saveAuthConfig({ enabled: false });
  activeSessions.clear();
  return true;
}

export function verifyLogin(password: string): { ok: boolean; token?: string } {
  const cfg = getAuthConfig();
  if (!cfg.enabled) {
    // If not enabled, login is automatic
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    return { ok: true, token };
  }

  if (!cfg.passwordHash || !cfg.salt) {
    return { ok: false };
  }

  const testHash = hashPassword(password, cfg.salt);
  if (testHash === cfg.passwordHash) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);
    return { ok: true, token };
  }

  return { ok: false };
}

export function verifySessionToken(token: string): boolean {
  const cfg = getAuthConfig();
  if (!cfg.enabled) return true;
  return activeSessions.has(token);
}

export function revokeSessionToken(token: string) {
  activeSessions.delete(token);
}

// Express auth middleware
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const cfg = getAuthConfig();
  if (!cfg.enabled) return next();

  // Whitelisted endpoints
  const whitelist = [
    '/api/health',
    '/api/auth/status',
    '/api/auth/login',
    '/api/auth/setup',
    '/api/project/preview' // sandboxed iframe assets
  ];

  if (whitelist.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.headers['x-auth-token'] as string);

  if (token && verifySessionToken(token)) {
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required. Please log in with your master PIN/password.'
  });
}
