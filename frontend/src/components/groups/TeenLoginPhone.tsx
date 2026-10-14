import React, { useEffect, useState } from 'react';
import { participantAccountsApi } from '../../services/api';
import type { Participant, TeenLoginState } from '../../types';

// A teen's own number is a second way into the same login (same password as their guardian's number).
// A Teen Support adds it here, and only once the parent or guardian has signed in and chosen a password.

const TeenLoginPhone: React.FC<{ participant: Participant }> = ({ participant }) => {
  const isTeen = participant.ageRange === '10 - 17';
  const [state, setState] = useState<TeenLoginState | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isTeen) return undefined;
    let cancelled = false;
    // If this cannot be read, the row simply stays hidden.
    participantAccountsApi.getTeenLoginState([participant.id])
      .then((rows) => { if (!cancelled) setState(rows[0] ?? null); })
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, [isTeen, participant.id]);

  if (!isTeen || !state || state.status === 'NOT_TEEN') return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      setState(await participantAccountsApi.setTeenLoginPhone(participant.id, value.trim()));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the number.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError('');
    try {
      setState(await participantAccountsApi.setTeenLoginPhone(participant.id, null, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the number.');
    } finally {
      setSaving(false);
    }
  };

  const link = 'text-[12.5px] font-semibold text-primary disabled:opacity-50';
  return (
    <div className="mt-3 rounded-xl bg-gray-50 px-3 py-2.5" data-teen-login>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Their own number to sign in</p>
      {editing ? (
        <div className="mt-1.5">
          <div className="flex items-center gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 0803 000 0000"
              aria-label="Teen's own phone number"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button type="button" onClick={() => { void save(); }} disabled={saving || !value.trim()} className="rounded-xl bg-primary px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{saving ? 'Saving' : 'Save'}</button>
            <button type="button" onClick={() => { setEditing(false); setError(''); }} disabled={saving} className="text-[13px] font-medium text-gray-500">Cancel</button>
          </div>
          <p className="mt-1.5 text-[12px] text-gray-500">They sign in with this number and the same password their parent or guardian chose.</p>
        </div>
      ) : state.status === 'LOCKED' ? (
        <p className="mt-0.5 text-[13px] text-gray-500">Waiting for their parent or guardian to sign in and choose a password first.</p>
      ) : state.status === 'SET' ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[14px] font-semibold text-gray-800">{state.ownPhone}</span>
          <button type="button" onClick={() => { setValue(state.ownPhone ?? ''); setEditing(true); }} disabled={saving} className={link}>Change</button>
          <button type="button" onClick={() => { void remove(); }} disabled={saving} className="text-[12.5px] font-semibold text-gray-500 disabled:opacity-50">Remove</button>
        </div>
      ) : (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[13px] text-gray-500">None yet. They sign in with their parent or guardian's number.</span>
          <button type="button" onClick={() => { setValue(''); setEditing(true); }} className={link}>Add number</button>
        </div>
      )}
      {error && <p className="mt-1.5 text-[12.5px] text-red-600">{error}</p>}
    </div>
  );
};

export default TeenLoginPhone;
