import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmationModal from '../ConfirmationModal';
import Spinner from '../Spinner';
import { followUpChecksApi, settingsApi } from '../../services/api';
import type { FollowUpReassignmentSummary } from '../../types';

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

const REASON: Record<string, string> = {
  NO_RESPONSE: 'No answer',
  NOT_NOW: 'Said not right now',
  NO_MOVEMENT_AFTER_YES: 'Said yes, no movement',
};
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });

// What the automatic reassignment has done lately, and who is being asked right now.
const ReassignmentSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [data, setData] = useState<FollowUpReassignmentSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    followUpChecksApi.getReassignments(7)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load.'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Automatic reassignment">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] bg-white shadow-[0_-8px_40px_rgba(15,23,42,0.2)] sm:rounded-[32px]">
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
          <div>
            <p className="text-[13px] font-semibold text-primary">Follow-ups</p>
            <h2 className="mt-1 text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-gray-900">Reassigned automatically</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#f2f2f4] text-[18px] leading-none text-gray-500">×</button>
        </div>
        <div className="min-h-[120px] flex-1 overflow-y-auto px-3 pb-6">
          {error ? (
            <p className="px-3 py-8 text-center text-sm text-red-600">{error}</p>
          ) : !data ? (
            <p className="px-3 py-8 text-center text-sm text-gray-500">Loading…</p>
          ) : (
            <>
              <h3 className="px-3 pb-1 pt-3 text-[13px] font-semibold text-gray-500">Being asked now</h3>
              {data.waiting.length === 0 ? (
                <p className="px-3 py-2 text-[14px] text-gray-500">Nobody right now.</p>
              ) : (
                <ul>
                  {data.waiting.map((w) => (
                    <li key={`${w.ownerName}-${w.promptedAt}`} className="rounded-2xl px-3 py-2.5">
                      <p className="text-[15px] font-semibold text-gray-900">{w.ownerName} <span className="font-normal text-gray-500">· {w.people} {w.people === 1 ? 'person' : 'people'}</span></p>
                      <p className="text-[13px] text-gray-500">
                        {w.answer === 'YES' ? 'Said yes' : w.answer === 'NOT_NOW' ? 'Said not right now' : 'Not answered'} · decided by {fmt(w.deadlineAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="px-3 pb-1 pt-4 text-[13px] font-semibold text-gray-500">Last 7 days</h3>
              {data.recent.length === 0 ? (
                <p className="px-3 py-2 text-[14px] text-gray-500">Nobody has been reassigned yet.</p>
              ) : (
                <ul>
                  {data.recent.map((r) => (
                    <li key={r.id} className="rounded-2xl px-3 py-2.5">
                      <p className="text-[15px] font-semibold text-gray-900">{r.contactName}</p>
                      <p className="text-[13px] text-gray-500">{r.fromName ?? 'Someone'} → {r.toName ?? 'Someone'} · {REASON[r.reason] ?? r.reason} · {fmt(r.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Shown on Settings and on the Follow-ups page. Turning automatic assigning on
// asks first, since it starts handing out everyone already waiting.
const FollowUpAssignmentSettings: React.FC<{ waitingCount?: number; onClose?: () => void }> = ({ waitingCount, onClose }) => {
  const [autoAssign, setAutoAssign] = useState(false);
  const [adminAlerts, setAdminAlerts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [autoReassign, setAutoReassign] = useState(true);
  const [showMoves, setShowMoves] = useState(false);
  const [relax, setRelax] = useState({ adder: true, anyGender: true, overLimit: false });
  const [saving, setSaving] = useState<'autoAssign' | 'adminAlerts' | 'autoReassign' | 'adder' | 'anyGender' | 'overLimit' | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([settingsApi.getFollowUpAutoAssignEnabled(), settingsApi.getFollowUpAdminAlertsEnabled(), settingsApi.getFollowUpAutoReassignEnabled(), settingsApi.getFollowUpRelax()])
      .then(([auto, alerts, reassign, relaxed]) => { if (!cancelled) { setAutoAssign(auto); setAdminAlerts(alerts); setAutoReassign(reassign); setRelax(relaxed); } })
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
        Same gender first, and only to supports who used the app in the last week. Whoever added them gets them first if they have room; otherwise the same-gender support with the fewest open follow-ups. If nobody fits, the steps below relax the rules, in order.
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
            label="Hand people to active supports"
            description="Checks in with supports who haven't moved their people. No reply and the people are reassigned."
            checked={autoReassign}
            disabled={saving === 'autoReassign'}
            onChange={(next) => {
              setSaving('autoReassign');
              setAutoReassign(next);
              settingsApi.setFollowUpAutoReassignEnabled(next).catch(() => setAutoReassign(!next)).finally(() => setSaving(null));
            }}
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
      {!loading && (
        <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-2">
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">If no same-gender support has room</p>
          <div className="divide-y divide-gray-100">
            <ToggleRow
              label="1 · Whoever added them"
              description="Give them to the person who added them, even if not the same gender, if they are active and under the limit."
              checked={relax.adder}
              disabled={saving === 'adder'}
              onChange={(next) => {
                setSaving('adder'); setRelax((prev) => ({ ...prev, adder: next }));
                settingsApi.setFollowUpRelax('adder', next).catch(() => setRelax((prev) => ({ ...prev, adder: !next }))).finally(() => setSaving(null));
              }}
            />
            <ToggleRow
              label="2 · Any active support"
              description="Give them to any support who used the app this week and is under the limit, fewest open follow-ups first."
              checked={relax.anyGender}
              disabled={saving === 'anyGender'}
              onChange={(next) => {
                setSaving('anyGender'); setRelax((prev) => ({ ...prev, anyGender: next }));
                settingsApi.setFollowUpRelax('anyGender', next).catch(() => setRelax((prev) => ({ ...prev, anyGender: !next }))).finally(() => setSaving(null));
              }}
            />
            <ToggleRow
              label="3 · Go over the limit"
              description="Last resort: ignore the follow-up limit and use the active support with the fewest open, same gender first."
              checked={relax.overLimit}
              disabled={saving === 'overLimit'}
              onChange={(next) => {
                setSaving('overLimit'); setRelax((prev) => ({ ...prev, overLimit: next }));
                settingsApi.setFollowUpRelax('overLimit', next).catch(() => setRelax((prev) => ({ ...prev, overLimit: !next }))).finally(() => setSaving(null));
              }}
            />
          </div>
        </div>
      )}
      {!loading && (
        <button type="button" onClick={() => setShowMoves(true)} className="mt-3 text-sm font-semibold text-primary hover:underline">
          See who was reassigned
        </button>
      )}
      {showMoves && <ReassignmentSheet onClose={() => setShowMoves(false)} />}
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
