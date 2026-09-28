import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import { settingsApi } from '../../services/api';

const ToggleRow: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, description, checked, disabled, onChange }) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-gray-900">{label}</p>
      <p className="mt-0.5 text-xs text-gray-500">{description}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-slate-200'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

// Shown on Settings and on the Follow-ups page. Turning automatic assigning on
// asks first, since it starts handing out everyone already waiting.
const FollowUpAssignmentSettings: React.FC<{ waitingCount?: number; onClose?: () => void }> = ({ waitingCount, onClose }) => {
  const [autoAssign, setAutoAssign] = useState(false);
  const [adminAlerts, setAdminAlerts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'autoAssign' | 'adminAlerts' | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([settingsApi.getFollowUpAutoAssignEnabled(), settingsApi.getFollowUpAdminAlertsEnabled()])
      .then(([auto, alerts]) => { if (!cancelled) { setAutoAssign(auto); setAdminAlerts(alerts); } })
      .catch(() => { /* keep defaults on error */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const saveAutoAssign = (next: boolean) => {
    setSaving('autoAssign');
    setAutoAssign(next);
    settingsApi.setFollowUpAutoAssignEnabled(next).catch(() => setAutoAssign(!next)).finally(() => setSaving(null));
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-gray-900">Follow-up auto-assignment</h3>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid h-9 w-9 flex-none place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Same gender only. Whoever added them gets them first if they have room; otherwise it goes to the same-gender support with the fewest open follow-ups.
      </p>
      {loading ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : (
        <div className="mt-2 divide-y divide-gray-100">
          <ToggleRow
            label="Assign automatically"
            description="Anyone still unassigned 2 hours after being added gets handed to a support."
            checked={autoAssign}
            disabled={saving === 'autoAssign'}
            onChange={(next) => { if (next) setConfirmOn(true); else saveAutoAssign(false); }}
          />
          <ToggleRow
            label="Alert admins when someone's stuck"
            description="While anyone is waiting unassigned, admins get a reminder every 2 hours (one alert, not one per person)."
            checked={adminAlerts}
            disabled={saving === 'adminAlerts'}
            onChange={(next) => {
              setSaving('adminAlerts');
              setAdminAlerts(next);
              settingsApi.setFollowUpAdminAlertsEnabled(next).catch(() => setAdminAlerts(!next)).finally(() => setSaving(null));
            }}
          />
        </div>
      )}
      {/* Portalled and lifted above the Follow-ups pop-up (z-[120]), which would otherwise trap or cover it. */}
      {createPortal(
        <div className="relative z-[130]">
        <ConfirmationModal
          isOpen={confirmOn}
          onClose={() => setConfirmOn(false)}
          onConfirm={() => { setConfirmOn(false); saveAutoAssign(true); }}
          title="Turn on automatic assigning?"
          message={`${typeof waitingCount === 'number' ? `${waitingCount} ${waitingCount === 1 ? 'person is' : 'people are'} waiting now. ` : ''}Within about 10 minutes, anyone who has waited 2 hours or more goes to a same-gender support, and each support gets the usual new follow-up alert.`}
          confirmText="Turn on"
          type="warning"
        />
        </div>,
        document.body
      )}
    </div>
  );
};

export default FollowUpAssignmentSettings;
