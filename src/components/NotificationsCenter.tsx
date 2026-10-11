import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, CheckCircle2, AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { api } from '../api';
import { AppNotification } from '../types';

interface NotificationsCenterProps {
  onNavigateToTab?: (tab: any) => void;
}

export const NotificationsCenter: React.FC<NotificationsCenterProps> = ({ onNavigateToTab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const list = await api.getNotifications();
      if (Array.isArray(list)) {
        setNotifications(list);
      }
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const handleClearAll = async () => {
    try {
      await api.clearNotifications();
      setNotifications([]);
    } catch {}
  };

  const formatTime = (iso: string) => {
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'just now';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return new Date(iso).toLocaleDateString();
    } catch {
      return '';
    }
  };

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            handleMarkAllRead();
          }
        }}
        className={`relative p-2 rounded-lg transition-colors border ${
          isOpen
            ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border-transparent'
        }`}
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-zinc-950 animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-zinc-200">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.2 rounded-full font-mono">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
                  title="Mark all as read"
                >
                  <Check className="w-3 h-3" />
                  <span>Read all</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-[11px] text-zinc-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                  title="Clear history"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y divide-zinc-800/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No notifications yet. Execution events will appear here in real-time.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 text-xs transition-colors flex items-start gap-2.5 ${
                    item.read ? 'bg-zinc-900/40 opacity-80' : 'bg-zinc-850/80 border-l-2 border-emerald-500'
                  }`}
                >
                  {getIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-medium text-zinc-200 truncate">{item.title}</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {formatTime(item.time)}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 break-words leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-zinc-800/80 bg-zinc-950/60 text-center">
            <span className="text-[10px] text-zinc-500 font-mono">
              Stage 8A • In-App Execution Alerts
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
