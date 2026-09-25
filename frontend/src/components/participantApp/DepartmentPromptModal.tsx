import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import AppSelect from '../AppSelect';
import { useChurchDepartments } from '../../hooks/useChurchDepartments';
import { participantAppApi } from '../../services/api';
import Spinner from '../Spinner';

// "Which department would you like to join?" — from the week the admin
// chose, using the same submit_wrap_up as "Finish FOF", so that page already
// shows the answer once this is sent. Same portal/shape as CheckInModal.

interface DepartmentPromptModalProps {
  participantName: string;
  onAnswered: () => void;
  onLater: () => void;
}

const DepartmentPromptModal: React.FC<DepartmentPromptModalProps> = ({ participantName, onAnswered, onLater }) => {
  const departments = useChurchDepartments();
  const [department, setDepartment] = useState('');
  const [wantsReferral, setWantsReferral] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!department) { setError('Choose a department.'); return; }
    if (wantsReferral === null) { setError('Tell us if you would like a referral.'); return; }
    setSending(true);
    setError('');
    try {
      await participantAppApi.submitWrapUp({ department, wantsReferral, note: '' }, participantName);
      onAnswered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="departmentprompt-title">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#fff1e7] text-[#c2410c]" aria-hidden="true">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>
        </span>
        <h2 id="departmentprompt-title" className="mt-3 text-lg font-bold text-gray-900">Which department would you like to join?</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-gray-600">This shows on your profile, and you can change it later on "Finish FOF".</p>

        <div className="mt-4">
          <AppSelect
            value={department}
            onChange={(value) => { setDepartment(value); setError(''); }}
            options={departments.map((entry) => ({ value: entry.name, label: entry.name, meta: entry.description || undefined }))}
            placeholder="Choose a department"
          />
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-[13px] font-semibold text-gray-900">Would you like a referral to join that department?</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Referral">
            {([[true, 'Yes, refer me'], [false, 'Not right now']] as Array<[boolean, string]>).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={wantsReferral === value}
                onClick={() => { setWantsReferral(value); setError(''); }}
                className={`min-h-[40px] rounded-full border px-3.5 py-2 text-[13px] font-semibold ${wantsReferral === value ? 'border-[#ffdeca] bg-[#fff8f3] text-[#c2410c]' : 'border-gray-200 bg-white text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <button type="button" onClick={() => { void submit(); }} disabled={sending} className="min-h-[48px] rounded-xl bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60">
            {sending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Send'}
          </button>
          <button type="button" onClick={onLater} disabled={sending} className="min-h-[44px] rounded-xl text-[14px] font-semibold text-gray-500 disabled:opacity-60">
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DepartmentPromptModal;
