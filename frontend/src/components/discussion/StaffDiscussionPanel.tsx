import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Spinner from '../Spinner';
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

  const load = useCallback(async () => {
    try {
      setFeed(await groupDiscussionApi.feed(groupId));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the discussion.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(timer);
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
