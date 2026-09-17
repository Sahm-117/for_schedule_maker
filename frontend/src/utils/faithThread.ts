import type { FaithProject, ParticipantNote } from '../types';

// Faith project conversations have two trails:
//   coach  — support <-> participant (FAITH_COACH notes; the participant sees it)
//   office — support <-> back office (review decisions + FAITH_OFFICE notes)
// A trail is unread for someone when another person wrote in it after they
// last opened it. Messages from before this feature shipped count as read,
// so nobody opens the app to a wall of old dots.

export type FaithTrail = 'coach' | 'office';

export const THREAD_READS_START = '2026-09-17T02:00:00Z';

export type ThreadReads = Map<string, string>; // `${participantId}:${trail}` -> lastReadAt

export const threadReadKey = (participantId: string, trail: FaithTrail) => `${participantId}:${trail}`;

const latestByOthers = (entries: Array<{ authorId?: string | null; at: string }>, viewerId: string) =>
  entries.filter((e) => e.authorId !== viewerId).reduce<string | null>((max, e) => (!max || e.at > max ? e.at : max), null);

export const unreadTrails = (
  participantId: string,
  project: FaithProject | null,
  notes: ParticipantNote[],
  viewerId: string,
  reads: ThreadReads,
): Set<FaithTrail> => {
  const mine = notes.filter((n) => n.participantId === participantId);
  const latest: Record<FaithTrail, string | null> = {
    coach: latestByOthers(mine.filter((n) => n.noteType === 'FAITH_COACH').map((n) => ({ authorId: n.authorId, at: n.createdAt })), viewerId),
    office: latestByOthers([
      ...(project?.reviewHistory ?? []).map((r) => ({ authorId: r.actorId, at: r.at })),
      ...mine.filter((n) => n.noteType === 'FAITH_OFFICE').map((n) => ({ authorId: n.authorId, at: n.createdAt })),
    ], viewerId),
  };
  const unread = new Set<FaithTrail>();
  (Object.keys(latest) as FaithTrail[]).forEach((trail) => {
    const at = latest[trail];
    if (!at) return;
    const lastRead = reads.get(threadReadKey(participantId, trail));
    const since = lastRead && lastRead > THREAD_READS_START ? lastRead : THREAD_READS_START;
    if (new Date(at).getTime() > new Date(since).getTime()) unread.add(trail);
  });
  return unread;
};
