import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { practiceApi } from '../../services/api';
import { PRACTICE_ROLE_LABEL } from '../../constants/practiceScenarios';
import { useToast } from '../Toast';
import type { PracticePulse } from '../../types';

// Someone is asking you to practise with them. Shown wherever you are in the app.
const PracticeIncoming: React.FC<{
  request: NonNullable<PracticePulse['incoming']>[number] | undefined;
  onAnswered: (accepted: boolean) => void;
}> = ({ request, onAnswered }) => {
  const toast = useToast();
  const [busy, setBusy] = useState<'JOIN' | 'NO' | null>(null);
  if (!request) return null;
  const first = request.fromName.split(' ')[0];

  const answer = async (accept: boolean) => {
    setBusy(accept ? 'JOIN' : 'NO');
    try {
      await practiceApi.peerRespond(request.id, accept);
      onAnswered(accept);
    } catch (e) {
      toast({ tone: 'error', message: e instanceof Error ? e.message : 'That request is no longer open.' });
      onAnswered(false);
    } finally { setBusy(null); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Practice walkthrough request">
      <div className="absolute inset-0 bg-slate-900/50" />
      <div className="relative w-full max-w-md rounded-t-[28px] bg-white px-6 pb-7 pt-7 shadow-[0_-8px_40px_rgba(15,23,42,0.2)] sm:rounded-[28px]">
        <p className="text-[13px] font-semibold text-violet-700">Practice walkthrough</p>
        <h2 className="mt-1.5 text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-gray-900">{first} wants to practise with you</h2>
        <p className="mt-3 text-[15px] leading-[1.5] text-gray-600">
          {first} will be the {PRACTICE_ROLE_LABEL[request.fromRole]} and you will be the {PRACTICE_ROLE_LABEL[request.toRole]}. It takes about ten minutes.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button type="button" disabled={busy !== null} onClick={() => void answer(true)} className="flex h-[52px] w-full items-center justify-center rounded-full bg-primary px-5 text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60">{busy === 'JOIN' ? 'Joining…' : 'Join'}</button>
          <button type="button" disabled={busy !== null} onClick={() => void answer(false)} className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#f2f2f4] px-5 text-[15px] font-semibold text-gray-900 transition active:scale-[0.98] disabled:opacity-60">Not now</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PracticeIncoming;
