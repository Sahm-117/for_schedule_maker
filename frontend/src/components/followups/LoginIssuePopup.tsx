import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '../Spinner';

interface LoginIssuePopupProps {
  contactName: string;
  /** Resolve to close the popup; throw to keep it open with the message shown. */
  onSubmit: (description: string) => Promise<void>;
  onCancel: () => void;
}

// Asked when a support picks "Issue with login": what's wrong goes to the
// admins and IT Support with the alert. Same sheet as NotInterestedPopup, in
// the soft-card / pill-button style of My Hub.
const LoginIssuePopup: React.FC<LoginIssuePopupProps> = ({ contactName, onSubmit, onCancel }) => {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!description.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit(description.trim());
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That didn't save. Please try again.");
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/35" onClick={() => { if (!saving) onCancel(); }} />
      <div className="relative mb-20 w-[90vw] max-w-[340px] rounded-[28px] bg-white p-6 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_28px_80px_-12px_rgba(15,23,42,0.28)] sm:mb-0" onClick={(e) => e.stopPropagation()}>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Issue with login</p>
        <p className="mb-4 truncate text-center text-sm font-semibold text-gray-900">{contactName}</p>

        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400" htmlFor="login-issue-description">What's the problem?</label>
        <textarea
          id="login-issue-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. The code isn't working, or they changed phone"
          autoFocus
          className="mt-1.5 min-h-[104px] w-full resize-y rounded-2xl border-0 bg-[#f5f5f7] px-4 py-3.5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <p className="mt-1.5 text-xs text-gray-500">The admins and IT Support will see this.</p>
        {error && <p className="mt-2 rounded-2xl bg-red-100/80 px-3.5 py-2 text-xs font-semibold text-red-700">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="flex-1 rounded-full bg-[#f2f2f4] px-5 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Cancel</button>
          <button
            type="button"
            disabled={!description.trim() || saving}
            onClick={() => { void submit(); }}
            className="flex-1 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Sending…</span>) : 'Submit'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LoginIssuePopup;
