import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import PracticeChecklist from './PracticeChecklist';
import { practiceApi } from '../../services/api';
import { PRACTICE_ROLE_LABEL, PRACTICE_SCENARIOS, type PracticeSeat } from '../../constants/practiceScenarios';
import type { PracticeMyProgress } from '../../types';

// A small pill that stays on screen in Practice and opens the person's
// scenario checklist. Staff: while they are looking at the Practice cohort.
// Participants: only when they are a practice participant.
const PracticeDock: React.FC<{ mode: 'staff' | 'participant'; active?: boolean }> = ({ mode, active = true }) => {
  const [data, setData] = useState<PracticeMyProgress | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    const request = mode === 'staff' ? practiceApi.getMine() : practiceApi.getForParticipant();
    request.then(setData).catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (!active) { setData(null); return undefined; }
    // Participants wait a moment so the first screen is not slowed for real people.
    const first = window.setTimeout(load, mode === 'participant' ? 1500 : 0);
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15000);
    return () => { window.clearTimeout(first); window.clearInterval(poll); };
  }, [active, load, mode]);

  const seat: PracticeSeat | null = mode === 'participant' ? (data?.practice ? 'PARTICIPANT' : null) : (data?.role ?? null);
  const scenarios = useMemo(() => (seat ? PRACTICE_SCENARIOS[seat] : []), [seat]);
  const items = data?.items ?? [];

  const change = (key: string, done: boolean, stuck: boolean) => {
    const now = new Date().toISOString();
    setData((prev) => {
      if (!prev) return prev;
      const rest = prev.items.filter((item) => item.key !== key);
      return { ...prev, items: [...rest, { key, doneAt: done ? now : null, stuckAt: stuck ? now : null }] };
    });
    const save = mode === 'staff' ? practiceApi.setMine(key, done, stuck) : practiceApi.setForParticipant(key, done, stuck);
    save.catch(load);
  };

  if (!active || !seat || scenarios.length === 0) return null;
  const doneCount = scenarios.filter((s) => items.some((item) => item.key === s.key && item.doneAt)).length;

  return (
    <>
      {mode === 'participant' && (
        <div className="fixed inset-x-0 top-0 z-40 bg-[#3f4757] px-4 py-1 text-center text-[11px] font-semibold text-white">Practice mode. Nothing here is real.</div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] left-4 z-40 inline-flex items-center gap-2 rounded-full bg-[#3f4757] py-2.5 pl-3.5 pr-4 text-[13px] font-semibold text-white shadow-lg active:scale-[0.98]"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[11px] font-bold">{doneCount}</span>
        Practice · {doneCount} of {scenarios.length}
      </button>
      <ModalShell
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Practice scenarios"
        subtitle={`${PRACTICE_ROLE_LABEL[seat]} · ${doneCount} of ${scenarios.length} done`}
      >
        <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round((doneCount / scenarios.length) * 100)}%` }} />
        </div>
        <PracticeChecklist scenarios={scenarios} items={items} onChange={change} onNavigate={() => setOpen(false)} />
      </ModalShell>
    </>
  );
};

export default PracticeDock;
