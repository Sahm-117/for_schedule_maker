import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { participantAppApi } from '../../services/api';
import Spinner from '../Spinner';
import type { ParticipantNotification } from '../../types';

// Bell for the participant app header. Styled like the staff NotificationBell
// (icon button, orange unread badge, Announcements / Activity tabs opening on
// Activity). Announcements are rows of type ANNOUNCEMENT. Self-contained: fetches its
// own data rather than going through a shared context, since nothing else in
// the participant app needs the notification list.

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

const ParticipantNotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ParticipantNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'announcements' | 'activity'>('activity');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await participantAppApi.getNotifications();
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      // Quiet failure -- the bell just keeps its last known state.
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  // Refresh on mount, coming back into focus, and every 60s.
  useEffect(() => {
    void load();
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { void load(); }, 60000);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [load]);

  // Also refresh whenever the panel opens.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnread(0);
    try {
      await participantAppApi.markNotificationsRead(null);
    } catch {
      // Ignore -- the next refresh reconciles.
    }
  };

  const announcementItems = items.filter((n) => n.type === 'ANNOUNCEMENT');
  const activityItems = items.filter((n) => n.type !== 'ANNOUNCEMENT');
  const visibleItems = tab === 'announcements' ? announcementItems : activityItems;
  const unreadIn = (list: ParticipantNotification[]) => list.filter((n) => !n.readAt).length;

  const handleRowClick = (n: ParticipantNotification) => {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((prev) => Math.max(0, prev - 1));
      void participantAppApi.markNotificationsRead([n.id]).catch(() => {});
    }
    if (n.path) navigate(n.path);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative grid h-10 w-10 flex-none place-items-center rounded-2xl border border-orange-100 bg-white text-gray-500 transition hover:bg-orange-50"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && createPortal(
        <div ref={menuRef} style={menuStyle} className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-orange-100 px-4 pb-2.5 pt-3">
            <p className="text-sm font-bold text-gray-900">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-primary hover:opacity-80">
                Mark all read
              </button>
            )}
          </div>
          <div className="border-b border-orange-100 px-4 pb-2.5">
            <div role="tablist" className="mt-2.5 grid grid-cols-2 gap-1 rounded-xl bg-[#f4f5f7] p-1">
              {([['announcements', 'Announcements', announcementItems], ['activity', 'Activity', activityItems]] as const).map(([key, label, list]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${tab === key ? 'bg-[#3f4757] text-white' : 'text-gray-600'}`}
                >
                  {label}
                  {unreadIn(list) > 0 && <span className={`h-1.5 w-1.5 rounded-full ${tab === key ? 'bg-white' : 'bg-primary'}`} />}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && !loadedOnce.current ? (
              <div className="flex items-center justify-center py-10 text-primary">
                <Spinner className="h-6 w-6" />
              </div>
            ) : visibleItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">{tab === 'announcements' ? 'No announcements yet.' : 'No activity yet.'}</p>
            ) : (
              <ul className="divide-y divide-orange-50">
                {visibleItems.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleRowClick(n)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition hover:bg-orange-50/40 ${n.readAt ? '' : 'bg-orange-50/60'}`}
                    >
                      <span className="flex items-center gap-2">
                        {!n.readAt && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />}
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

export default ParticipantNotificationBell;
