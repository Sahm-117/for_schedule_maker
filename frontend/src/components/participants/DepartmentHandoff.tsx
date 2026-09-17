import React, { useState } from 'react';
import AppSelect from '../AppSelect';
import { departmentOptions, useChurchDepartments } from '../../hooks/useChurchDepartments';
import { departmentReferralsApi } from '../../services/api';
import type { DepartmentReferral, Participant } from '../../types';
import { referralTimeline } from '../../utils/participantJourney';

// Department handoff: a participant's department choice is logged, then the
// attached support or an admin confirms they joined (or didn't). Shows the time
// from logged to joined. Used on the admin profile and the support's participant view.

const formatDate = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : '—';

const REFERRAL_PILL: Record<string, { label: string; cls: string }> = {
  LOGGED: { label: 'Logged', cls: 'bg-sky-100/80 text-sky-700' },
  JOINED: { label: 'Joined', cls: 'bg-emerald-100/80 text-emerald-700' },
  NOT_JOINED: { label: 'Didn’t join', cls: 'bg-neutral-100 text-neutral-600' },
};

const DepartmentHandoff: React.FC<{
  participant: Participant;
  referrals: DepartmentReferral[];
  userId: string | null;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}> = ({ participant, referrals, userId, onChanged, onError }) => {
  const [adding, setAdding] = useState(false);
  const [department, setDepartment] = useState('');
  const churchDepartments = useChurchDepartments();
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (referral: DepartmentReferral, status: DepartmentReferral['status'], message: string) => {
    if (!userId) return;
    setBusyId(referral.id);
    try {
      await departmentReferralsApi.setStatus(referral.id, status, userId);
      onChanged(message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update the department.');
    } finally {
      setBusyId(null);
    }
  };

  const logDepartment = async () => {
    if (!userId || !department.trim()) return;
    setBusyId('new');
    try {
      await departmentReferralsApi.log({ participantId: participant.id, department, loggedById: userId });
      setDepartment('');
      setAdding(false);
      onChanged(`${department.trim()} logged`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not log the department.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-gray-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900">Department</p>
        {!adding && userId && (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:text-primary-dark">Log a department</button>
        )}
      </div>
      {referrals.length === 0 && !adding && <p className="mt-1 text-sm text-gray-500">No department chosen yet.</p>}
      <ul className="mt-2 space-y-2">
        {referrals.map((referral) => (
          <li key={referral.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {referral.department}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${REFERRAL_PILL[referral.status].cls}`}>{REFERRAL_PILL[referral.status].label}</span>
              </p>
              <p className="text-xs text-gray-500">
                Logged {formatDate(referral.loggedAt)}{referral.loggedByName ? ` by ${referral.loggedByName}` : referral.note ? ` · ${referral.note}` : ''}
                {referral.status === 'JOINED' && referral.joinedAt ? ` → joined ${formatDate(referral.joinedAt)}` : ''}
                {referral.status !== 'LOGGED' && referral.updatedByName ? ` · confirmed by ${referral.updatedByName}` : ''}
              </p>
              <p className="text-xs font-semibold text-gray-700">{referralTimeline(referral)}</p>
            </div>
            {userId && (
              <div className="flex flex-none gap-1.5">
                {referral.status === 'LOGGED' ? (
                  <>
                    <button type="button" disabled={busyId === referral.id} onClick={() => { void setStatus(referral, 'JOINED', `Confirmed ${participant.fullName.split(' ')[0]} joined ${referral.department}`); }} className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Confirm joined</button>
                    <button type="button" disabled={busyId === referral.id} onClick={() => { void setStatus(referral, 'NOT_JOINED', `Marked as not joining ${referral.department}`); }} className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200 disabled:opacity-50">Didn’t join</button>
                  </>
                ) : (
                  <button type="button" disabled={busyId === referral.id} onClick={() => { void setStatus(referral, 'LOGGED', `${referral.department} set back to waiting`); }} className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200 disabled:opacity-50">Undo</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {adding && (
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <AppSelect
              value={department}
              onChange={setDepartment}
              options={departmentOptions(churchDepartments).filter((option) => !referrals.some((r) => r.department.toLowerCase() === option.value.toLowerCase()))}
              placeholder="Choose a department"
              compact
            />
          </div>
          <button type="button" disabled={!department.trim() || busyId === 'new'} onClick={() => { void logDepartment(); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Log</button>
          <button type="button" onClick={() => { setAdding(false); setDepartment(''); }} className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-500">Cancel</button>
        </div>
      )}
    </div>
  );
};

export default DepartmentHandoff;
