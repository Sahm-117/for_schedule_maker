import React, { useCallback, useEffect, useState } from 'react';
import Spinner from '../Spinner';
import DiscussionFeedView, { type DiscussionActions } from '../discussion/DiscussionFeedView';
import { participantAppApi } from '../../services/api';
import type { DiscussionFeed } from '../../types';

// My Group → Discussion: just the participant, their group and their support.
const ACTIONS: DiscussionActions = {
  post: (body, mentions) => participantAppApi.discussionPost(body, mentions),
  reply: (postId, body, mentions) => participantAppApi.discussionReply(postId, body, mentions),
  like: (postId, like) => participantAppApi.discussionLike(postId, like),
  deleteOwn: (kind, id) => participantAppApi.discussionDelete(kind, id),
  report: (postId, reason) => participantAppApi.discussionReport(postId, reason),
};

const ParticipantDiscussionTab: React.FC<{ viewerName: string; viewerAvatarUrl?: string | null }> = ({ viewerName, viewerAvatarUrl }) => {
  const [feed, setFeed] = useState<DiscussionFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setFeed(await participantAppApi.discussionFeed());
      setError('');
      // They're looking at it, so nothing here is new any more.
      participantAppApi.discussionMarkSeen().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the discussion.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Pick up new posts while the tab is open.
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const loadMore = async () => {
    const last = feed?.posts[feed.posts.length - 1];
    if (!feed || !last) return;
    setLoadingMore(true);
    try {
      const older = await participantAppApi.discussionFeed(last.createdAt);
      if (older) setFeed({ ...feed, posts: [...feed.posts, ...older.posts], hasMore: older.hasMore });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older posts.');
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (error && !feed) return <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;
  if (!feed) return <p className="py-8 text-center text-[14px] text-gray-500">You are not in a group yet.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-gray-500">Just you, your group and your support{feed.supportName ? `, ${feed.supportName}` : ''}.</p>
      <DiscussionFeedView
        feed={feed}
        actions={ACTIONS}
        onChanged={load}
        onLoadMore={() => void loadMore()}
        loadingMore={loadingMore}
        viewerName={viewerName}
        viewerAvatarUrl={viewerAvatarUrl}
      />
    </div>
  );
};

export default ParticipantDiscussionTab;
