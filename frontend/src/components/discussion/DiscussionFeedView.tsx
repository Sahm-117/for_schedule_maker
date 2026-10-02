import Glyph from '../Glyph';
import React, { useRef, useState } from 'react';
import MentionTextarea, { MentionText, mentionsInText } from './MentionTextarea';
import { createPortal } from 'react-dom';
import Avatar from '../Avatar';
import AppOverflowMenu from '../AppOverflowMenu';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import type { DiscussionAuthor, DiscussionFeed, DiscussionMention, DiscussionPost, DiscussionReply, DiscussionReportReason } from '../../types';

// One group's discussion: composer, pinned post, posts with likes and replies.
// Shared by the participant (My Group → Discussion), the group's support, and
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
  /** Name for the composer's avatar (the viewer). */
  viewerName: string;
  viewerAvatarUrl?: string | null;
}

const CARD = 'rounded-[22px] bg-white p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.14)]';

const REPORT_REASONS: Array<{ value: DiscussionReportReason; label: string }> = [
  { value: 'SPAM', label: 'Spam or selling' },
  { value: 'UNKIND', label: 'Unkind or offensive' },
  { value: 'OFF_TOPIC', label: 'Not about FOF' },
  { value: 'OTHER', label: 'Something else' },
];
const reasonLabel = (reason: DiscussionReportReason) => REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;

// Relative "time ago" (same wording as the bell: "3m ago", "2h ago", "Yesterday").
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

// "Chioma Eze" → "Chioma E." for participants; supports keep their full name.
const displayName = (name: string, kind: 'SUPPORT' | 'PARTICIPANT') => {
  if (kind === 'SUPPORT') return name;
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1].charAt(0)}.` : parts[0] || name;
};

// Swipe right on a post or reply (like WhatsApp) to reply to it with its
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
  <div className={`rounded-2xl border border-dashed border-gray-300 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
    <p className="text-[14px] font-semibold text-gray-600">This post was removed</p>
    <p className="text-[13px] text-gray-500">It didn't follow the community guidelines.</p>
    {original && <p className="mt-2 border-t border-gray-100 pt-2 text-[13px] italic text-gray-400">Only you can see this: {original}</p>}
  </div>
);

const DiscussionFeedView: React.FC<DiscussionFeedViewProps> = ({ feed, actions, onChanged, onLoadMore, loadingMore, viewerName, viewerAvatarUrl }) => {
  const [draft, setDraft] = useState('');
  const [draftMentions, setDraftMentions] = useState<DiscussionMention[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; confirmText: string; run: () => Promise<void> }>(null);
  const postRefs = useRef(new Map<string, HTMLElement>());

  const canPost = feed.canPost && !!actions.post;
  const canModerate = feed.canModerate && !!actions.moderate;
  const reported = new Map(feed.openReports.map((r) => [r.postId, r]));

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

  const submitPost = async () => {
    if (!draft.trim() || !actions.post) return;
    setPosting(true);
    await run(async () => { await actions.post!(draft, mentionsInText(draft, draftMentions)); setDraft(''); setDraftMentions([]); setComposerOpen(false); });
    setPosting(false);
  };

  const menuFor = (post: DiscussionPost) => {
    const items: Array<{ label: string; onClick: () => void; tone?: 'default' | 'danger' | 'muted' }> = [];
    if (post.body) items.push({ label: 'Copy text', onClick: () => { void navigator.clipboard?.writeText(post.body ?? '').then(() => setNotice('Copied.')).catch(() => {}); } });
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
    return items;
  };

  const renderPost = (post: DiscussionPost) => (
    <PostCard
      key={post.id}
      post={post}
      feed={feed}
      actions={actions}
      canModerate={canModerate}
      reportCount={reported.get(post.id)?.count ?? 0}
      menuItems={menuFor(post)}
      run={run}
      onConfirm={setConfirm}
      viewerName={viewerName}
      viewerAvatarUrl={viewerAvatarUrl}
      refCallback={(el) => { if (el) postRefs.current.set(post.id, el); else postRefs.current.delete(post.id); }}
    />
  );

  const firstReport = feed.openReports[0];
  const empty = !feed.pinned && feed.posts.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {canModerate && firstReport && (
        <button
          type="button"
          onClick={() => postRefs.current.get(firstReport.postId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="flex items-center gap-3 rounded-[20px] bg-red-100/80 px-4 py-3.5 text-left text-red-700"
        >
          <Glyph name="flag" className="h-5 w-5" />
          <span className="min-w-0 flex-1 text-[14px]">
            <b>{feed.openReports.length === 1 ? '1 post reported' : `${feed.openReports.length} posts reported`}</b>
            {' · '}“{reasonLabel(firstReport.reasons[0])}”
          </span>
          <span className="text-[14px] font-bold">Review</span>
        </button>
      )}

      {canPost && (
        <section className={CARD}>
          {composerOpen ? (
            <div className="flex flex-col gap-3">
              <MentionTextarea
                autoFocus
                value={draft}
                onChange={setDraft}
                mentions={draftMentions}
                onMentionsChange={setDraftMentions}
                members={feed.members ?? []}
                rows={3}
                placeholder="Share something with your group… Type @ to tag someone"
                className="w-full resize-none rounded-2xl border border-gray-200 px-3.5 py-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-2.5">
                <button type="button" onClick={() => { setComposerOpen(false); setDraft(''); setDraftMentions([]); }} className="min-h-[44px] flex-1 rounded-full bg-[#f2f2f4] px-4 text-sm font-semibold text-gray-700">Cancel</button>
                <button type="button" onClick={() => void submitPost()} disabled={posting || !draft.trim()} className="min-h-[44px] flex-1 rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {posting ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Posting…</span> : 'Post'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setComposerOpen(true)} className="flex w-full items-center gap-3 text-left">
              <Avatar name={viewerName} avatarUrl={viewerAvatarUrl} size="sm" />
              <span className="text-[15px] text-gray-400">Share something with your group…</span>
            </button>
          )}
        </section>
      )}

      {error && <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
      {notice && (
        <button type="button" onClick={() => setNotice('')} className="rounded-2xl bg-emerald-100/80 px-4 py-2.5 text-left text-sm text-emerald-700">{notice}</button>
      )}

      {feed.pinned && renderPost(feed.pinned)}
      {feed.posts.map(renderPost)}

      {empty && (
        <p className="py-8 text-center text-[14px] text-gray-400">
          {canPost ? 'No posts yet. Say hello to your group.' : 'No posts yet.'}
        </p>
      )}

      {feed.hasMore && onLoadMore && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="mx-auto min-h-[44px] rounded-full bg-[#f2f2f4] px-5 text-sm font-semibold text-gray-700 disabled:opacity-60">
          {loadingMore ? <span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Loading…</span> : 'Show older posts'}
        </button>
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

interface PostCardProps {
  post: DiscussionPost;
  feed: DiscussionFeed;
  actions: DiscussionActions;
  canModerate: boolean;
  reportCount: number;
  menuItems: Array<{ label: string; onClick: () => void; tone?: 'default' | 'danger' | 'muted' }>;
  run: (fn: () => Promise<void>, doneNotice?: string) => Promise<void>;
  onConfirm: (c: { title: string; message: string; confirmText: string; run: () => Promise<void> }) => void;
  viewerName: string;
  viewerAvatarUrl?: string | null;
  refCallback: (el: HTMLElement | null) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, feed, actions, canModerate, reportCount, menuItems, run, onConfirm, viewerName, viewerAvatarUrl, refCallback }) => {
  const [open, setOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [replyMentions, setReplyMentions] = useState<DiscussionMention[]>([]);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState<boolean | null>(null);
  const likedNow = liked ?? post.likedByMe;
  const likeCount = post.likeCount + (liked === null ? 0 : (liked ? 1 : 0) - (post.likedByMe ? 1 : 0));
  const canInteract = feed.canPost && !post.removed;

  // Open the reply box, tagging the person swiped on (not yourself).
  const replyTo = (author: DiscussionAuthor, isMine: boolean) => {
    setOpen(true);
    if (!isMine && !replyMentions.some((m) => m.kind === author.kind && m.id === author.id)) {
      const tag = `@${author.name} `;
      setReplyDraft((prev) => (prev.includes(tag.trim()) ? prev : tag + prev));
      setReplyMentions((prev) => [...prev, { kind: author.kind, id: author.id, name: author.name }]);
    }
    requestAnimationFrame(() => {
      const el = replyRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  };
  const swipe = useSwipeToReply(canInteract && actions.reply ? () => replyTo(post.author, post.isMine) : undefined);

  // Participants see a removed post only as the neutral note.
  if (post.removed && !canModerate) {
    return <section ref={refCallback}><RemovedNote /></section>;
  }

  const toggleLike = async () => {
    if (!actions.like) return;
    const next = !likedNow;
    setLiked(next); // show it straight away
    try {
      await actions.like(post.id, next);
    } catch {
      setLiked(!next);
    }
  };

  const sendReply = async () => {
    if (!replyDraft.trim() || !actions.reply) return;
    setSending(true);
    await run(async () => { await actions.reply!(post.id, replyDraft, mentionsInText(replyDraft, replyMentions)); setReplyDraft(''); setReplyMentions([]); });
    setSending(false);
  };

  const isIntro = post.kind === 'INTRO';
  const replyCount = post.replies.length;
  const pinnedStyle = post.pinned ? 'border border-amber-200 bg-amber-50/70' : 'bg-white';

  return (
    <section ref={refCallback} {...swipe.handlers} className={`relative rounded-[22px] p-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.14)] ${pinnedStyle}`}>
      <SwipeHint dx={swipe.dx} />
      <div style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined} className={swipe.dx ? '' : 'transition-transform'}>
      {post.pinned && (
        <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.04em] text-amber-700"><Glyph name="pin" className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />Pinned by {post.pinnedByName || feed.supportName || 'your support'}</p>
      )}
      {isIntro && !post.removed && <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Introduction</p>}
      <div className="flex items-start gap-3">
        <Avatar name={post.author.name} avatarUrl={post.author.avatarUrl} size={isIntro && !post.removed ? 'lg' : 'sm'} enlargeable />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${isIntro ? 'text-[17px]' : 'text-[15px]'} font-bold text-gray-900`}>{displayName(post.author.name, post.author.kind)}</span>
            {post.author.kind === 'SUPPORT' && <span className="rounded-full bg-violet-100/80 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Support</span>}
            {isIntro && post.author.kind === 'PARTICIPANT' && post.author.gender && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{post.author.gender}</span>}
            {canModerate && reportCount > 0 && <span className="rounded-full bg-red-100/80 px-2 py-0.5 text-[11px] font-bold uppercase text-red-700">Reported</span>}
            {canModerate && post.removed && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold uppercase text-neutral-600">Removed</span>}
          </div>
          <p className="text-[13px] text-gray-400">{timeAgo(post.createdAt)}</p>
        </div>
        {menuItems.length > 0 && <AppOverflowMenu items={menuItems} />}
      </div>

      <div className="mt-3">
        {post.removed ? <RemovedNote original={post.body} /> : <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-900"><MentionText text={post.body ?? ''} mentions={post.mentions} /></p>}
      </div>

      {!post.removed && (
        <div className="mt-3 flex items-center gap-5 text-[14px] text-gray-500">
          <button
            type="button"
            onClick={() => void toggleLike()}
            disabled={!canInteract || !actions.like}
            aria-pressed={likedNow}
            className={`inline-flex min-h-[36px] items-center gap-1.5 ${likedNow ? 'text-rose-500' : ''} disabled:cursor-default`}
          >
            <span aria-hidden="true">{likedNow ? '♥' : '♡'}</span>
            {likeCount > 0 && likeCount}
            <span className="sr-only">{likedNow ? 'Unlike' : 'Like'}</span>
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex min-h-[36px] items-center gap-1.5">
            <Glyph name="chat" className="h-4 w-4" />
            {replyCount === 0 ? (canInteract ? 'Reply' : 'No replies') : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
          </button>
        </div>
      )}

      {open && !post.removed && (
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3">
          {post.replies.map((reply) => (
            <ReplyRow
              key={reply.id}
              reply={reply}
              canModerate={canModerate}
              onSwipe={canInteract && actions.reply ? () => replyTo(reply.author, reply.isMine) : undefined}
              onDelete={reply.isMine && actions.deleteOwn ? () => onConfirm({ title: 'Delete this reply?', message: 'It will disappear for everyone.', confirmText: 'Delete', run: () => actions.deleteOwn!('REPLY', reply.id) }) : undefined}
              onRemove={canModerate && !reply.isMine && !reply.removed ? () => onConfirm({ title: 'Remove this reply?', message: "The group will see that a reply was removed. It won't say who removed it.", confirmText: 'Remove', run: () => actions.moderate!('REPLY', reply.id, 'REMOVE') }) : undefined}
            />
          ))}
          {canInteract && actions.reply && (
            <div className="flex items-end gap-2">
              <Avatar name={viewerName} avatarUrl={viewerAvatarUrl} size="xs" />
              <MentionTextarea
                textareaRef={replyRef}
                value={replyDraft}
                onChange={setReplyDraft}
                mentions={replyMentions}
                onMentionsChange={setReplyMentions}
                members={feed.members ?? []}
                rows={1}
                placeholder="Write a reply…"
                className="block min-h-[40px] w-full resize-none rounded-2xl border border-gray-200 px-3 py-2 text-[14px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button type="button" onClick={() => void sendReply()} disabled={sending || !replyDraft.trim()} className="min-h-[40px] rounded-full bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
                {sending ? <Spinner className="h-3.5 w-3.5" /> : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
      </div>
    </section>
  );
};

const ReplyRow: React.FC<{ reply: DiscussionReply; canModerate: boolean; onSwipe?: () => void; onDelete?: () => void; onRemove?: () => void }> = ({ reply, canModerate, onSwipe, onDelete, onRemove }) => {
  const swipe = useSwipeToReply(reply.removed ? undefined : onSwipe);
  if (reply.removed && !canModerate) {
    return <RemovedNote compact />;
  }
  const items = [
    ...(onDelete ? [{ label: 'Delete', tone: 'danger' as const, onClick: onDelete }] : []),
    ...(onRemove ? [{ label: 'Remove reply', tone: 'danger' as const, onClick: onRemove }] : []),
  ];
  return (
    <div {...swipe.handlers} className="relative flex items-start gap-2.5">
      <SwipeHint dx={swipe.dx} />
      <Avatar name={reply.author.name} avatarUrl={reply.author.avatarUrl} size="xs" enlargeable />
      <div style={swipe.dx ? { transform: `translateX(${swipe.dx}px)` } : undefined} className={`min-w-0 flex-1 rounded-2xl bg-gray-50 px-3.5 py-2.5 ${swipe.dx ? '' : 'transition-transform'}`}>
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-gray-900">{displayName(reply.author.name, reply.author.kind)}</span>
          <span className="text-[12px] text-gray-400">· {timeAgo(reply.createdAt)}</span>
        </div>
        {reply.removed ? <RemovedNote original={reply.body} compact /> : <p className="whitespace-pre-wrap break-words text-[14px] text-gray-800"><MentionText text={reply.body ?? ''} mentions={reply.mentions} /></p>}
      </div>
      {items.length > 0 && <AppOverflowMenu items={items} />}
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
