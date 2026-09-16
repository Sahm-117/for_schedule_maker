import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import NotificationSettings from '../components/NotificationSettings';
import { settingsApi } from '../services/api';
import { DEFAULT_PROGRAMME_RULES, type ProgrammeRules } from '../utils/programmeRules';

// Editable contact behind the floating "Need Support" button. Lets admins change
// who help routes to (name + WhatsApp number) without a deploy.
const SupportContactCard: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getSupportContact()
      .then((c) => { if (!cancelled) { setName(c.name); setPhone(c.phone); } })
      .catch(() => { /* keep blank on error */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      setStatus('Please enter both a name and a phone number.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      await settingsApi.setSupportContact({ name, phone });
      setStatus('Saved. The Need Support button now points here.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Support contact</h3>
        <p className="mt-1 text-sm text-gray-500">Who the floating “Need Support” button opens a WhatsApp chat with.</p>
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading || saving}
            placeholder="e.g. Adetutu"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading || saving}
            placeholder="e.g. 2348184742850 or 08184742850"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {status && (
          <p className={`text-sm ${status.toLowerCase().includes('could not') || status.toLowerCase().includes('please enter') ? 'text-red-600' : 'text-gray-600'}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
};

// The rules the dashboard judges participants and supports by. Agreed with
// leadership; editable here so they can change without a developer.
const RULE_FIELDS: Array<{ section: string; fields: Array<{ key: keyof ProgrammeRules; label: string; unit: string; max: number }> }> = [
  {
    section: 'Completion',
    fields: [
      { key: 'completionAttendancePct', label: 'Sunday classes a participant must attend to complete FOF', unit: '%', max: 100 },
      { key: 'cohortSuccessPct', label: 'Participants who must complete for the cohort to count as a success', unit: '%', max: 100 },
    ],
  },
  {
    section: 'Participants',
    fields: [
      { key: 'participantRedSundayMisses', label: 'Sunday misses before “Needs attention”', unit: 'misses', max: 20 },
      { key: 'participantRedMeetingMisses', label: 'Group meeting misses before “Needs attention”', unit: 'misses', max: 20 },
    ],
  },
  {
    section: 'Supports',
    fields: [
      { key: 'supportAmberMissedWeeks', label: 'Unrecorded weeks before “Keep an eye on”', unit: 'weeks', max: 20 },
      { key: 'supportRedMissedWeeks', label: 'Unrecorded weeks before “Needs attention”', unit: 'weeks', max: 20 },
      { key: 'onboardingMaxDays', label: 'Days a support has to onboard their group', unit: 'days', max: 60 },
    ],
  },
];

const ProgrammeRulesCard: React.FC = () => {
  const [rules, setRules] = useState<ProgrammeRules>(DEFAULT_PROGRAMME_RULES);
  const [saved, setSaved] = useState<ProgrammeRules>(DEFAULT_PROGRAMME_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getProgrammeRules()
      .then((value) => { if (!cancelled) { setRules(value); setSaved(value); } })
      .catch(() => { /* defaults stay */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = (Object.keys(rules) as Array<keyof ProgrammeRules>).some((key) => rules[key] !== saved[key]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const value = await settingsApi.setProgrammeRules(rules);
      setRules(value);
      setSaved(value);
      setStatus('Saved. The dashboard now uses these rules.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Programme rules</h3>
        <p className="mt-1 text-sm text-gray-500">
          How participants and supports are judged. Misses add up across the cohort, Late counts as attended, and any single miss marks a participant “Keep an eye on”.
        </p>
      </div>
      <div className="space-y-5">
        {RULE_FIELDS.map((group) => (
          <div key={group.section}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.section}</p>
            <div className="space-y-2">
              {group.fields.map((field) => (
                <label key={field.key} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-700">{field.label}</span>
                  <span className="flex flex-none items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={field.max}
                      value={rules[field.key]}
                      disabled={loading || saving}
                      onChange={(e) => {
                        const n = Math.min(field.max, Math.max(0, Number(e.target.value)));
                        setRules((prev) => ({ ...prev, [field.key]: Number.isFinite(n) ? n : 0 }));
                      }}
                      className="w-16 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                    />
                    <span className="w-12 text-xs text-gray-500">{field.unit}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-gray-500">Completion score: 100% if they also attended every group meeting, 90% if not. Below the attendance rule, they retake FOF.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving || !dirty}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save rules'}
          </button>
          <button
            type="button"
            onClick={() => setRules(DEFAULT_PROGRAMME_RULES)}
            disabled={loading || saving}
            className="text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Reset to agreed defaults
          </button>
        </div>
        {status && <p className={`text-sm ${status.startsWith('Could not') ? 'text-red-600' : 'text-gray-600'}`}>{status}</p>}
      </div>
    </div>
  );
};

const AdminSettingsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Control notification timings, the support contact and programme rules."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <NotificationSettings isOpen onClose={() => {}} embedded />

        <SupportContactCard />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ProgrammeRulesCard />
      </div>
    </div>
  );
};

export default AdminSettingsPage;
