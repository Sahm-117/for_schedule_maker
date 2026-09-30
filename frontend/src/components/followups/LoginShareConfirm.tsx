import React, { useState } from 'react';

// "Did you send <name> their login?" It stays until the support answers:
// Yes moves them to Login shared, Not yet leaves them at Registered.

interface LoginShareConfirmProps {
  name: string;
  onYes: () => Promise<void> | void;
  onNotYet: () => void;
  /** 'banner' names the person, since it sits away from their card. */
  variant?: 'card' | 'banner';
  className?: string;
}

const LoginShareConfirm: React.FC<LoginShareConfirmProps> = ({ name, onYes, onNotYet, variant = 'card', className = '' }) => {
  const [saving, setSaving] = useState(false);
  const firstName = name.split(' ')[0];
  const yes = async () => {
    setSaving(true);
    try { await onYes(); } finally { setSaving(false); }
  };
  return (
    <div role="group" aria-label={`Did you send ${name} their login?`} className={`rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2.5 ${className}`}>
      <p className="text-[13px] font-semibold leading-snug text-amber-900">
        {variant === 'banner' ? `Did you send ${name} their login?` : `Did you send ${firstName} their login?`}
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={saving} onClick={() => void yes()} className="min-h-[38px] flex-[2] rounded-[10px] bg-amber-600 px-3 text-[13px] font-semibold text-white disabled:opacity-60">
          {saving ? 'Saving…' : 'Yes, mark Login shared'}
        </button>
        <button type="button" disabled={saving} onClick={onNotYet} className="min-h-[38px] flex-1 rounded-[10px] border border-amber-300 bg-white px-3 text-[13px] font-semibold text-amber-800 disabled:opacity-60">
          Not yet
        </button>
      </div>
    </div>
  );
};

export default LoginShareConfirm;
