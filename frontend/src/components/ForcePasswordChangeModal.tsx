import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { usersApi } from '../services/api';

// Shown after an admin resets someone's password: they can't use the app until
// they replace the temporary password with one only they know.

const INPUT = 'w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const ForcePasswordChangeModal: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user?.mustChangePassword) return null;

  const submit = async () => {
    if (next.length < 8) { setError('Your new password must be at least 8 characters.'); return; }
    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    if (next === current) { setError('Choose a password different from the temporary one.'); return; }
    setSaving(true);
    setError('');
    try {
      await usersApi.changeOwnPassword(user.id, current, next);
      refreshUser({ mustChangePassword: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password could not be changed.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-3xl">
        <h2 className="text-lg font-bold text-gray-900">Choose a new password</h2>
        <p className="mt-1 text-sm text-gray-500">
          Your password was reset by an administrator. Pick a new one to carry on — only you should know it.
        </p>

        <div className="mt-5 flex flex-col gap-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Temporary password</span>
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={INPUT} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">New password</span>
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={INPUT} />
            <span className="mt-1 block text-xs text-gray-500">At least 8 characters.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              className={INPUT}
            />
          </label>

          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}

          <button
            type="button"
            onClick={() => { void submit(); }}
            disabled={saving || !current || !next || !confirm}
            className="min-h-[48px] rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save new password'}
          </button>
          <button type="button" onClick={logout} className="text-sm font-semibold text-gray-500 hover:text-gray-700">
            Sign out instead
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ForcePasswordChangeModal;
