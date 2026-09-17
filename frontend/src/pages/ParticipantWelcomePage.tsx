import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { participantAccountsApi } from '../services/api';

// First sign-in for a participant: they arrive with the code their support sent
// and choose their own password before anything else. Matches the V2 design's
// "Set your password" screen.

const EYE = 'M1 12s4-7.5 11-7.5S23 12 23 12s-4 7.5-11 7.5S1 12 1 12Z';
const EYE_OFF = 'M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-7.5a11.8 11.8 0 0 1 3.06-4.44M9.9 4.24A10.6 10.6 0 0 1 12 4c5 0 9.27 3.11 11 7.5a11.8 11.8 0 0 1-1.67 2.68M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22';

const PasswordField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
}> = ({ label, value, onChange, placeholder, error }) => {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-gray-900">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[48px] w-full rounded-xl border border-gray-200 py-3 pl-3.5 pr-12 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 grid -translate-y-1/2 place-items-center p-1.5 text-gray-500"
        >
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d={visible ? EYE_OFF : EYE} />
            {!visible && <circle cx="12" cy="12" r="3" strokeWidth="1.8" />}
          </svg>
        </button>
      </div>
      {error && <span className="mt-1 block text-xs font-medium text-red-700">{error}</span>}
    </label>
  );
};

const ParticipantWelcomePage: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Straight after choosing a password, go to Profile to complete it.
  const [justSet, setJustSet] = useState(false);

  if (!user) return null;
  if (!user.mustChangePassword) return <Navigate to={justSet ? '/me/profile?welcome=1' : '/me'} replace />;

  const passwordError = touched && password.length < 8 ? 'Use at least 8 characters.' : '';
  const confirmError = touched && !passwordError && password !== confirm ? 'These do not match.' : '';

  const submit = async () => {
    setTouched(true);
    if (password.length < 8 || password !== confirm) return;
    setSaving(true);
    setError('');
    try {
      await participantAccountsApi.setOwnPassword(password);
      setJustSet(true);
      refreshUser({ mustChangePassword: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'SESSION_EXPIRED') { logout(); return; }
      setError(message || 'Could not save your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] px-4 py-8">
      <div className="mx-auto w-full max-w-md">
        <img src="/logo-full.png" alt="The Covenant Nation | Ikorodu" className="mx-auto mb-6 h-10 w-auto object-contain" />
        <section className="rounded-[20px] border border-[#eef0f4] bg-white p-[22px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]">
          <div className="flex items-center gap-3">
            <span className="grid h-[42px] w-[42px] flex-none place-items-center rounded-full bg-[#fff1e7] text-[#c2410c]">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-12V7a4 4 0 0 0-8 0v4h8Z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900">Set your password</h1>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Welcome to {user.cohortName || 'FOF'}. Choose a password you will remember.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-[#f6f7f9] px-3.5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.04em] text-gray-400">Signing in as</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{user.phone}</p>
            <p className="mt-0.5 text-xs text-gray-500">Your support registered this number for you.</p>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <PasswordField label="New password" value={password} onChange={setPassword} placeholder="At least 8 characters" error={passwordError} />
            <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Type it again" error={confirmError} />
            {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
            <button
              type="button"
              onClick={() => { void submit(); }}
              disabled={saving}
              className="min-h-[48px] w-full rounded-xl bg-primary p-3 text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save and continue'}
            </button>
          </div>

          <div className="mt-3.5 flex items-start gap-2 rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-[12.5px] leading-normal text-gray-500">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
            </svg>
            <span>Only you know this password. Your support can help you reset it, but cannot see it.</span>
          </div>
        </section>

        <button type="button" onClick={logout} className="mx-auto mt-5 block text-[13px] font-semibold text-gray-500">
          Sign out
        </button>
      </div>
    </div>
  );
};

export default ParticipantWelcomePage;
