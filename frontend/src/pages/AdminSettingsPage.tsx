import React, { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import NotificationSettings from '../components/NotificationSettings';
import AppSelect from '../components/AppSelect';
import { aiApi, settingsApi } from '../services/api';
import type { AiSettings } from '../types';
import { DEFAULT_PROGRAMME_RULES, type ProgrammeRules } from '../utils/programmeRules';
import { DEFAULT_RECAP_RELEASE_TIMES, RECAP_DAY_OPTIONS, type RecapReleaseTimes } from '../utils/recapReleaseTimes';
import type { ChurchDepartment } from '../constants/departments';
import { setChurchDepartmentsCache } from '../hooks/useChurchDepartments';

// Every section on this page reads the same way: a compact summary of what is
// currently set, and nothing editable until you press Edit. Save writes and
// collapses; Cancel throws the edits away and collapses. One wrapper so all of
// them behave identically — the Reminder Preferences card already worked this
// way, with its own pencil.
const SettingsCard: React.FC<{
  title: string;
  description: string;
  /** What is set right now, read-only. Shown whenever the card is collapsed. */
  summary: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  /** Blocks Save while the form is incomplete or nothing has changed. */
  canSave?: boolean;
  saveLabel?: string;
  /** Sits beside Cancel in edit mode, e.g. "Reset to agreed defaults". */
  extraAction?: React.ReactNode;
  status?: string;
  loading?: boolean;
  children: React.ReactNode;
}> = ({ title, description, summary, editing, onEdit, onCancel, onSave, saving, canSave = true, saveLabel = 'Save', extraAction, status, loading, children }) => (
  <div className="surface-card p-6">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      {!editing && !loading && (
        <button
          type="button"
          onClick={onEdit}
          className="flex-none rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
        >
          Edit
        </button>
      )}
    </div>

    {loading ? (
      <div className="h-16 animate-pulse rounded-2xl bg-gray-50" />
    ) : editing ? (
      <div className="space-y-4">
        {children}
        <div className="flex flex-wrap items-center gap-3 border-t border-orange-50 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-gray-200 px-5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !canSave}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
          {extraAction}
        </div>
      </div>
    ) : (
      <div className="text-sm text-gray-700">{summary}</div>
    )}

    {status && <p className={`mt-3 text-sm ${/could not|please enter/i.test(status) ? 'text-red-600' : 'text-gray-600'}`}>{status}</p>}
  </div>
);

/** Read-only label/value rows used by the collapsed summaries. */
const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1.5 last:border-0">
    <span className="text-gray-500">{label}</span>
    <span className="flex-none font-semibold tabular-nums text-gray-900">{value}</span>
  </div>
);

// Editable contact behind the floating "Need Support" button. Lets admins change
// who help routes to (name + WhatsApp number) without a deploy.
const SupportContactCard: React.FC = () => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  // The last saved values — Cancel rewinds the form back to these.
  const [savedContact, setSavedContact] = useState({ name: '', phone: '' });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getSupportContact()
      .then((c) => { if (!cancelled) { setName(c.name); setPhone(c.phone); setSavedContact({ name: c.name, phone: c.phone }); } })
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
      setSavedContact({ name, phone });
      setEditing(false);
      setStatus('Saved. The Need Support button now points here.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const INPUT = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';

  return (
    <SettingsCard
      title="Support contact"
      description={'Who the floating \u201CNeed Support\u201D button opens a WhatsApp chat with.'}
      loading={loading}
      editing={editing}
      onEdit={() => { setStatus(''); setEditing(true); }}
      onCancel={() => { setName(savedContact.name); setPhone(savedContact.phone); setStatus(''); setEditing(false); }}
      onSave={() => void handleSave()}
      saving={saving}
      canSave={!!name.trim() && !!phone.trim()}
      status={status}
      summary={savedContact.name || savedContact.phone ? (
        <div>
          <SummaryRow label="Name" value={savedContact.name || '—'} />
          <SummaryRow label="WhatsApp number" value={savedContact.phone || '—'} />
        </div>
      ) : (
        <p className="text-gray-500">No support contact set yet.</p>
      )}
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="e.g. Adetutu" className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp number</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} placeholder="e.g. 2348184742850 or 08184742850" className={INPUT} />
        </div>
      </div>
    </SettingsCard>
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
      { key: 'minTrainingsAttended', label: 'Pre-cohort trainings a support must attend to get a group', unit: 'trainings', max: 20 },
    ],
  },
  {
    section: 'Attendance',
    fields: [
      { key: 'attendanceWindowMinutes', label: 'How long the Sunday register stays open after Start', unit: 'minutes', max: 120 },
    ],
  },
];

// The editor puts the unit beside a number box as a fixed label; the read-only
// summary reads as a sentence, so it needs "1 week", not "1 weeks".
const unitLabel = (unit: string, value: number) =>
  unit === '%' || value === 1 ? unit.replace(/e?s$/, '') : unit;

const ProgrammeRulesCard: React.FC = () => {
  const [rules, setRules] = useState<ProgrammeRules>(DEFAULT_PROGRAMME_RULES);
  const [saved, setSaved] = useState<ProgrammeRules>(DEFAULT_PROGRAMME_RULES);
  const [editing, setEditing] = useState(false);
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
      setEditing(false);
      setStatus('Saved. The dashboard now uses these rules.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Programme rules"
      description={'How participants and supports are judged. Misses add up across the cohort, Late counts as missed unless an admin excuses it, and any single miss marks a participant \u201CKeep an eye on\u201D.'}
      loading={loading}
      editing={editing}
      onEdit={() => { setStatus(''); setEditing(true); }}
      onCancel={() => { setRules(saved); setStatus(''); setEditing(false); }}
      onSave={() => void handleSave()}
      saving={saving}
      canSave={dirty}
      saveLabel="Save rules"
      status={status}
      extraAction={(
        <button
          type="button"
          onClick={() => setRules(DEFAULT_PROGRAMME_RULES)}
          disabled={saving}
          className="text-sm font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          Reset to agreed defaults
        </button>
      )}
      summary={(
        <div className="space-y-3">
          {RULE_FIELDS.map((group) => (
            <div key={group.section}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.section}</p>
              {group.fields.map((field) => (
                <SummaryRow key={field.key} label={field.label} value={`${saved[field.key]} ${unitLabel(field.unit, saved[field.key])}`} />
              ))}
            </div>
          ))}
        </div>
      )}
    >
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
                      disabled={saving}
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
      </div>
    </SettingsCard>
  );
};

// The church departments participants can choose, used by every department
// dropdown. Removing one doesn't change anyone who already chose it.
const ChurchDepartmentsCard: React.FC = () => {
  const [list, setList] = useState<ChurchDepartment[]>([]);
  const [savedList, setSavedList] = useState<ChurchDepartment[]>([]);
  const [editingCard, setEditingCard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    settingsApi.getChurchDepartments()
      .then((value) => { if (!cancelled) { setList(value); setSavedList(value); } })
      .catch(() => { /* keep empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = JSON.stringify(list) !== JSON.stringify(savedList);
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
      setSavedList(value);
      setChurchDepartmentsCache(value);
      setEditing(null);
      setEditingCard(false);
      setStatus('Saved. Department dropdowns now use this list.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setList(savedList);
    setEditing(null);
    setNewName('');
    setNewDescription('');
    setStatus('');
    setEditingCard(false);
  };

  const INPUT = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';
  // Enough names to recognise the list without reprinting all of it.
  const preview = savedList.slice(0, 6).map((d) => d.name).join(', ');

  return (
    <SettingsCard
      title="Church departments"
      description={"The list in every department dropdown. Removing a department doesn't change participants who already chose it."}
      loading={loading}
      editing={editingCard}
      onEdit={() => { setStatus(''); setEditingCard(true); }}
      onCancel={cancel}
      onSave={() => void handleSave()}
      saving={saving}
      canSave={dirty && !list.some((d) => !d.name.trim())}
      saveLabel={`Save list (${list.length})`}
      status={status}
      summary={savedList.length === 0 ? (
        <p className="text-gray-500">No departments yet.</p>
      ) : (
        <p>
          <span className="font-semibold text-gray-900">{savedList.length} department{savedList.length === 1 ? '' : 's'}</span>
          <span className="text-gray-500"> · {preview}{savedList.length > 6 ? `, +${savedList.length - 6} more` : ''}</span>
        </p>
      )}
    >
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
    </SettingsCard>
  );
};

// AI help (OpenRouter free models) for participant summaries, recap drafts and
// feedback themes. Free models come and go, so admins can change the list.
const AiSettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [modelsText, setModelsText] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    aiApi.getSettings()
      .then((value) => { setSettings(value); setEnabled(value.enabled); setModelsText(value.models.join('\n')); })
      .catch(() => setMessage('Could not load AI settings.'));
  }, []);

  const models = modelsText.split('\n').map((line) => line.trim()).filter(Boolean);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const next = { ...settings, enabled, models };
      await aiApi.saveSettings(next);
      setSettings(next);
      setEditing(false);
      setMessage('Saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (settings) { setEnabled(settings.enabled); setModelsText(settings.models.join('\n')); }
    setMessage('');
    setEditing(false);
  };

  const dirty = !!settings && (enabled !== settings.enabled || models.join('\n') !== settings.models.join('\n'));

  return (
    <SettingsCard
      title="AI help"
      description="End-of-FOF summaries (only for participants who opt in), recap drafts and feedback themes, using free OpenRouter models. The free plan allows about 50 requests a day."
      loading={!settings}
      editing={editing}
      onEdit={() => { setMessage(''); setEditing(true); }}
      onCancel={cancel}
      onSave={() => void handleSave()}
      saving={saving}
      canSave={dirty && models.length > 0}
      saveLabel="Save models"
      status={message}
      summary={settings && (
        <div>
          <SummaryRow label="AI help" value={settings.enabled ? 'On' : 'Off'} />
          <SummaryRow label="Models, tried in order" value={`${settings.models.length} model${settings.models.length === 1 ? '' : 's'}`} />
        </div>
      )}
    >
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-3 py-2">
        <span className="text-sm text-gray-700">AI help is {enabled ? 'on' : 'off'}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="AI help"
          onClick={() => setEnabled((v) => !v)}
          disabled={saving}
          className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition disabled:opacity-60 ${enabled ? 'bg-primary' : 'bg-slate-200'}`}
        >
          <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
        </button>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Models, tried in order</span>
        <textarea value={modelsText} onChange={(e) => setModelsText(e.target.value)} rows={4} className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 font-mono text-xs focus:border-primary focus:outline-none" />
        <span className="mt-1 block text-xs text-gray-500">One OpenRouter model id per line. If one is busy, the next is used.</span>
      </label>
    </SettingsCard>
  );
};

// Format "HH:MM" (24h) as "4:00 PM" for the read-only summary.
const formatTimeOfDay = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const dayLabel = (value: string) => RECAP_DAY_OPTIONS.find((d) => d.value === value)?.label ?? value;

// When supports and participants get a week's recap. Days are counted from
// the week's class Sunday: Sunday = that Sunday itself, Monday = the day
// after, and so on. Mirrors ProgrammeRulesCard's view/edit shape.
const RecapTimingsCard: React.FC = () => {
  const [times, setTimes] = useState<RecapReleaseTimes>(DEFAULT_RECAP_RELEASE_TIMES);
  const [saved, setSaved] = useState<RecapReleaseTimes>(DEFAULT_RECAP_RELEASE_TIMES);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    settingsApi.getRecapReleaseTimes()
      .then((value) => { if (!cancelled) { setTimes(value); setSaved(value); } })
      .catch(() => { /* defaults stay */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = (Object.keys(times) as Array<keyof RecapReleaseTimes>).some((key) => times[key] !== saved[key]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const value = await settingsApi.setRecapReleaseTimes(times);
      setTimes(value);
      setSaved(value);
      setEditing(false);
      setStatus('Saved. New release times apply from now on.');
    } catch {
      setStatus('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Timings"
      description="When each week's recap reaches supports and participants."
      loading={loading}
      editing={editing}
      onEdit={() => { setStatus(''); setEditing(true); }}
      onCancel={() => { setTimes(saved); setStatus(''); setEditing(false); }}
      onSave={() => void handleSave()}
      saving={saving}
      canSave={dirty}
      saveLabel="Save timings"
      status={status}
      summary={(
        <div className="space-y-1.5">
          <SummaryRow label="Supports" value={`${dayLabel(saved.supportDay)}, ${formatTimeOfDay(saved.supportTime)}`} />
          <SummaryRow label="Participants" value={`${dayLabel(saved.participantDay)}, ${formatTimeOfDay(saved.participantTime)}`} />
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Supports</p>
          <div className="grid grid-cols-2 gap-3">
            <AppSelect
              value={times.supportDay}
              onChange={(v) => setTimes((prev) => ({ ...prev, supportDay: v }))}
              options={RECAP_DAY_OPTIONS}
              placeholder="Day"
              compact
              disabled={saving}
            />
            <input
              type="time"
              value={times.supportTime}
              disabled={saving}
              onChange={(e) => setTimes((prev) => ({ ...prev, supportTime: e.target.value }))}
              className="w-full rounded-2xl border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Participants</p>
          <div className="grid grid-cols-2 gap-3">
            <AppSelect
              value={times.participantDay}
              onChange={(v) => setTimes((prev) => ({ ...prev, participantDay: v }))}
              options={RECAP_DAY_OPTIONS}
              placeholder="Day"
              compact
              disabled={saving}
            />
            <input
              type="time"
              value={times.participantTime}
              disabled={saving}
              onChange={(e) => setTimes((prev) => ({ ...prev, participantTime: e.target.value }))}
              className="w-full rounded-2xl border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">Days count from that week's class Sunday — "Sunday" is class day itself, "Monday" the day after, and so on.</p>
      </div>
    </SettingsCard>
  );
};

const AdminSettingsPage: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Settings"
        tourId="admin:settings"
        subtitle="Notification timings, the support contact, programme rules, church departments and AI help."
      />

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Programme</h2>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div data-wt="settings-rules"><ProgrammeRulesCard /></div>
        <div data-wt="settings-departments"><ChurchDepartmentsCard /></div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div data-wt="settings-timings"><RecapTimingsCard /></div>
        <div data-wt="settings-contact"><SupportContactCard /></div>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div data-wt="settings-ai"><AiSettingsCard /></div>
      </div>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Just for you</h2>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div data-wt="settings-notifications"><NotificationSettings isOpen onClose={() => {}} embedded /></div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
