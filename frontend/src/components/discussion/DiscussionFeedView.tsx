import Glyph from '../Glyph';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MentionTextarea, { MentionText, mentionsInText } from './MentionTextarea';
import DiscussionFiltersBar, { EMPTY_DISCUSSION_FILTERS, countDiscussionFilters, discussionRangeBounds, type DiscussionFilterState } from './DiscussionFilters';
import { createPortal } from 'react-dom';
import Avatar from '../Avatar';
import AppOverflowMenu from '../AppOverflowMenu';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import { usePracticeEntry } from '../../context/PracticeEntryContext';
import type { DiscussionAuthor, DiscussionFeed, DiscussionMention, DiscussionPost, DiscussionReply, DiscussionReportReason } from '../../types';

// One group's discussion, laid out like a chat: oldest at the top, newest at the bottom, the
// composer pinned under it, replies shown as a quote of the post they answer. Older messages load
// as you scroll up. Shared by the participant (My Group → Discussion), the group's support, and
// the read-only hub lead / admin group view. What each viewer can do comes from
// feed.access / canPost / canModerate plus which actions the page passes in.

export interface DiscussionActions {
  post?: (body: string, mentions: DiscussionMention[]) => Promise<void>;
  reply?: (postId: string, body: string, mentions: DiscussionMention[]) => Promise<void>;
  like?: (postId: string, like: boolean) => Promise<void>;
  deleteOwn?: (kind: 'POST' | 'REPLY', id: string) => Promise<void>;
  report?: (postId: string, reason: DiscussionReportReason) => Promise<void>;
  pin?: (postId: string, pin: boolean) => Promise<void>;
  moderate?: (kind: 'POST' | 'REPLY', id: string, action: 'KEEP' | 'REMOVE') => Promise<void>;
}

interface DiscussionFeedViewProps {
  feed: DiscussionFeed;
  actions: DiscussionActions;
  /** Re-fetch the first page after any change. */
  onChanged: () => Promise<void> | void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** Kept for callers; the chat composer has no avatar. */
  viewerName?: string;
  viewerAvatarUrl?: string | null;
}

const REPORT_REASONS: Array<{ value: DiscussionReportReason; label: string }> = [
  { value: 'SPAM', label: 'Spam or selling' },
  { value: 'UNKIND', label: 'Unkind or offensive' },
  { value: 'OFF_TOPIC', label: 'Not about FOF' },
  { value: 'OTHER', label: 'Something else' },
];
const reasonLabel = (reason: DiscussionReportReason) => REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;

// Older pages are fetched while filters are on, so results are not limited to what is on screen.
// 10 pages of 30 posts is far more than a group writes in a cohort.
const MAX_FILTER_PAGES = 10;
// A message this close to the one before it, from the same person, shares its name and photo.
const GROUP_GAP_MS = 5 * 60 * 1000;

const clockTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
const dayKey = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const dayLabel = (at: number): string => {
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (dayKey(at) === dayKey(today.getTime())) return 'Today';
  if (dayKey(at) === dayKey(yesterday.getTime())) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(new Date(at).getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
};

// "Chioma Eze" → "Chioma E." for participants; supports keep their full name.
const displayName = (name: string, kind: 'SUPPORT' | 'PARTICIPANT') => {
  if (kind === 'SUPPORT') return name;
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0] || name;
};

const snippetOf = (post: DiscussionPost, canModerate: boolean): string => {
  if (post.removed && !canModerate) return 'This post was removed';
  const text = (post.body ?? '').replace(/\s+/g, ' ').trim();
  return text || 'Post';
};

// Swipe right on a message (like WhatsApp) to reply to it with its
// author tagged. Only a clear sideways drag counts, so scrolling still works.
const SWIPE_TRIGGER = 56;
const useSwipeToReply = (onSwipe: (() => void) | undefined) => {
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);
  const [dx, setDx] = useState(0);
  const reset = () => { start.current = null; axis.current = null; setDx(0); };
  if (!onSwipe) return { dx: 0, handlers: {} };
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      start.current = { x: e.clientX, y: e.clientY };
      axis.current = null;
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current) return;
      const mx = e.clientX - start.current.x;
      const my = e.clientY - start.current.y;
      if (!axis.current) {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.5) {
          axis.current = 'h';
          try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* not all pointers can be captured */ }
        } else if (Math.abs(my) > 10) {
          axis.current = 'v';
        }
      }
      if (axis.current === 'h') setDx(Math.max(0, Math.min(80, mx)));
    },
    onPointerUp: () => { if (axis.current === 'h' && dx >= SWIPE_TRIGGER) onSwipe(); reset(); },
    onPointerCancel: reset,
    style: { touchAction: 'pan-y' } as React.CSSProperties,
  };
  return { dx, handlers };
};

// The little reply arrow that shows while swiping.
const SwipeHint: React.FC<{ dx: number }> = ({ dx }) => (dx > 0 ? (
  <span aria-hidden="true" className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-lg text-primary" style={{ opacity: Math.min(1, dx / SWIPE_TRIGGER) }}>↩</span>
) : null);

const RemovedNote: React.FC<{ original?: string | null; compact?: boolean }> = ({ original, compact }) => (
  <div className={`rounded-2xl border border-dashed border-gray-300 bg-white/60 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
    <p className="text-[14px] font-semibold text-gray-600">This post was removed</p>
    <p className="text-[13px] text-gray-500">It didn't follow the community guidelines.</p>
    {original && <p className="mt-2 border-t border-gray-100 pt-2 text-[13px] italic text-gray-400">Only you can see this: {original}</p>}
  </div>
);

// One line in the chat: a post, or a reply (shown with a quote of the post it answers).
interface ChatMessage {
  key: string;
  kind: 'POST' | 'REPLY';
  /** The post itself, or the post this reply belongs to. */
  post: DiscussionPost;
  item: DiscussionReply;
  at: number;
}

interface ReplyTarget {
  post: DiscussionPost;
  author: DiscussionAuthor;
  /** The "@Name " added to the draft for this reply, taken out again if the reply is cancelled. */
  autoTag: string | null;
}

const DiscussionFeedView: React.FC<DiscussionFeedViewProps> = ({ feed, actions, onChanged, onLoadMore, loadingMore }) => {
  const [draft, setDraft] = useState('');
  const [draftMentions, setDraftMentions] = useState<DiscussionMention[]>([]);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; confirmText: string; run: () => Promise<void> }>(null);
  const [filters, setFilters] = useState<DiscussionFilterState>(EMPTY_DISCUSSION_FILTERS);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  // Older pages load on scroll only once the chat has settled at the bottom (or the reader moved).
  const [armed, setArmed] = useState(false);
  // The Practice button floats above the bottom bar on a phone, so the composer sits above it.
  const practiceOn = !!usePracticeEntry()?.on;
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const topSentinel = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const anchor = useRef<{ height: number; y: number } | null>(null);
  // Older pages read so far for the current filters (state, so the 'Searching…' line follows it).
  const [autoLoads, setAutoLoads] = useState(0);

  const canPost = feed.canPost && !!actions.post;
  // On a phone the round Need support button floats over the bottom right corner. While the message box is showing, lift
  // that button above it so the box (and its send button) can use the full width instead of leaving a gap on the right.
  useEffect(() => {
    if (!canPost) return undefined;
    document.body.style.setProperty('--fof-fab-raise', `calc(env(safe-area-inset-bottom, 0px) + ${practiceOn ? 168 : 112}px)`);
    return () => { document.body.style.removeProperty('--fof-fab-raise'); };
  }, [canPost, practiceOn]);
  const canReply = feed.canPost && !!actions.reply;
  const canModerate = feed.canModerate && !!actions.moderate;
  const reported = useMemo(() => new Map(feed.openReports.map((r) => [r.postId, r])), [feed.openReports]);

  const run = async (fn: () => Promise<void>, doneNotice?: string) => {
    setError('');
    try {
      await fn();
      await onChanged();
      if (doneNotice) setNotice(doneNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  // Every post and reply in time order. The pinned post is shown on its own at the top, but the
  // replies to it still belong in the conversation.
  const messages = useMemo<ChatMessage[]>(() => {
    const list: ChatMessage[] = [];
    const add = (post: DiscussionPost, withPost: boolean) => {
      if (withPost) list.push({ key: `POST:${post.id}`, kind: 'POST', post, item: post, at: new Date(post.createdAt).getTime() });
      post.replies.forEach((reply) => list.push({ key: `REPLY:${reply.id}`, kind: 'REPLY', post, item: reply, at: new Date(reply.createdAt).getTime() }));
    };
    feed.posts.forEach((post) => add(post, true));
    if (feed.pinned) add(feed.pinned, false);
    return list.sort((a, b) => (a.at - b.at) || (a.kind === b.kind ? 0 : a.kind === 'POST' ? -1 : 1));
  }, [feed.posts, feed.pinned]);

  const filterCount = countDiscussionFilters(filters);
  const filtering = filterCount > 0;

  const people = useMemo(() => {
    const seen = new Map<string, { value: string; label: string; meta?: string }>();
    (feed.members ?? []).forEach((m) => seen.set(`${m.kind}:${m.id}`, { value: `${m.kind}:${m.id}`, label: m.name, meta: m.kind === 'SUPPORT' ? 'Support' : undefined }));
    const authors = [...messages.map((m) => m.item.author), ...(feed.pinned ? [feed.pinned.author] : [])];
    authors.forEach((a) => { const key = `${a.kind}:${a.id}`; if (!seen.has(key)) seen.set(key, { value: key, label: a.name, meta: a.kind === 'SUPPORT' ? 'Support' : undefined }); });
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [feed.members, feed.pinned, messages]);

  const visible = useMemo(() => {
    if (!filtering) return messages;
    const q = filters.q.trim().toLowerCase();
    const { from, to } = discussionRangeBounds(filters);
    return messages.filter((m) => {
      if (filters.mine && !m.item.isMine) return false;
      if (filters.person && `${m.item.author.kind}:${m.item.author.id}` !== filters.person) return false;
      if (filters.unreplied && !(m.kind === 'POST' && !m.item.removed && m.post.replies.length === 0)) return false;
      if (from !== null && m.at < from) return false;
      if (to !== null && m.at > to) return false;
      if (q && !`${m.item.body ?? ''} ${m.item.author.name}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [messages, filters, filtering]);

  // Pinned post follows the same filters (it is always loaded, however old).
  const pinnedShown = useMemo(() => {
    const p = feed.pinned;
    if (!p) return null;
    if (!filtering) return p;
    const q = filters.q.trim().toLowerCase();
    const { from, to } = discussionRangeBounds(filters);
    const at = new Date(p.createdAt).getTime();
    if (filters.mine && !p.isMine) return null;
    if (filters.person && `${p.author.kind}:${p.author.id}` !== filters.person) return null;
    if (filters.unreplied && (p.removed || p.replies.length > 0)) return null;
    if (from !== null && at < from) return null;
    if (to !== null && at > to) return null;
    if (q && !`${p.body ?? ''} ${p.author.name}`.toLowerCase().includes(q)) return null;
    return p;
  }, [feed.pinned, filters, filtering]);

  // ---- Scrolling: the page scrolls, the newest message sits at the bottom. ----
  const scrollToBottom = useCallback((smooth = false) => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Open at the latest message. The page's own "start every page at the top" and late layout
  // (photos, the banner above) move things just after this mounts, so it lands a few times,
  // until the reader scrolls themselves.
  useLayoutEffect(() => { scrollToBottom(); }, [scrollToBottom]);
  useEffect(() => {
    let stopped = false;
    const stop = () => { stopped = true; setArmed(true); };
    const timers = [60, 250, 600, 1200].map((ms) => window.setTimeout(() => { if (!stopped) scrollToBottom(); }, ms));
    timers.push(window.setTimeout(() => setArmed(true), 1500));
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('pointerdown', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('wheel', stop);
      window.removeEventListener('pointerdown', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, [scrollToBottom]);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const near = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 160;
      nearBottom.current = near;
      setAtBottom((prev) => (prev === near ? prev : near));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);

  // A new message at the bottom (someone posted, or you did) follows if you were already at the bottom.
  const lastKey = visible[visible.length - 1]?.key;
  const lastMine = visible[visible.length - 1]?.item.isMine;
  const prevLastKey = useRef(lastKey);
  useLayoutEffect(() => {
    if (prevLastKey.current !== undefined && lastKey !== prevLastKey.current && (nearBottom.current || lastMine)) scrollToBottom();
    prevLastKey.current = lastKey;
  }, [lastKey, lastMine, scrollToBottom]);

  // Older messages arriving at the top must not move what you are reading.
  const firstKey = visible[0]?.key;
  useLayoutEffect(() => {
    if (!anchor.current) return;
    const { height, y } = anchor.current;
    anchor.current = null;
    window.scrollTo({ top: y + (document.documentElement.scrollHeight - height) });
  }, [firstKey]);
  useEffect(() => { if (!loadingMore) anchor.current = null; }, [loadingMore]);

  const loadOlder = useCallback(() => {
    if (!onLoadMore) return;
    anchor.current = { height: document.documentElement.scrollHeight, y: window.scrollY };
    onLoadMore();
  }, [onLoadMore]);

  // Infinite scroll: reaching the top loads the page before it.
  useEffect(() => {
    const el = topSentinel.current;
    if (!el || !armed || !feed.hasMore || !onLoadMore || loadingMore || filtering) return undefined;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadOlder(); }, { rootMargin: '300px 0px 0px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [armed, feed.hasMore, onLoadMore, loadingMore, filtering, loadOlder, feed.posts.length]);

  // With filters on, keep reading older pages (up to a cap) so results are not limited to what is loaded.
  // Every change to the filters gets a fresh allowance.
  const filterSig = JSON.stringify(filters);
  useEffect(() => { setAutoLoads(0); }, [filterSig]);
  useEffect(() => {
    if (!filtering) return;
    if (feed.hasMore && onLoadMore && !loadingMore && autoLoads < MAX_FILTER_PAGES) {
      setAutoLoads((n) => n + 1);
      onLoadMore();
    }
  }, [filtering, feed.hasMore, onLoadMore, loadingMore, feed.posts.length, autoLoads]);
  const searchingOlder = filtering && feed.hasMore && autoLoads < MAX_FILTER_PAGES;

  // ---- Composer ----
  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      const el = composerRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };

  // Aim the composer at a post, tagging the person swiped on (not yourself).
  const startReply = (post: DiscussionPost, author: DiscussionAuthor, isMine: boolean) => {
    if (!canReply || post.removed) return;
    if (replyTarget?.autoTag) {
      const old = replyTarget.autoTag;
      setDraft((prev) => prev.replace(old, ''));
      setDraftMentions((prev) => prev.filter((m) => `@${m.name} ` !== old));
    }
    let autoTag: string | null = null;
    if (!isMine) {
      const tag = `@${author.name} `;
      if (!draft.includes(tag.trim())) {
        autoTag = tag;
        setDraft((prev) => tag + prev);
        setDraftMentions((prev) => (prev.some((m) => m.kind === author.kind && m.id === author.id) ? prev : [...prev, { kind: author.kind, id: author.id, name: author.name }]));
      }
    }
    setReplyTarget({ post, author, autoTag });
    focusComposer();
  };

  const cancelReply = () => {
    if (replyTarget?.autoTag) {
      const old = replyTarget.autoTag;
      setDraft((prev) => prev.replace(old, ''));
      setDraftMentions((prev) => prev.filter((m) => `@${m.name} ` !== old));
    }
    setReplyTarget(null);
  };

  // The box grows with what is typed, up to a few lines.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const submit = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    const target = replyTarget;
    await run(async () => {
      const mentions = mentionsInText(draft, draftMentions);
      if (target && actions.reply) await actions.reply(target.post.id, draft, mentions);
      else if (actions.post) await actions.post(draft, mentions);
      setDraft('');
      setDraftMentions([]);
      setReplyTarget(null);
    });
    setPosting(false);
    scrollToBottom(true);
  };

  // ---- Per message actions ----
  const toggleLike = async (post: DiscussionPost) => {
    if (!actions.like) return;
    const now = likes[post.id] ?? post.likedByMe;
    setLikes((prev) => ({ ...prev, [post.id]: !now }));
    try {
      await actions.like(post.id, !now);
    } catch {
      setLikes((prev) => ({ ...prev, [post.id]: now }));
    }
  };

  const jumpTo = (key: string) => {
    const el = messageRefs.current.get(key);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashKey(key);
    window.setTimeout(() => setFlashKey((current) => (current === key ? null : current)), 1400);
  };

  const menuFor = (msg: ChatMessage) => {
    const { item, post } = msg;
    const items: Array<{ label: string; onClick: () => void; tone?: 'default' | 'danger' | 'muted' }> = [];
    if (canReply && !post.removed) items.push({ label: 'Reply', onClick: () => startReply(post, item.author, item.isMine) });
    if (item.body && !item.removed) items.push({ label: 'Copy text', onClick: () => { void navigator.clipboard?.writeText(item.body ?? '').then(() => setNotice('Copied.')).catch(() => {}); } });
    if (msg.kind === 'POST') {
      if (canModerate && actions.pin && !post.removed) {
        items.push(post.pinned
          ? { label: 'Unpin', onClick: () => void run(() => actions.pin!(post.id, false)) }
          : { label: 'Pin to top', onClick: () => void run(() => actions.pin!(post.id, true), 'Pinned to the top.') });
      }
      if (canModerate && reported.has(post.id)) {
        items.push({ label: 'Keep post', onClick: () => void run(() => actions.moderate!('POST', post.id, 'KEEP'), 'Kept. The report is closed.') });
      }
      if (post.isMine && actions.deleteOwn) {
        items.push({ label: 'Delete', tone: 'danger', onClick: () => setConfirm({ title: 'Delete this post?', message: 'It and its replies will disappear for everyone.', confirmText: 'Delete', run: () => actions.deleteOwn!('POST', post.id) }) });
      } else if (canModerate && !post.removed) {
        items.push({ label: 'Remove post', tone: 'danger', onClick: () => setConfirm({ title: 'Remove this post?', message: "The group will see “This post was removed. It didn't follow the community guidelines.” It won't say who removed it.", confirmText: 'Remove', run: () => actions.moderate!('POST', post.id, 'REMOVE') }) });
      }
      if (!post.isMine && !post.removed && actions.report && feed.access === 'PARTICIPANT') {
        items.push({ label: 'Report post', tone: 'muted', onClick: () => setReportFor(post.id) });
      }
    } else if (item.isMine && actions.deleteOwn) {
      items.push({ label: 'Delete', tone: 'danger', onClick: () => setConfirm({ title: 'Delete this reply?', message: 'It will disappear for everyone.', confirmText: 'Delete', run: () => actions.deleteOwn!('REPLY', item.id) }) });
    } else if (canModerate && !item.removed) {
      items.push({ label: 'Remove reply', tone: 'danger', onClick: () => setConfirm({ title: 'Remove this reply?', message: "The group will see that a reply was removed. It won't say who removed it.", confirmText: 'Remove', run: () => actions.moderate!('REPLY', item.id, 'REMOVE') }) });
    }
    return items;
  };

  const bubbleProps = (msg: ChatMessage, showHeader: boolean) => ({
    msg,
    showHeader,
    feed,
    canModerate,
    canReply,
    canLike: feed.canPost && !!actions.like && !msg.post.removed,
    reportCount: reported.get(msg.post.id)?.count ?? 0,
    menuItems: menuFor(msg),
    liked: likes[msg.post.id] ?? msg.post.likedByMe,
    likeDelta: (likes[msg.post.id] ?? msg.post.likedByMe) === msg.post.likedByMe ? 0 : (likes[msg.post.id] ? 1 : -1),
    flash: flashKey === msg.key,
    onToggleLike: () => void toggleLike(msg.post),
    onReply: () => startReply(msg.post, msg.item.author, msg.item.isMine),
    onJump: () => jumpTo(`POST:${msg.post.id}`),
    refCallback: (el: HTMLElement | null) => { if (el) messageRefs.current.set(msg.key, el); else messageRefs.current.delete(msg.key); },
  });

  const firstReport = feed.openReports[0];
  const empty = !feed.pinned && messages.length === 0;

  // Day dividers and which messages carry the sender's name and photo.
  const rows: React.ReactNode[] = [];
  visible.forEach((msg, i) => {
    const prev = visible[i - 1];
    if (!prev || dayKey(prev.at) !== dayKey(msg.at)) {
      rows.push(<div key={`day-${msg.key}`} className="my-2 flex justify-center"><span className="rounded-full bg-black/5 px-3 py-1 text-[11.5px] font-semibold text-gray-500">{dayLabel(msg.at)}</span></div>);
    }
    const sameSender = !!prev && dayKey(prev.at) === dayKey(msg.at)
      && prev.item.author.id === msg.item.author.id && prev.item.author.kind === msg.item.author.kind
      && msg.at - prev.at < GROUP_GAP_MS && msg.post.kind !== 'INTRO' && !msg.item.removed && !prev.item.removed;
    rows.push(<MessageBubble key={msg.key} {...bubbleProps(msg, !sameSender)} />);
  });

  return (
    <div className="flex min-h-[55dvh] flex-col gap-3" style={{ overflowAnchor: 'none' }}>
      {canModerate && firstReport && (
        <button
          type="button"
          onClick={() => { const key = `POST:${firstReport.postId}`; messageRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFlashKey(key); }}
          className="flex items-center gap-3 rounded-[20px] bg-red-100/80 px-4 py-3 text-left text-red-700"
        >
          <Glyph name="flag" className="h-5 w-5" />
          <span className="min-w-0 flex-1 text-[14px]">
            <b>{feed.openReports.length === 1 ? '1 post reported' : `${feed.openReports.length} posts reported`}</b>
            {' · '}“{reasonLabel(firstReport.reasons[0])}”
          </span>
          <span className="text-[14px] font-bold">Review</span>
        </button>
      )}

      <DiscussionFiltersBar
        value={filters}
        onChange={setFilters}
        people={people}
        searching={searchingOlder}
        summary={`${visible.length + (pinnedShown ? 1 : 0)} of ${messages.length + (feed.pinned ? 1 : 0)} messages${feed.hasMore ? ' loaded' : ''}${feed.hasMore && !searchingOlder ? '. Older ones were not searched.' : ''}`}
      />

      {error && <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      {notice && (
        <button type="button" onClick={() => setNotice('')} className="rounded-2xl bg-emerald-100/80 px-4 py-2.5 text-left text-sm text-emerald-700">{notice}</button>
      )}

      {pinnedShown && <MessageBubble {...bubbleProps({ key: `POST:${pinnedShown.id}`, kind: 'POST', post: pinnedShown, item: pinnedShown, at: new Date(pinnedShown.createdAt).getTime() }, true)} pinned />}

      <div ref={topSentinel} aria-hidden="true" className="h-px" />
      {feed.hasMore && onLoadMore && !filtering && (
        <div className="flex justify-center py-1">
          {loadingMore
            ? <span className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading older messages…</span>
            : <button type="button" onClick={loadOlder} className="rounded-full bg-black/5 px-4 py-1.5 text-[12.5px] font-semibold text-gray-600">Show older messages</button>}
        </div>
      )}

      <div className="flex flex-col gap-1">{rows}</div>

      {empty && (
        <p className="py-8 text-center text-[14px] text-gray-400">
          {canPost ? 'No posts yet. Say hello to your group.' : 'No posts yet.'}
        </p>
      )}
      {!empty && filtering && visible.length === 0 && !pinnedShown && !searchingOlder && (
        <p className="py-8 text-center text-[14px] text-gray-400">Nothing matches these filters.</p>
      )}

      {/* Pinned under the messages: the page scrolls, this stays in view above the bottom bar on a phone. */}
      {canPost && (
        <div className={`sticky ${practiceOn ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+140px)]' : 'bottom-[calc(env(safe-area-inset-bottom,0px)+84px)]'} z-30 -mx-4 mt-auto border-t border-black/5 bg-white/85 px-3 pb-2.5 pt-2 backdrop-blur-xl sm:-mx-6 lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border`}>
          {!atBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              aria-label="Jump to the latest message"
              className="absolute -top-12 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full bg-white text-gray-600 shadow-[0_6px_18px_-6px_rgba(17,24,39,0.35)]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="m6 9 6 6 6-6" /></svg>
            </button>
          )}
          {replyTarget && (
            <div className="mb-2 flex items-start gap-2 rounded-xl border-l-[3px] border-primary bg-primary/5 py-1.5 pl-2.5 pr-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-primary">Replying to {displayName(replyTarget.author.name, replyTarget.author.kind)}</p>
                <p className="truncate text-[12.5px] text-gray-500">{snippetOf(replyTarget.post, canModerate)}</p>
              </div>
              <button type="button" onClick={cancelReply} aria-label="Cancel reply" className="grid h-6 w-6 flex-none place-items-center rounded-full text-gray-400 hover:bg-black/5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <MentionTextarea
              textareaRef={composerRef}
              value={draft}
              onChange={setDraft}
              mentions={draftMentions}
              onMentionsChange={setDraftMentions}
              members={feed.members ?? []}
              rows={1}
              placeholder={replyTarget ? 'Write a reply…' : 'Message your group…'}
              className="block max-h-[120px] min-h-[40px] w-full resize-none rounded-[20px] border border-gray-200 bg-white px-3.5 py-2 text-[15px] leading-snug outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={posting || !draft.trim()}
              aria-label={replyTarget ? 'Send reply' : 'Send message'}
              className="grid h-10 w-10 flex-none place-items-center rounded-full bg-primary text-white disabled:opacity-50"
            >
              {posting ? <Spinner className="h-4 w-4" /> : <svg className="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.01 6.53L15 12 3.39 13.87l.01 6.53Z" /></svg>}
            </button>
          </div>
        </div>
      )}

      {reportFor && actions.report && (
        <ReportSheet
          onClose={() => setReportFor(null)}
          onSend={async (reason) => {
            const postId = reportFor;
            setReportFor(null);
            await run(() => actions.report!(postId, reason), "Thanks for letting us know. Your support will take a look. The person won't know who reported it.");
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); if (c) void run(c.run); }}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmText={confirm?.confirmText}
        type="danger"
      />
    </div>
  );
};

interface MessageBubbleProps {
  msg: ChatMessage;
  showHeader: boolean;
  feed: DiscussionFeed;
  canModerate: boolean;
  canReply: boolean;
  canLike: boolean;
  reportCount: number;
  menuItems: Array<{ label: string; onClick: () => void; tone?: 'default' | 'danger' | 'muted' }>;
  liked: boolean;
  likeDelta: number;
  flash: boolean;
  pinned?: boolean;
  onToggleLike: () => void;
  onReply: () => void;
  onJump: () => void;
  refCallback: (el: HTMLElement | null) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, showHeader, feed, canModerate, canReply, canLike, reportCount, menuItems, liked, likeDelta, flash, pinned, onToggleLike, onReply, onJump, refCallback }) => {
  const { item, post } = msg;
  const isPost = msg.kind === 'POST';
  const mine = item.isMine;
  const swipe = useSwipeToReply(canReply && !item.removed && !post.removed ? onReply : undefined);

  // Participants see a removed message only as the neutral note.
  if (item.removed && !canModerate) {
    return <div ref={refCallback} className="flex"><div className="ml-8 max-w-[85%]"><RemovedNote compact /></div></div>;
  }

  const isIntro = isPost && post.kind === 'INTRO';
  const likeCount = post.likeCount + likeDelta;
  const showLike = isPost && !item.removed && (canLike || likeCount > 0);
  const bubbleTone = pinned
    ? 'border border-amber-200 bg-amber-50/80'
    : mine ? 'bg-primary/10' : 'bg-white';

  return (
    <div
      ref={refCallback}
      {...swipe.handlers}
      className={`relative flex items-end gap-1.5 rounded-2xl transition-colors ${mine && !pinned ? 'justify-end' : ''} ${flash ? 'bg-primary/10' : ''} ${showHeader ? 'mt-1.5' : ''}`}
    >
      <SwipeHint dx={swipe.dx} />
      {!mine && !pinned && (
        <div className="w-6 flex-none self-start">
          {showHeader && <Avatar name={item.author.name} avatarUrl={item.author.avatarUrl} size="xs" enlargeable />}
        </div>
      )}
      <div
        style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined}
        className={`min-w-0 ${pinned ? 'w-full' : 'max-w-[86%]'} rounded-[18px] px-3 py-1.5 shadow-[0_1px_1px_rgba(17,24,39,0.06)] ${bubbleTone} ${swipe.dx ? '' : 'transition-transform'}`}
      >
        {pinned && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.04em] text-amber-700"><Glyph name="pin" className="mr-1 inline h-3 w-3 align-text-bottom" />Pinned by {post.pinnedByName || feed.supportName || 'your support'}</p>
        )}
        {isIntro && !item.removed && <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Introduction</p>}
        {(showHeader || pinned) && (!mine || pinned) && (
          <div className="flex flex-wrap items-center gap-1.5 pr-5">
            <span className="text-[13px] font-bold text-gray-900">{displayName(item.author.name, item.author.kind)}</span>
            {item.author.kind === 'SUPPORT' && <span className="rounded-full bg-violet-100/80 px-1.5 py-px text-[10.5px] font-semibold text-violet-700">Support</span>}
            {isIntro && item.author.kind === 'PARTICIPANT' && item.author.gender && <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[10.5px] font-semibold text-neutral-600">{item.author.gender}</span>}
          </div>
        )}
        {canModerate && (reportCount > 0 || item.removed) && (
          <div className="flex gap-1.5">
            {reportCount > 0 && <span className="rounded-full bg-red-100/80 px-1.5 py-px text-[10.5px] font-bold uppercase text-red-700">Reported</span>}
            {item.removed && <span className="rounded-full bg-neutral-100 px-1.5 py-px text-[10.5px] font-bold uppercase text-neutral-600">Removed</span>}
          </div>
        )}

        {!isPost && (
          <button type="button" onClick={onJump} className="mt-0.5 block w-full rounded-lg border-l-[3px] border-primary/70 bg-black/[0.04] py-1 pl-2 pr-2 text-left">
            <span className="block truncate text-[11.5px] font-bold text-primary">{displayName(post.author.name, post.author.kind)}</span>
            <span className="block truncate text-[12.5px] text-gray-500">{snippetOf(post, canModerate)}</span>
          </button>
        )}

        <div className="mt-0.5">
          {item.removed
            ? <RemovedNote original={item.body} compact />
            : <p className="whitespace-pre-wrap break-words text-[14.5px] leading-snug text-gray-900"><MentionText text={item.body ?? ''} mentions={item.mentions} /></p>}
        </div>

        <div className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-gray-400">
          {showLike && (
            <button
              type="button"
              onClick={onToggleLike}
              disabled={!canLike}
              aria-pressed={liked}
              className={`mr-auto inline-flex min-h-[24px] items-center gap-1 ${liked ? 'text-rose-500' : ''} disabled:cursor-default`}
            >
              <span aria-hidden="true" className="text-[13px] leading-none">{liked ? '♥' : '♡'}</span>
              {likeCount > 0 && <span className="font-semibold">{likeCount}</span>}
              <span className="sr-only">{liked ? 'Unlike' : 'Like'}</span>
            </button>
          )}
          <span>{clockTime(item.createdAt)}</span>
          {menuItems.length > 0 && <AppOverflowMenu items={menuItems} compact />}
        </div>
      </div>
    </div>
  );
};

// Bottom sheet with the four report reasons (portal: the page shell traps fixed overlays).
const ReportSheet: React.FC<{ onClose: () => void; onSend: (reason: DiscussionReportReason) => Promise<void> }> = ({ onClose, onSend }) => {
  const [reason, setReason] = useState<DiscussionReportReason | null>(null);
  const [sending, setSending] = useState(false);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Report post" className="w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[17px] font-bold text-gray-900">Report post</h2>
        <p className="mt-1 text-[13px] text-gray-500">Your support will see this. The person who posted won't know it was you.</p>
        <div className="mt-4 flex flex-col gap-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              aria-pressed={reason === r.value}
              className={`flex min-h-[48px] items-center justify-between rounded-2xl px-4 text-left text-[15px] ${reason === r.value ? 'bg-primary/10 font-semibold text-gray-900 ring-2 ring-primary/40' : 'bg-gray-50 text-gray-700'}`}
            >
              {r.label}
              {reason === r.value && <span aria-hidden="true" className="text-primary">✓</span>}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={onClose} className="min-h-[48px] flex-1 rounded-full bg-[#f2f2f4] text-sm font-semibold text-gray-700">Cancel</button>
          <button
            type="button"
            disabled={!reason || sending}
            onClick={async () => { if (!reason) return; setSending(true); await onSend(reason); setSending(false); }}
            className="min-h-[48px] flex-1 rounded-full bg-primary text-sm font-semibold text-white disabled:opacity-60"
          >
            {sending ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span> : 'Send report'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DiscussionFeedView;
