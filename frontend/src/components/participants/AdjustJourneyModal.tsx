import React, { useEffect, useState } from 'react';
import AppSelect from '../AppSelect';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { JOURNEY_STAGES, NEXT_COHORT_LABEL } from '../../utils/participantJourney';
import type { JourneyStage } from '../../types';

// Adjust journey: from the Participants ⋮ menu and the participant profile. Moves the journey to a stage the records
// can't show, or to Next cohort (rule 141), which takes them off this cohort and is only for someone not in a group.
interface Props {
  isOpen: boolean;
  name?: string;
  current: JourneyStage | null;
  inGroup: boolean;
  onClose: () => void;
  onSave: (stage: JourneyStage, note: string) => Promise<void>;
}

const TEXTAREA = 'w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const AdjustJourneyModal: React.FC<Props> = ({ isOpen, name, current, inGroup, onClose, onSave }) => {
  const [stage, setStage] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (isOpen) { setStage(''); setNote(''); setError(''); } }, [isOpen]);

  const nextCohort = stage === 'NEXT_COHORT';
  const blocked = nextCohort && inGroup;
  const options = [
    ...JOURNEY_STAGES.map((s) => ({ value: s.stage, label: s.stage === current ? `${s.label} (current)` : s.label })),
    {
      value: 'NEXT_COHORT',
      label: current === 'NEXT_COHORT' ? `${NEXT_COHORT_LABEL} (current)` : NEXT_COHORT_LABEL,
      ...(inGroup ? { warning: 'Take them out of their group first' } : { meta: 'Takes them off this cohort' }),
    },
  ];

  const save = async () => {
    setSaving(true);
    setError('');
    try { await onSave(stage as JourneyStage, note.trim()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save. Try again.'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => { if (!saving) onClose(); }}
      title="Adjust journey"
      subtitle={name ? `${name}. Your name and the date are saved with it.` : 'Use this when the records can\'t show it. Your name and the date are saved with it.'}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-2xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => { void save(); }} disabled={saving || !stage || stage === current || blocked || (nextCohort && !note.trim())} className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60">
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : nextCohort ? 'Move to next cohort' : 'Move'}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <AppSelect value={stage} onChange={setStage} options={options} placeholder="Choose a stage" />
        {blocked && <p className="text-sm text-amber-700">They are in a group. Take them out of their group first, then move them to the next cohort.</p>}
        {nextCohort && !blocked && <p className="text-[13px] text-gray-500">They leave this cohort's list and attendance and are archived. An adult's sign-up is set to "Will join next cohort".</p>}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={nextCohort ? 'Reason' : 'Why? (optional)'} className={TEXTAREA} />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
};

export default AdjustJourneyModal;
