import type { DiscussionFeed } from '../types';

// A refresh re-reads the newest page, then keeps paging back until it covers everything the reader
// had already scrolled up to. So edits, removals, likes, replies and pins on older posts show up,
// and the chat does not shrink under the reader. The cap keeps a long history from costing a lot.
const MAX_REFRESH_PAGES = 10;

export const fetchLoadedDiscussionFeed = async (
  prev: DiscussionFeed | null,
  fetchPage: (before?: string) => Promise<DiscussionFeed | null | undefined>,
): Promise<DiscussionFeed | null> => {
  const first = await fetchPage();
  if (!first) return null;
  const keepUntil = prev && prev.groupId === first.groupId ? prev.posts[prev.posts.length - 1] : undefined;
  if (!keepUntil) return first;
  const target = new Date(keepUntil.createdAt).getTime();
  let merged = first;
  for (let page = 1; page < MAX_REFRESH_PAGES; page += 1) {
    const oldest = merged.posts[merged.posts.length - 1];
    if (!merged.hasMore || !oldest || new Date(oldest.createdAt).getTime() <= target) break;
    const older = await fetchPage(oldest.createdAt);
    if (!older || older.posts.length === 0) break;
    const seen = new Set(merged.posts.map((post) => post.id));
    merged = { ...merged, posts: [...merged.posts, ...older.posts.filter((post) => !seen.has(post.id))], hasMore: older.hasMore };
  }
  return merged;
};

/** Adds an older page to what is shown, without losing anything that changed while it loaded. */
export const appendOlderPosts = (prev: DiscussionFeed | null, older: DiscussionFeed): DiscussionFeed | null => {
  if (!prev) return prev;
  const seen = new Set(prev.posts.map((post) => post.id));
  return { ...prev, posts: [...prev.posts, ...older.posts.filter((post) => !seen.has(post.id))], hasMore: older.hasMore };
};
