import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import NotificationSettings from '../components/NotificationSettings';
import { settingsApi } from '../services/api';
import { DEFAULT_PROGRAMME_RULES, type ProgrammeRules } from '../utils/programmeRules';
import type { ChurchDepartment } from '../constants/departments';
import { setChurchDepartmentsCache } from '../hooks/useChurchDepartments';

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

// The church departments participants can choose, used by every department
// dropdown. Removing one doesn't change anyone who already chose it.
const ChurchDepartmentsCard: React.FC = () => {
  const [list, setList] = useState<ChurchDepartment[]>([]);
  const [saved, setSaved] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi.getChurchDepartments()
      .then((value) => { if (!cancelled) { setList(value); setSaved(JSON.stringify(value)); } })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = JSON.stringify(list) !== saved;
  const duplicate = newName.trim() && list.some((d) => d.name.toLowerCase() === newName.trim().toLowerCase());

  const add = () => {
    if (!newName.trim() || duplicate) return;
    setList((prev) => [...prev, { name: newName.trim(), ...(newDescription.trim() ? { description: newDescription.trim() } : {}) }].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName('');
    setNewDescription('');
    setStatus('');
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const value = await settingsApi.setChurchDepartments(list);
      setList(value);
      setSaved(JSON.stringify(value));
      setChurchDepartmentsCache(value);
      setEditing(null);
      setStatus('Saved. Department dropdowns now use this list.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const INPUT = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';

  return (
    <div className="surface-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Church departments</h3>
        <p className="mt-1 text-sm text-gray-500">
          The list in every department dropdown. Removing a department doesn't change participants who already chose it.
        </p>
      </div>
      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-gray-50" />
      ) : (
        <div className="space-y-4">
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {list.map((dept, index) => (
              <li key={`${dept.name}-${index}`} className="rounded-2xl bg-gray-50 px-3 py-2">
                {editing === index ? (
                  <div className="space-y-2">
                    <input value={dept.name} onChange={(e) => setList((prev) => prev.map((d, i) => (i === index ? { ...d, name: e.target.value } : d)))} className={INPUT} aria-label="Department name" />
                    <input value={dept.description ?? ''} onChange={(e) => setList((prev) => prev.map((d, i) => (i === index ? { ...d, description: e.target.value } : d)))} placeholder="Short description (optional)" className={INPUT} aria-label="Department description" />
                    <button type="button" onClick={() => setEditing(null)} className="text-xs font-semibold text-primary">Done</button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">{dept.name}</p>
                      {dept.description && <p className="text-xs text-gray-500">{dept.description}</p>}
                    </div>
                    <button type="button" onClick={() => setEditing(index)} className="flex-none text-xs font-semibold text-gray-600 hover:text-gray-900">Edit</button>
                    <button
                      type="button"
                      onClick={() => { setList((prev) => prev.filter((_, i) => i !== index)); setEditing(null); }}
                      className="flex-none text-xs font-semibold text-red-600 hover:text-red-700"
                      aria-label={`Remove ${dept.name}`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="space-y-2 rounded-2xl border border-dashed border-gray-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add a department</p>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Name, e.g. Protocol" className={INPUT} disabled={saving} />
            <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Short description (optional)" className={INPUT} disabled={saving} />
            {duplicate && <p className="text-xs text-red-600">That department is already on the list.</p>}
            <button type="button" onClick={add} disabled={!newName.trim() || !!duplicate || saving} className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Add to list</button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !dirty || list.some((d) => !d.name.trim())}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save list (${list.length})`}
            </button>
            {dirty && <span className="text-xs text-gray-500">Unsaved changes</span>}
          </div>
          {status && <p className={`text-sm ${status.startsWith('Could not') ? 'text-red-600' : 'text-gray-600'}`}>{status}</p>}
        </div>
      )}
    </div>
  );
};

const AdminSettingsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Notification timings, the support contact, programme rules and church departments."
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <NotificationSettings isOpen onClose={() => {}} embedded />

        <SupportContactCard />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ProgrammeRulesCard />
        <ChurchDepartmentsCard />
      </div>
    </div>
  );
};

export default AdminSettingsPage;
