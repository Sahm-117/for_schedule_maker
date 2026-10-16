import React, { useEffect, useState } from 'react';
import { groupDiscussionApi } from '../../services/api';
import type { Group, OnboardingProgress, SupportOnboardingStep } from '../../types';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { supportOnboardingSteps } from '../../utils/supportOnboarding';

// Admin only: see a group's support steps as the app sees them, and mark one done by hand (or undo
// that). A step the app has already seen done needs nothing.

const SupportStepsOverrideModal: React.FC<{
  group: Pick<Group, 'id' | 'name' | 'supportName' | 'meetingDay' | 'meetingTime' | 'callLink'>;
  onClose: () => void;
  /** After a change, so the page can refresh its own copy. */
  onChanged?: () => void;
}> = ({ group, onClose, onChanged }) => {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<SupportOnboardingStep | null>(null);

  const load = () => groupDiscussionApi.onboardingProgress(group.id)
    .then((next) => { setProgress(next); setError(''); })
    .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the steps.'));

  useEffect(() => { void load(); }, [group.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (step: SupportOnboardingStep, done: boolean) => {
    setBusy(step);
    try {
      await groupDiscussionApi.setSupportStepOverride(group.id, step, done);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  };

  const computed = progress ? supportOnboardingSteps(group, progress) : null;
  return (
    <ModalShell isOpen onClose={onClose} title={`Support steps · ${group.name}`} subtitle={group.supportName ?? undefined}>
      {!computed ? (
        error ? <p className="text-sm text-rose-700">{error}</p> : <p className="flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-gray-500">The app ticks these by itself. Mark one done only if the support has done it in a way the app can’t see.</p>
          <ul className="flex flex-col">
            {computed.steps.map((step) => {
              const seen = step.done && !step.byAdmin;
              return (
                <li key={step.key} className="flex items-center gap-3 border-t border-[#f0f0f2] py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-gray-900">{step.label}</p>
                    <p className="mt-0.5 text-[12.5px] text-gray-500">
                      {seen ? 'Done (seen by the app)' : step.byAdmin ? 'Marked done by an admin' : 'Not done yet'}
                      {step.key === 'READY' && computed.total > 0 ? ` · ${computed.readyCount} of ${computed.total} ready` : ''}
                    </p>
                  </div>
                  {!seen && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void toggle(step.key, !step.byAdmin)}
                      className={`min-h-[36px] flex-none rounded-full px-4 text-[13px] font-semibold disabled:opacity-60 ${step.byAdmin ? 'bg-[#f5f5f7] text-gray-800' : 'bg-primary text-white'}`}
                    >
                      {busy === step.key ? <Spinner className="h-3.5 w-3.5" /> : step.byAdmin ? 'Undo' : 'Mark done'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {error && <p className="text-sm text-rose-700">{error}</p>}
        </div>
      )}
    </ModalShell>
  );
};

export default SupportStepsOverrideModal;
