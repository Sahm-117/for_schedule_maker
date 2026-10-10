import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { startPolling } from '../../hooks/usePolling';
import { useSearchParams } from 'react-router-dom';
import Spinner from '../Spinner';
import IntroComposer, { SUPPORT_INTRO_PROMPTS } from './IntroComposer';
import DiscussionFeedView, { type DiscussionActions } from './DiscussionFeedView';
import { groupDiscussionApi } from '../../services/api';
import type { DiscussionFeed } from '../../types';

// A group's discussion for staff. What they can do follows feed.access:
// the group's support posts and moderates, admins moderate, hub leads only read.
const StaffDiscussionPanel: React.FC<{ groupId: string; viewerName: string; viewerAvatarUrl?: string | null; onChanged?: () => void }> = ({ groupId, viewerName, viewerAvatarUrl, onChanged }) => {
  const [feed, setFeed] = useState<DiscussionFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const introRequested = searchParams.get('intro') === '1';
  // Has the support posted their introduction yet? (null = not known / not the support)
  const [introPosted, setIntroPosted] = useState<boolean | null>(null);
  const [introOpen, setIntroOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await groupDiscussionApi.feed(groupId);
      setFeed(next);
      setError('');
      if (next.access === 'SUPPORT') {
        groupDiscussionApi.markSeen(groupId).catch(() => {});
        groupDiscussionApi.onboardingProgress(groupId)
          .then((p) => setIntroPosted(p.groups.find((g) => g.groupId === groupId)?.supportIntroPosted ?? p.groups[0]?.supportIntroPosted ?? null))
          .catch(() => {});
      } else {
        setIntroPosted(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the discussion.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    void load();
    return startPolling(load, 30000);
  }, [load]);

  const actions = useMemo<DiscussionActions>(() => {
    if (!feed) return {};
    if (feed.access === 'SUPPORT') {
      return {
        post: (body, mentions) => groupDiscussionApi.post(groupId, body, mentions),
        reply: groupDiscussionApi.reply,
        like: groupDiscussionApi.like,
        deleteOwn: groupDiscussionApi.deleteOwn,
        pin: groupDiscussionApi.pin,
        moderate: groupDiscussionApi.moderate,
      };
    }
    if (feed.access === 'ADMIN') return { pin: groupDiscussionApi.pin, moderate: groupDiscussionApi.moderate };
    return {};
  }, [feed, groupId]);

  const loadMore = async () => {
    const last = feed?.posts[feed.posts.length - 1];
    if (!feed || !last) return;
    setLoadingMore(true);
    try {
      const older = await groupDiscussionApi.feed(groupId, last.createdAt);
      setFeed({ ...feed, posts: [...feed.posts, ...older.posts], hasMore: older.hasMore });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older posts.');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!feed) return <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error || 'Could not load the discussion.'}</p>;

  return (
    <div className="flex flex-col gap-3">
      {feed.access === 'HUB' && <p className="text-[13px] text-gray-500">Read only. The group’s support looks after posts and reports.</p>}
      {feed.access === 'SUPPORT' && introPosted === false && (introRequested || introOpen ? (
        <IntroComposer
          name={viewerName}
          avatarUrl={viewerAvatarUrl}
          label="Support"
          heading="Introduce yourself to your group"
          placeholder="Say hello and tell your group a bit about you…"
          prompts={SUPPORT_INTRO_PROMPTS}
          wt="support-intro-composer"
          autoFocus
          send={(body) => groupDiscussionApi.intro(groupId, body)}
          onPosted={async () => { setIntroOpen(false); await load(); onChanged?.(); }}
        />
      ) : (
        <button type="button" data-wt="support-intro-banner" onClick={() => setIntroOpen(true)} className="flex w-full items-center justify-between gap-3 rounded-[22px] bg-white p-4 text-left shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.14)]">
          <span>
            <span className="block text-[15px] font-bold text-gray-900">Start introductions</span>
            <span className="block text-[13px] text-gray-500">Your group can introduce themselves once you have.</span>
          </span>
          <span className="flex-none rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white">Write yours</span>
        </button>
      ))}
      <DiscussionFeedView
        feed={feed}
        actions={actions}
        onChanged={async () => { await load(); onChanged?.(); }}
        onLoadMore={() => void loadMore()}
        loadingMore={loadingMore}
        viewerName={viewerName}
        viewerAvatarUrl={viewerAvatarUrl}
      />
    </div>
  );
};

export default StaffDiscussionPanel;
