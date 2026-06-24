import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import ConfirmationModal from '../components/ConfirmationModal';
import { hubApi } from '../services/api';
import { supabase } from '../lib/supabase';
import { reconcileById } from '../utils/reconcile';
import { useAuth } from '../hooks/useAuth';
import type { HubTopic } from '../types';

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

interface MentionUser { id: string; name: string; avatarUrl?: string | null; role?: string }

// Resolve @mentions in `text` to users, matched against the known user list.
// Matching against actual names (longest-first) avoids the regex pitfalls of
// multi-word names, punctuation (O'Brien, Anne-Marie), and substring collisions
// (Ann vs Ann Marie). Returns the matched users excluding `excludeId`.
const extractMentionedUsers = (text: string, users: MentionUser[], excludeId: string): MentionUser[] => {
  const lower = text.toLowerCase();
  const seen = new Set<string>();
  const result: MentionUser[] = [];
  const byLongestName = [...users].sort((a, b) => b.name.length - a.name.length);
  for (const u of byLongestName) {
    if (u.id === excludeId || seen.has(u.id)) continue;
    if (lower.includes(`@${u.name.toLowerCase()}`)) { seen.add(u.id); result.push(u); }
  }
  return result;
};

// The recipient's hub route depends on THEIR role, not the sender's current URL.
const hubPathForRole = (role?: string) => (role === 'SUPPORT' ? '/support/hub' : '/hub');


// ── @mention textarea ─────────────────────────────────────────────────────────

const MentionTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  users: MentionUser[];
  disabled?: boolean;
}> = ({ value, onChange, placeholder, rows = 4, className = '', users, disabled }) => {
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const taRef = useRef<HTMLTextAreaElement>(null);

  const filtered = mention
    ? (mention.query === ''
        ? users.slice(0, 8)
        : users.filter((u) => u.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8))
    : [];

  // Position the portal dropdown above the textarea using its bounding rect
  useLayoutEffect(() => {
    if (!mention || !taRef.current) return;
    const r = taRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      left: r.left,
      width: Math.max(r.width, 260),
      bottom: window.innerHeight - r.top + 6,
      zIndex: 9999,
    });
  }, [mention]);

  const handleKey = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const pos = e.target.selectionStart ?? v.length;
    const before = v.slice(0, pos);
    const atIdx = before.lastIndexOf('@');
    // Keep the picker open across spaces so multi-word names (e.g. "John Doe") can
    // be typed and selected. Close once a newline appears or the query gets long
    // enough that it's clearly prose, not a name.
    const query = atIdx === -1 ? '' : before.slice(atIdx + 1);
    if (atIdx !== -1 && !query.includes('\n') && query.length <= 30) {
      setMention({ query, start: atIdx });
    } else {
      setMention(null);
    }
  };

  const insertMention = (name: string) => {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(mention.start + 1 + mention.query.length);
    onChange(`${before}@${name} ${after}`);
    setMention(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const dropdown = mention && filtered.length > 0 ? createPortal(
    <div
      style={dropdownStyle}
      className="max-h-56 overflow-y-auto rounded-2xl border border-orange-100 bg-white shadow-2xl"
    >
      {filtered.map((u) => (
        <button
          key={u.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); insertMention(u.name); }}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-orange-50 first:rounded-t-2xl last:rounded-b-2xl"
        >
          <Avatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
          <span className="font-medium text-gray-800">{u.name}</span>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  const sharedStyle: React.CSSProperties = {
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    lineHeight: '1.5',
    padding: '0.625rem 0.875rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  };

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={taRef}
        value={value}
        onChange={handleKey}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        style={sharedStyle}
        className="w-full resize-none rounded-xl border border-orange-200 bg-white text-gray-800 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
      />
      {dropdown}
    </div>
  );
};

// ── render body with @mentions highlighted ────────────────────────────────────

// Highlight only real @mentions (matched against the known user list, longest
// name first) so we don't greedily swallow the prose that follows an "@".
const BodyText: React.FC<{ text: string; users?: MentionUser[] }> = ({ text, users = [] }) => {
  const names = [...users].map((u) => u.name).sort((a, b) => b.length - a.length);
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const rest = text.slice(i + 1);
      const match = names.find((n) => rest.toLowerCase().startsWith(n.toLowerCase()));
      if (match) {
        nodes.push(<span key={key++} className="font-semibold text-primary">@{text.substr(i + 1, match.length)}</span>);
        i += 1 + match.length;
        continue;
      }
    }
    // accumulate a plain run up to the next '@'
    const nextAt = text.indexOf('@', i + 1);
    const end = nextAt === -1 ? text.length : nextAt;
    nodes.push(text.slice(i, end));
    i = end;
  }
  return <p className="whitespace-pre-wrap text-sm text-gray-700">{nodes}</p>;
};

// ── New topic modal ───────────────────────────────────────────────────────────

const NewTopicModal: React.FC<{
  onClose: () => void;
  onCreated: (topic: HubTopic, body: string) => void;
  authorId: string;
  users: MentionUser[];
}> = ({ onClose, onCreated, authorId, users }) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { topic } = await hubApi.createTopic({ title: title.trim(), body: body.trim(), authorId });
      onCreated(topic, body.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to create topic');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">New topic</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Topic title"
            required
            className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <MentionTextarea
            value={body}
            onChange={setBody}
            placeholder="What's on your mind? Type @ to mention someone…"
            rows={5}
            users={users}
          />
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-orange-50">Cancel</button>
            <button type="submit" disabled={saving || !title.trim() || !body.trim()} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Posting…' : 'Post topic'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

// ── Topic card ────────────────────────────────────────────────────────────────

const TrashIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

const TopicCard: React.FC<{ topic: HubTopic; onClick: () => void; onToggleLike: () => void; onDelete?: () => void }> = ({ topic, onClick, onToggleLike, onDelete }) => (
  <div className="relative rounded-2xl border border-orange-100 bg-white shadow-sm transition hover:shadow-md hover:border-orange-200">
    <button
      type="button"
      onClick={onClick}
      className="w-full p-4 text-left"
    >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-gray-900">{topic.title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{topic.body}</p>
      </div>
      {topic.status === 'CLOSED' && (
        <span className="flex-shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-600">Closed</span>
      )}
    </div>
    <div className="mt-3 flex items-center gap-3">
      <Avatar name={topic.authorName} avatarUrl={topic.authorAvatarUrl} size="xs" />
      <span className="text-xs text-gray-500">{topic.authorName}</span>
      <span className="text-xs text-gray-400">·</span>
      <span className="text-xs text-gray-400">{formatDate(topic.createdAt)}</span>
      <span className="ml-auto flex items-center gap-3 text-xs text-gray-400">
        {/* Thumbs-up: nested inside the card's <button>, so use a role="button"
            span with stopPropagation to avoid invalid nested buttons + opening the topic. */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleLike(); } }}
          aria-pressed={topic.likedByMe}
          aria-label={topic.likedByMe ? 'Remove like' : 'Like'}
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 transition hover:bg-orange-50 ${topic.likedByMe ? 'text-primary' : 'text-gray-400'}`}
        >
          <svg className="h-3.5 w-3.5" fill={topic.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M6.633 10.5a2.25 2.25 0 0 1 .241 1.018c0 .896-.121 1.762-.348 2.586-.146.529-.55.954-1.082 1.073a48.4 48.4 0 0 1-1.084.243M6.633 10.5l-1.024-.13" /></svg>
          {topic.likeCount}
        </span>
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          {topic.commentCount}
        </span>
      </span>
    </div>
    </button>
    {onDelete && (
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete topic" className="absolute right-3 top-3 rounded-full p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
        <TrashIcon />
      </button>
    )}
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'OPEN' | 'CLOSED';

const HubPage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('OPEN');
  const [topics, setTopics] = useState<HubTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const isAdmin = user?.role === 'ADMIN';

  const [listConfirmAction, setListConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const handleDeleteTopicFromList = (topicId: string) => {
    setListConfirmAction({
      title: 'Delete topic',
      message: 'This will permanently delete the topic and all its comments. This cannot be undone.',
      onConfirm: async () => {
        await hubApi.deleteTopic(topicId);
        setTopics((prev) => prev.filter((t) => t.id !== topicId));
      },
    });
  };

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    try {
      const [{ topics: t }, { users: u }] = await Promise.all([
        hubApi.getTopics(status, user?.id),
        hubApi.getUsers(),
      ]);
      setTopics(t);
      setUsers(u);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(tab); }, [tab, load]);

  // Realtime: silently refresh the topic list on any HubTopic or HubComment change.
  // We refetch authoritative counts (rather than doing fragile +1/-1 math, which
  // breaks for DELETE — Postgres default replica identity only sends the PK, so
  // payload.old.topicId is undefined) and reconcile by id so unchanged rows don't
  // re-render / scroll-jump.
  useEffect(() => {
    const refresh = () => hubApi.getTopics(tab, user?.id)
      .then(({ topics: t }) => setTopics((prev) => reconcileById(prev, t)))
      .catch(() => {});
    const channel = supabase
      .channel('hub-topics-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'HubTopic' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'HubComment' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'HubReaction' }, refresh)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [tab, user?.id]);

  // Optimistic thumbs-up toggle; the realtime refresh reconciles authoritative counts.
  const handleToggleLike = useCallback((topicId: string) => {
    if (!user) return;
    setTopics((prev) => prev.map((t) => t.id === topicId
      ? { ...t, likedByMe: !t.likedByMe, likeCount: t.likeCount + (t.likedByMe ? -1 : 1) }
      : t));
    void hubApi.toggleReaction(topicId, user.id).catch(() => {
      // revert on failure
      setTopics((prev) => prev.map((t) => t.id === topicId
        ? { ...t, likedByMe: !t.likedByMe, likeCount: t.likeCount + (t.likedByMe ? 1 : -1) }
        : t));
    });
  }, [user]);

  // The open topic can leave `topics` if another client deletes it or its status
  // moves it off the current tab via realtime — clear the selection instead of crashing.
  const selectedTopic = selectedTopicId ? topics.find((t) => t.id === selectedTopicId) : undefined;
  useEffect(() => {
    if (selectedTopicId && !selectedTopic) setSelectedTopicId(null);
  }, [selectedTopicId, selectedTopic]);

  if (selectedTopicId && selectedTopic) {
    const topic = selectedTopic;
    return (
      <HubTopicView
        topic={topic}
        users={users}
        currentUser={user!}
        onBack={() => setSelectedTopicId(null)}
        onTopicDeleted={(topicId) => {
          setTopics((prev) => prev.filter((t) => t.id !== topicId));
          setSelectedTopicId(null);
        }}
        onTopicUpdated={(updated) => {
          setTopics((prev) => prev.map((t) => t.id === updated.id ? updated : t));
          if (updated.status !== tab) setSelectedTopicId(null);
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Hub"
        subtitle="Share questions, ideas, and updates with everyone."
        action={
          <button
            type="button"
            onClick={() => setNewTopicOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
            New topic
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        {(['OPEN', 'CLOSED'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${tab === t ? 'bg-primary text-white' : 'bg-orange-50 text-gray-600 hover:bg-orange-100'}`}
          >
            {t === 'OPEN' ? 'Open' : 'Closed'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><svg className="h-6 w-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg></div>
      ) : topics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 py-16 text-center text-sm text-gray-400">
          {tab === 'OPEN' ? 'No open topics yet. Start a conversation.' : 'No closed topics.'}
        </div>
      ) : (
        <div className="space-y-3">
          {topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              onClick={() => setSelectedTopicId(topic.id)}
              onToggleLike={() => handleToggleLike(topic.id)}
              onDelete={isAdmin ? () => void handleDeleteTopicFromList(topic.id) : undefined}
            />
          ))}
        </div>
      )}

      {newTopicOpen && user && (
        <NewTopicModal
          authorId={user.id}
          users={users}
          onClose={() => setNewTopicOpen(false)}
          onCreated={(topic, body) => {
            if (tab === 'OPEN') setTopics((prev) => [topic, ...prev]);
            setNewTopicOpen(false);
            setSelectedTopicId(topic.id);
            // notify @mentions in topic body — route each recipient to their own role's hub
            if (user) {
              const entries = extractMentionedUsers(body, users, user.id)
                .map((u) => ({ userId: u.id, title: `${user.name} mentioned you`, body: `In "${topic.title}"`, path: hubPathForRole(u.role) }));
              if (entries.length > 0) void hubApi.sendNotifications(entries);
            }
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!listConfirmAction}
        title={listConfirmAction?.title ?? ''}
        message={listConfirmAction?.message ?? ''}
        confirmText="Delete"
        type="danger"
        onClose={() => setListConfirmAction(null)}
        onConfirm={() => { void listConfirmAction?.onConfirm(); }}
      />
    </div>
  );
};

// ── Topic detail view ─────────────────────────────────────────────────────────

import type { HubComment, HubReply } from '../types';

const HubTopicView: React.FC<{
  topic: HubTopic;
  users: MentionUser[];
  currentUser: { id: string; name: string; avatarUrl?: string | null };
  onBack: () => void;
  onTopicDeleted: (topicId: string) => void;
  onTopicUpdated: (t: HubTopic) => void;
}> = ({ topic, users, currentUser, onBack, onTopicDeleted, onTopicUpdated }) => {
  const [comments, setComments] = useState<HubComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [closingTopic, setClosingTopic] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [replies, setReplies] = useState<Record<string, HubReply[]>>({});
  const [postingReply, setPostingReply] = useState<string | null>(null);

  useEffect(() => {
    hubApi.getComments(topic.id)
      .then(({ comments: c }) => setComments(c))
      .catch(() => {})
      .finally(() => setLoadingComments(false));
  }, [topic.id]);

  const refreshComments = () => hubApi.getComments(topic.id)
    .then(({ comments: fresh }) => setComments(fresh)).catch(() => {});
  const refreshReplies = (commentId: string) => hubApi.getReplies(commentId)
    .then(({ replies: fresh }) => setReplies((r) => ({ ...r, [commentId]: fresh }))).catch(() => {});

  // Realtime: new comments/replies from OTHER clients appear without reload.
  // Self-authored rows are added optimistically, so we ignore our own echoes here
  // to avoid double-counting; fetches run outside the state updaters (updaters
  // must stay pure — they can run twice under StrictMode).
  useEffect(() => {
    const channel = supabase
      .channel(`hub-topic-${topic.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'HubComment', filter: `topicId=eq.${topic.id}` }, (payload) => {
        const row = payload.new as any;
        if (!row?.id || row.authorId === currentUser.id) return; // ignore our own optimistic echo
        setComments((prev) => {
          if (prev.some((c) => c.id === row.id)) return prev;
          // Refetch the joined list once for the new row (side effect lives outside the updater below)
          void refreshComments();
          return prev;
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'HubReply' }, (payload) => {
        const row = payload.new as any;
        const commentId = row?.commentId;
        if (!commentId || row.authorId === currentUser.id) return; // ignore our own optimistic echo
        // Refresh replies if currently expanded, and bump the count by id (deduped).
        setExpandedReplies((prev) => {
          if (prev.has(commentId)) void refreshReplies(commentId);
          return prev;
        });
        setReplies((r) => {
          const list = r[commentId];
          if (list && list.some((x) => x.id === row.id)) return r; // already have it
          return r;
        });
        setComments((prev) => prev.map((c) => {
          if (c.id !== commentId) return c;
          // only count this reply once (the realtime echo for our own reply is filtered above)
          return { ...c, replyCount: c.replyCount + 1 };
        }));
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id, currentUser.id]);

  const roleOf = (userId: string) => users.find((u) => u.id === userId)?.role;

  const notifyMentions = (text: string, excludeId: string) => {
    const entries = extractMentionedUsers(text, users, excludeId)
      .map((u) => ({ userId: u.id, title: `${currentUser.name} mentioned you`, body: `In "${topic.title}"`, path: hubPathForRole(u.role) }));
    if (entries.length > 0) void hubApi.sendNotifications(entries);
  };

  const notifyTopicAuthor = (body: string) => {
    if (topic.authorId === currentUser.id) return;
    void hubApi.sendNotifications([{
      userId: topic.authorId,
      title: `${currentUser.name} commented on your topic`,
      body: `"${topic.title}" — ${body.slice(0, 60)}`,
      path: hubPathForRole(roleOf(topic.authorId)),
    }]);
  };

  const notifyCommentAuthor = (comment: HubComment, replyBody: string) => {
    if (comment.authorId === currentUser.id) return;
    void hubApi.sendNotifications([{
      userId: comment.authorId,
      title: `${currentUser.name} replied to your comment`,
      body: replyBody.slice(0, 80),
      path: hubPathForRole(roleOf(comment.authorId)),
    }]);
  };

  const loadReplies = async (commentId: string) => {
    if (replies[commentId]) return;
    const { replies: r } = await hubApi.getReplies(commentId);
    setReplies((prev) => ({ ...prev, [commentId]: r }));
  };

  const toggleReplies = async (commentId: string) => {
    const next = new Set(expandedReplies);
    if (next.has(commentId)) {
      next.delete(commentId);
    } else {
      next.add(commentId);
      await loadReplies(commentId);
    }
    setExpandedReplies(next);
  };

  const handlePostComment = async () => {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const body = newComment.trim();
      const { comment } = await hubApi.createComment({ topicId: topic.id, body, authorId: currentUser.id });
      setComments((prev) => [...prev, comment]);
      setNewComment('');
      notifyTopicAuthor(body);
      notifyMentions(body, currentUser.id);
    } finally {
      setPostingComment(false);
    }
  };

  const handlePostReply = async (commentId: string) => {
    const text = replyTexts[commentId]?.trim();
    if (!text) return;
    setPostingReply(commentId);
    try {
      const { reply } = await hubApi.createReply({ commentId, body: text, authorId: currentUser.id });
      setReplies((prev) => ({ ...prev, [commentId]: [...(prev[commentId] ?? []), reply] }));
      setReplyTexts((prev) => ({ ...prev, [commentId]: '' }));
      setReplyingTo(null);
      const parentComment = comments.find((c) => c.id === commentId);
      if (parentComment) notifyCommentAuthor(parentComment, text);
      notifyMentions(text, currentUser.id);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, replyCount: c.replyCount + 1 } : c));
    } finally {
      setPostingReply(null);
    }
  };

  const handleToggleClose = async () => {
    setClosingTopic(true);
    try {
      const newStatus = topic.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      const { topic: updated } = await hubApi.setTopicStatus(topic.id, newStatus);
      onTopicUpdated(updated);
      // Notify all unique participants (commenters) except the actor
      const uniqueIds = [...new Set(comments.map((c) => c.authorId).filter((id) => id !== currentUser.id && id !== topic.authorId))];
      const targets = [
        ...(topic.authorId !== currentUser.id ? [topic.authorId] : []),
        ...uniqueIds,
      ];
      if (targets.length > 0) {
        void hubApi.sendNotifications(targets.map((userId) => ({
          userId,
          title: newStatus === 'CLOSED' ? `Topic closed: "${topic.title}"` : `Topic reopened: "${topic.title}"`,
          body: `${currentUser.name} ${newStatus === 'CLOSED' ? 'closed' : 'reopened'} this topic.`,
          path: hubPathForRole(roleOf(userId)),
        })));
      }
    } finally {
      setClosingTopic(false);
    }
  };

  const canClose = currentUser.id === topic.authorId || (currentUser as any).role === 'ADMIN';
  const isAdmin = (currentUser as any).role === 'ADMIN';

  const handleDeleteTopic = () => {
    setConfirmAction({
      title: 'Delete topic',
      message: 'This will permanently delete the topic and all its comments. This cannot be undone.',
      onConfirm: async () => { await hubApi.deleteTopic(topic.id); onTopicDeleted(topic.id); },
    });
  };

  const handleDeleteComment = (commentId: string) => {
    setConfirmAction({
      title: 'Delete comment',
      message: 'This will permanently delete this comment and all its replies.',
      onConfirm: async () => {
        await hubApi.deleteComment(commentId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      },
    });
  };

  const handleDeleteReply = (commentId: string, replyId: string) => {
    setConfirmAction({
      title: 'Delete reply',
      message: 'This will permanently delete this reply.',
      onConfirm: async () => {
        await hubApi.deleteReply(replyId);
        setReplies((prev) => ({ ...prev, [commentId]: (prev[commentId] ?? []).filter((r) => r.id !== replyId) }));
        setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, replyCount: Math.max(0, c.replyCount - 1) } : c));
      },
    });
  };

  // ── edit state ──
  const [editingTopicBody, setEditingTopicBody] = useState(false);
  const [topicBodyDraft, setTopicBodyDraft] = useState(topic.body);
  const [savingTopicEdit, setSavingTopicEdit] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentEdit, setSavingCommentEdit] = useState<string | null>(null);

  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingReplyEdit, setSavingReplyEdit] = useState<string | null>(null);

  const handleSaveTopicEdit = async () => {
    if (!topicBodyDraft.trim()) return;
    setSavingTopicEdit(true);
    try {
      const { topic: updated } = await hubApi.updateTopic(topic.id, topicBodyDraft.trim());
      onTopicUpdated(updated);
      setEditingTopicBody(false);
    } finally { setSavingTopicEdit(false); }
  };

  const handleSaveCommentEdit = async (commentId: string) => {
    const body = commentDrafts[commentId]?.trim();
    if (!body) return;
    setSavingCommentEdit(commentId);
    try {
      const { comment: updated } = await hubApi.updateComment(commentId, body);
      setComments((prev) => prev.map((c) => c.id === commentId ? { ...c, body: updated.body } : c));
      setEditingCommentId(null);
    } finally { setSavingCommentEdit(null); }
  };

  const handleSaveReplyEdit = async (replyId: string, commentId: string) => {
    const body = replyDrafts[replyId]?.trim();
    if (!body) return;
    setSavingReplyEdit(replyId);
    try {
      const { reply: updated } = await hubApi.updateReply(replyId, body);
      setReplies((prev) => ({ ...prev, [commentId]: (prev[commentId] ?? []).map((r) => r.id === replyId ? { ...r, body: updated.body } : r) }));
      setEditingReplyId(null);
    } finally { setSavingReplyEdit(null); }
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        Back to Hub
      </button>

      {/* Topic */}
      <div className="surface-card mb-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={topic.authorName} avatarUrl={topic.authorAvatarUrl} size="sm" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{topic.authorName}</p>
              <p className="text-xs text-gray-400">{formatDate(topic.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${topic.status === 'OPEN' ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
              {topic.status === 'OPEN' ? 'Open' : 'Closed'}
            </span>
            {canClose && (
              <button
                type="button"
                onClick={handleToggleClose}
                disabled={closingTopic}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {closingTopic ? '…' : topic.status === 'OPEN' ? 'Close topic' : 'Reopen'}
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={() => void handleDeleteTopic()} title="Delete topic" className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
          </div>
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">{topic.title}</h1>
        {editingTopicBody ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={topicBodyDraft}
              onChange={(e) => setTopicBodyDraft(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingTopicBody(false); setTopicBodyDraft(topic.body); }} className="rounded-2xl border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={() => void handleSaveTopicEdit()} disabled={savingTopicEdit} className="rounded-2xl bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{savingTopicEdit ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-start gap-2">
            <div className="flex-1"><BodyText text={topic.body} users={users} /></div>
            {currentUser.id === topic.authorId && (
              <button type="button" onClick={() => { setTopicBodyDraft(topic.body); setEditingTopicBody(true); }} className="flex-shrink-0 rounded-full p-1 text-gray-300 hover:text-primary">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="space-y-3">
        {loadingComments ? (
          <div className="flex justify-center py-8"><svg className="h-5 w-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg></div>
        ) : comments.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-4">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="surface-card p-4">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={comment.authorName} avatarUrl={comment.authorAvatarUrl} size="xs" />
                  <span className="text-sm font-semibold text-gray-800">{comment.authorName}</span>
                  <span className="text-xs text-gray-400">{formatDate(comment.createdAt)}</span>
                </div>
                {isAdmin && (
                  <button type="button" onClick={() => void handleDeleteComment(comment.id)} title="Delete comment" className="rounded-full p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
              {editingCommentId === comment.id ? (
                <div className="mt-2 pl-8 space-y-2">
                  <MentionTextarea
                    value={commentDrafts[comment.id] ?? comment.body}
                    onChange={(v) => setCommentDrafts((prev) => ({ ...prev, [comment.id]: v }))}
                    rows={3}
                    users={users}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditingCommentId(null)} className="rounded-2xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={() => void handleSaveCommentEdit(comment.id)} disabled={savingCommentEdit === comment.id} className="rounded-2xl bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{savingCommentEdit === comment.id ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 pl-8"><BodyText text={comment.body} users={users} /></div>
              )}
              <div className="mt-2 pl-8 flex items-center gap-3">
                {comment.replyCount > 0 && (
                  <button type="button" onClick={() => void toggleReplies(comment.id)} className="text-xs text-primary hover:underline">
                    {expandedReplies.has(comment.id) ? 'Hide' : `${comment.replyCount} repl${comment.replyCount === 1 ? 'y' : 'ies'}`}
                  </button>
                )}
                {topic.status === 'OPEN' && (
                  <button type="button" onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-xs text-gray-500 hover:text-primary">
                    Reply
                  </button>
                )}
                {currentUser.id === comment.authorId && editingCommentId !== comment.id && (
                  <>
                    <button type="button" onClick={() => { setCommentDrafts((prev) => ({ ...prev, [comment.id]: comment.body })); setEditingCommentId(comment.id); }} className="text-xs text-gray-400 hover:text-primary">Edit</button>
                    <button type="button" onClick={() => void handleDeleteComment(comment.id)} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
                  </>
                )}
              </div>

              {/* Replies */}
              {expandedReplies.has(comment.id) && (
                <div className="mt-3 ml-8 space-y-2 border-l-2 border-orange-100 pl-3">
                  {(replies[comment.id] ?? []).map((reply) => (
                    <div key={reply.id}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size="xs" />
                          <span className="text-xs font-semibold text-gray-800">{reply.authorName}</span>
                          <span className="text-xs text-gray-400">{formatDate(reply.createdAt)}</span>
                        </div>
                        {isAdmin && (
                          <button type="button" onClick={() => void handleDeleteReply(comment.id, reply.id)} title="Delete reply" className="rounded-full p-1 text-gray-300 hover:bg-red-50 hover:text-red-500">
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                      {editingReplyId === reply.id ? (
                        <div className="mt-1 pl-7 space-y-1">
                          <MentionTextarea
                            value={replyDrafts[reply.id] ?? reply.body}
                            onChange={(v) => setReplyDrafts((prev) => ({ ...prev, [reply.id]: v }))}
                            rows={2}
                            users={users}
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setEditingReplyId(null)} className="rounded-2xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={() => void handleSaveReplyEdit(reply.id, comment.id)} disabled={savingReplyEdit === reply.id} className="rounded-2xl bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{savingReplyEdit === reply.id ? 'Saving…' : 'Save'}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 pl-7 flex items-start gap-2">
                          <div className="flex-1"><BodyText text={reply.body} users={users} /></div>
                          {currentUser.id === reply.authorId && (
                            <div className="flex gap-1.5 flex-shrink-0">
                              <button type="button" onClick={() => { setReplyDrafts((prev) => ({ ...prev, [reply.id]: reply.body })); setEditingReplyId(reply.id); }} className="text-xs text-gray-400 hover:text-primary">Edit</button>
                              <button type="button" onClick={() => void handleDeleteReply(comment.id, reply.id)} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              {replyingTo === comment.id && (
                <div className="mt-3 ml-8 flex gap-2">
                  <MentionTextarea
                    value={replyTexts[comment.id] ?? ''}
                    onChange={(v) => setReplyTexts((prev) => ({ ...prev, [comment.id]: v }))}
                    placeholder="Write a reply… @mention someone"
                    rows={2}
                    users={users}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void handlePostReply(comment.id)}
                    disabled={postingReply === comment.id || !replyTexts[comment.id]?.trim()}
                    className="self-end rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {postingReply === comment.id ? '…' : 'Reply'}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New comment */}
      {topic.status === 'OPEN' && (
        <div className="mt-4 surface-card p-4">
          <div className="flex items-start gap-3">
            <Avatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} size="sm" className="mt-0.5" />
            <div className="flex-1 space-y-2">
              <MentionTextarea
                value={newComment}
                onChange={setNewComment}
                placeholder="Add a comment… Type @ to mention someone"
                rows={3}
                users={users}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handlePostComment()}
                  disabled={postingComment || !newComment.trim()}
                  className="rounded-2xl bg-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {postingComment ? 'Posting…' : 'Comment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!confirmAction}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmText="Delete"
        type="danger"
        onClose={() => setConfirmAction(null)}
        onConfirm={() => { void confirmAction?.onConfirm(); }}
      />
    </div>
  );
};

export default HubPage;
