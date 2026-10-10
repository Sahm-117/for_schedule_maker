import React, { useCallback, useEffect, useState } from 'react';
import { startPolling } from '../../hooks/usePolling';
import { useSearchParams } from 'react-router-dom';
import IntroComposer, { INTRO_PROMPTS } from '../discussion/IntroComposer';
import Spinner from '../Spinner';
import DiscussionFeedView, { type DiscussionActions } from '../discussion/DiscussionFeedView';
import { participantAppApi } from '../../services/api';
import type { DiscussionFeed, OnboardingState } from '../../types';

// My Group → Discussion: just the participant, their group and their support.
const ACTIONS: DiscussionActions = {
  post: (body, mentions) => participantAppApi.discussionPost(body, mentions),
  reply: (postId, body, mentions) => participantAppApi.discussionReply(postId, body, mentions),
  like: (postId, like) => participantAppApi.discussionLike(postId, like),
  deleteOwn: (kind, id) => participantAppApi.discussionDelete(kind, id),
  report: (postId, reason) => participantAppApi.discussionReport(postId, reason),
};

const ParticipantDiscussionTab: React.FC<{ viewerName: string; viewerAvatarUrl?: string | null; viewerGender?: string | null }> = ({ viewerName, viewerAvatarUrl, viewerGender }) => {
  const [searchParams] = useSearchParams();
  const introRequested = searchParams.get('intro') === '1';
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
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
      participantAppApi.getOnboardingState().then(setOnboarding).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the discussion.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Pick up new posts while the tab is open.
    return startPolling(load, 30000);
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
      {onboarding && onboarding.supportIntroPosted && !onboarding.introPosted && (
        <IntroComposer name={viewerName} avatarUrl={viewerAvatarUrl} label={viewerGender} autoFocus={introRequested} send={(body) => participantAppApi.discussionIntro(body)} onPosted={load} />
      )}
      {onboarding && !onboarding.supportIntroPosted && !onboarding.introPosted && (
        <section data-wt="pd-intro-waiting" className="rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.14)]">
          <h2 className="text-[15px] font-bold text-gray-900">Introduce yourself soon</h2>
          <p className="mt-1 text-[13px] text-gray-500">{feed.supportName || 'Your support'} introduces themselves first. Once they have, a box opens here for you to do the same. It could cover:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {INTRO_PROMPTS.map((prompt) => (
              <span key={prompt.label} className="rounded-full bg-[#fff1e6] px-3 py-1.5 text-[12px] font-semibold text-[#9a4a12]">{prompt.label}</span>
            ))}
          </div>
        </section>
      )}
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
