import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { PrayerWallPost } from '../../types';
import { clockLabel, lagosClock } from '../../utils/prayerText';
import PersonCircle from './PersonCircle';
import Spinner from '../Spinner';

// The Wall on a daily prayer: short words for the person being prayed for, with first names. One-tap words or your own (up to
// 140 characters, 5 per prayer). An admin, or the lead of the writer's hub, can hide a message; it goes for everyone and the
// writer is not told. The person prayed for reads these once the prayer has ended.


export const WallList: React.FC<{ posts: PrayerWallPost[]; onHide?: (post: PrayerWallPost) => void; empty?: string }> = ({ posts, onHide, empty }) => (
  posts.length === 0 ? <p className="rounded-2xl bg-white px-4 py-6 text-center text-[14px] text-gray-500">{empty ?? 'No words yet. Be the first to leave one.'}</p> : (
    <ul className="flex flex-col gap-2.5">
      {posts.map((post) => (
        <li key={post.id} className={`flex items-start gap-2.5 rounded-2xl px-3 py-2.5 ${post.mine ? 'bg-[#fff1e7]' : 'bg-white'}`}>
          <PersonCircle name={post.fullName || '?'} avatarUrl={post.avatarUrl} size={30} />
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-2 text-[13px]"><b className="text-gray-900">{post.mine ? 'You' : post.firstName || 'Someone'}</b><span className="text-gray-500">{clockLabel(lagosClock(post.at))}</span></p>
            <p className="mt-0.5 text-[15px] leading-snug text-gray-900 [overflow-wrap:anywhere]">{post.body}</p>
          </div>
          {onHide && post.canHide && !post.mine && (
            <button type="button" onClick={() => onHide(post)} className="min-h-[36px] flex-none rounded-full px-2.5 text-[12.5px] font-semibold text-gray-500 hover:bg-gray-100" aria-label={`Hide ${post.firstName || 'this'}'s message`}>Hide</button>
          )}
        </li>
      ))}
    </ul>
  )
);

export const WallComposer: React.FC<{
  firstName: string | null;
  posts: PrayerWallPost[];
  onPost: (body: string) => Promise<void>;
}> = ({ firstName, posts, onPost }) => {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const quick = ['Praying', firstName ? `Praying for you, ${firstName}` : 'Praying for you'];
  const sentAlready = (body: string) => posts.some((post) => post.mine && post.body === body);
  const mineCount = posts.filter((post) => post.mine).length;

  const send = async (body: string) => {
    setSending(body);
    setError('');
    try {
      await onPost(body);
      if (body === text.trim()) { setText(''); setWriting(false); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Please try again.');
    } finally { setSending(null); }
  };

  if (mineCount >= 5) return <p className="text-center text-[13px] text-gray-500">You’ve left 5 words on this prayer. Thank you.</p>;
  return (
    <div className="flex flex-col gap-2">
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      {writing ? (
        <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); if (text.trim()) void send(text.trim()); }}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Your words for {firstName ?? 'them'}</span>
            <textarea value={text} onChange={(event) => setText(event.target.value.slice(0, 140))} rows={2} maxLength={140} autoFocus placeholder={`A short word for ${firstName ?? 'them'}`} className="w-full resize-none rounded-2xl border border-gray-300 px-3.5 py-2.5 text-[15px] focus:border-[#0b1020] focus:outline-none" />
            <span className="block text-right text-[11px] text-gray-400">{text.length}/140</span>
          </label>
          <button type="submit" disabled={!text.trim() || !!sending} className="mb-5 flex h-11 flex-none items-center justify-center rounded-full bg-[#0b1020] px-4 text-[14px] font-bold text-white disabled:opacity-50">
            {sending ? <Spinner className="h-4 w-4" /> : 'Send'}
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {quick.map((body) => {
            const done = sentAlready(body);
            return (
              <button key={body} type="button" onClick={() => { if (!done) void send(body); }} disabled={done || !!sending} aria-pressed={done}
                className={`min-h-[40px] rounded-full border px-3.5 text-[13.5px] font-semibold ${done ? 'border-green-200 bg-green-50 text-green-800' : 'border-gray-300 bg-white text-gray-900'} disabled:cursor-default`}>
                {sending === body ? <Spinner className="h-3.5 w-3.5" /> : `${body}${done ? ' ✓' : ''}`}
              </button>
            );
          })}
          <button type="button" onClick={() => setWriting(true)} className="min-h-[40px] rounded-full border border-dashed border-gray-400 px-3.5 text-[13.5px] font-semibold text-gray-700">Write your own</button>
        </div>
      )}
    </div>
  );
};

/** "Hide message" confirmation for admins and hub leads. */
export const HideSheet: React.FC<{ post: PrayerWallPost; onHide: () => Promise<void>; onCancel: () => void; embedded?: boolean }> = ({ post, onHide, onCancel, embedded = false }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sheet = (
    <div className={`${embedded ? 'absolute' : 'fixed'} inset-0 z-[170] flex items-end justify-center bg-black/45 sm:items-center`} role="dialog" aria-modal="true" aria-labelledby="hide-post-title" onClick={onCancel}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <h2 id="hide-post-title" className="text-[17px] font-extrabold text-gray-900">Hide this message?</h2>
        <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-[14.5px] text-gray-800 [overflow-wrap:anywhere]"><b>{post.firstName || 'Someone'}:</b> {post.body}</p>
        <p className="mt-2 text-[13.5px] text-gray-600">It disappears for everyone. {post.firstName || 'They'} isn&apos;t told.</p>
        {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => { setBusy(true); setError(''); onHide().catch((err) => { setError(err instanceof Error ? err.message : 'Could not hide it.'); setBusy(false); }); }}
            className="flex h-12 items-center justify-center rounded-full bg-red-600 text-[15px] font-bold text-white disabled:opacity-60">{busy ? 'Hiding…' : 'Hide message'}</button>
          <button type="button" onClick={onCancel} className="flex h-11 items-center justify-center rounded-full text-[15px] font-semibold text-gray-600">Cancel</button>
        </div>
      </div>
    </div>
  );
  return embedded ? sheet : createPortal(sheet, document.body);
};
