import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const NOTIF_FILE = path.join(DATA_DIR, 'notifications.json');

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

let notifications: AppNotification[] = [];

export function initNotifications() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(NOTIF_FILE)) {
    fs.writeFileSync(NOTIF_FILE, JSON.stringify([], null, 2), 'utf8');
  }
  try {
    notifications = JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8') || '[]');
  } catch {
    notifications = [];
  }
}

export function getNotifications(): AppNotification[] {
  initNotifications();
  return notifications;
}

export function addNotification(notif: Omit<AppNotification, 'id' | 'time' | 'read'>): AppNotification {
  initNotifications();
  const item: AppNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: new Date().toISOString(),
    read: false,
    ...notif
  };
  notifications.unshift(item);
  // Keep last 100
  notifications = notifications.slice(0, 100);
  try {
    fs.writeFileSync(NOTIF_FILE, JSON.stringify(notifications, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save notification:', err);
  }
  return item;
}

export function markAllNotificationsRead() {
  initNotifications();
  notifications.forEach((n) => (n.read = true));
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(notifications, null, 2), 'utf8');
}

export function clearNotifications() {
  initNotifications();
  notifications = [];
  fs.writeFileSync(NOTIF_FILE, JSON.stringify([], null, 2), 'utf8');
}
