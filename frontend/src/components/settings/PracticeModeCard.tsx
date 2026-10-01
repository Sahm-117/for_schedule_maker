import React, { useCallback, useEffect, useState } from 'react';
import { practiceApi } from '../../services/api';
import { useToast } from '../Toast';
import type { PracticeStatus } from '../../types';

// The only Practice control an admin has: on or off. While it is on, every
// support is added automatically and can play any seat, try walkthroughs with
// each other and reset their own practice.
const PracticeModeCard: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState<PracticeStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    practiceApi.getStatus().then((next) => setStatus((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const toggle = async () => {
    if (!status || busy) return;
    const next = !status.on;
    setBusy(true);
    try {
      await practiceApi.setOn(next);
      setStatus({ ...status, on: next });
      toast({ message: next ? 'Practice is on. Supports will see it in their cohort menu.' : 'Practice is off.' });
      load();
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'Could not change Practice.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="surface-card p-6">
      <button
        type="button"
        role="switch"
        aria-checked={!!status?.on}
        disabled={!status || busy}
        onClick={() => void toggle()}
        className="flex w-full items-center gap-4 text-left disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold text-gray-900">Practice mode</span>
          <span className="mt-1 block text-sm text-gray-500">
            {status?.on
              ? 'On. Every support can open Practice from the cohort menu and try the app with made-up people. Nothing there is real.'
              : 'Off. Switch it on to let supports practise the app safely, in their own made-up cohort.'}
          </span>
        </span>
        <span className={`relative h-[28px] w-[48px] flex-none rounded-full transition ${status?.on ? 'bg-emerald-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${status?.on ? 'left-[23px]' : 'left-[3px]'}`} />
        </span>
      </button>
      {status?.on && (
        <p className="mt-3 text-xs text-gray-500">
          {status.people} {status.people === 1 ? 'person has' : 'people have'} joined · {status.online} here now · {status.walkthroughs} walkthrough{status.walkthroughs === 1 ? '' : 's'} running
        </p>
      )}
    </div>
  );
};

export default PracticeModeCard;
