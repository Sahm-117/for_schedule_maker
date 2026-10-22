import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { participantAppApi, getSessionToken } from '../../services/api';
import type { TeenFamilyMember } from '../../types';

// Several people on one number (a couple, a parent and their teens): after signing in they choose
// whose space to open. The phone remembers the choice for this sign-in until "Switch person". The
// database never offers this to a session that came in through a teen's own number.

type Choice = { status: 'loading' } | { status: 'app' } | { status: 'choose'; members: TeenFamilyMember[] };

const chosenKey = (): string => `fof-family-chosen:${getSessionToken().slice(-12)}`;
const markChosen = () => {
  try {
    // One remembered choice per phone: earlier sign-ins' keys are dropped so they do not pile up.
    const keep = chosenKey();
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key !== keep && key.startsWith('fof-family-chosen:')) localStorage.removeItem(key);
    }
    localStorage.setItem(keep, '1');
  } catch { /* the choice just shows again */ }
};
const wasChosen = () => { try { return localStorage.getItem(chosenKey()) === '1'; } catch { return false; } };

export const useFamilyChoice = (): { choice: Choice; choose: (id: string) => Promise<void>; error: string } => {
  const [choice, setChoice] = useState<Choice>({ status: 'loading' });
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // If the check fails (or there is nobody to choose between), the app opens as normal.
    participantAppApi.getFamily()
      .then((members) => { if (!cancelled) setChoice(members.length > 1 && !wasChosen() ? { status: 'choose', members } : { status: 'app' }); })
      .catch(() => { if (!cancelled) setChoice({ status: 'app' }); });
    return () => { cancelled = true; };
  }, []);

  const choose = useCallback(async (id: string) => {
    setError('');
    const current = choice.status === 'choose' ? choice.members.find((m) => m.current) : null;
    if (current?.id === id) { markChosen(); setChoice({ status: 'app' }); return; }
    try {
      await participantAppApi.switchTo(id);
      markChosen();
      // A clean start as the other person: their home, notifications and caches all load fresh.
      window.location.assign('/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that profile. Please try again.');
    }
  }, [choice]);

  return { choice, choose, error };
};

/** Everyone on this number who can be opened (empty for one person), and switching straight to one of them. */
export const useSwitchPerson = (): { members: TeenFamilyMember[]; switchTo: (id: string) => Promise<void> } => {
  const [members, setMembers] = useState<TeenFamilyMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    participantAppApi.getFamily().then((m) => { if (!cancelled) setMembers(m.length > 1 ? m : []); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return { members, switchTo: switchPersonTo };
};

/** Open another person on this number and remember the choice, so "Who is using the app now?" does not ask again. */
export const switchPersonTo = async (id: string): Promise<void> => {
  await participantAppApi.switchTo(id);
  markChosen();
  // A clean start as the other person: their home, notifications and caches all load fresh.
  window.location.assign('/me');
};

const initials = (name: string): string => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

const FamilyPicker: React.FC<{ members: TeenFamilyMember[]; onChoose: (id: string) => void; error: string }> = ({ members, onChoose, error }) => {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-[#eef0f4] bg-white p-6 shadow-[0_18px_40px_-22px_rgba(17,24,39,0.25)]">
        <h1 className="text-[22px] font-bold text-gray-900">Who is using the app now?</h1>
        <p className="mt-1 text-[14px] text-gray-500">More than one person uses this phone number. Tap your name.</p>
        <ul className="mt-5 space-y-2">
          {members.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onChoose(m.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3.5 py-3 text-left transition active:scale-[0.99] hover:border-primary/40 hover:bg-[#fff8f3]"
              >
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#fff1e6] text-[13px] font-bold text-[#9a4a12]">{initials(m.name)}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900">{m.name}</span>
                {m.isTeen !== undefined && (
                  <span className="flex-none rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-500">{m.isTeen ? 'Teen' : 'Adult'}</span>
                )}
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="flex-none text-gray-400" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="m9 5 7 7-7 7" /></svg>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-gray-500">The app remembers who you chose. To change later, tap your picture at the top.</p>
        {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
        <button type="button" onClick={logout} className="mt-5 w-full text-center text-[13px] font-medium text-gray-500">Log out</button>
      </div>
    </div>
  );
};

export default FamilyPicker;
