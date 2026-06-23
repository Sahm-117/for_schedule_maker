import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppData } from '../context/AppDataContext';
import { notificationsApi } from '../services/api';
import type { Notification } from '../types';

// Relative "time ago" for the feed rows (e.g. "3m", "2h", "Yesterday").
const timeAgo = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const NotificationBell: React.FC = () => {
  const { notifications, notificationUnreadCount, markNotificationsRead } = useAppData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Position the panel under the bell (portal'd to body so no clipping ancestor).
  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(380, window.innerWidth - 24);
      let left = rect.right - width;
      if (left < 12) left = 12;
      setMenuStyle({ position: 'fixed', top: rect.bottom + 8, left, width, zIndex: 120 });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
  };

  const handleRowClick = (n: Notification) => {
    setOpen(false);
    if (!n.isRead) void notificationsApi.markRead(n.id).catch(() => {});
    if (n.path) navigate(n.path);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative grid h-10 w-10 place-items-center rounded-2xl border border-orange-100 bg-white text-gray-500 transition hover:bg-orange-50"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {notificationUnreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div ref={menuRef} style={menuStyle} className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3">
            <p className="text-sm font-bold text-gray-900">Notifications</p>
            {notifications.some((n) => !n.isRead) && (
              <button type="button" onClick={() => void markNotificationsRead()} className="text-xs font-semibold text-primary hover:opacity-80">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-orange-50">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(n)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-orange-50/40 ${n.isRead ? '' : 'bg-orange-50/60'}`}
                    >
                      <span className="flex items-center gap-2">
                        {!n.isRead && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
                        <span className="truncate text-sm font-semibold text-gray-900">{n.title}</span>
                      </span>
                      <span className="text-xs leading-snug text-gray-600">{n.body}</span>
                      <span className="mt-0.5 text-[11px] text-gray-400">{timeAgo(n.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default NotificationBell;
