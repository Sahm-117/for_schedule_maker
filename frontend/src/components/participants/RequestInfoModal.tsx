import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../followups/ModalShell';
import SegmentedTabs from '../SegmentedTabs';
import AppMultiSelect from '../AppMultiSelect';
import { useToast } from '../Toast';
import { useAuth } from '../../hooks/useAuth';
import { useAppData } from '../../context/AppDataContext';
import { groupsApi, participantPushApi, participantsApi, profileFieldsApi } from '../../services/api';
import type { Group, Participant, ProfileField, ProfileFieldType } from '../../types';

// "Request information": admins add a field to participants' profiles and choose
// who it is for — one or more cohorts (all groups or selected groups), or specific
// participants. The rule is kept, so people who join later are asked too.
// Required fields count towards profile completion; optional ones do not.

const TYPES: Array<{ value: ProfileFieldType; label: string }> = [
  { value: 'SHORT_TEXT', label: 'Short text' },
  { value: 'LONG_TEXT', label: 'Long text' },
  { value: 'DATE', label: 'Date' },
  { value: 'CHOICE', label: 'List choice' },
  { value: 'YES_NO', label: 'Yes / No' },
];
const TYPE_LABEL = Object.fromEntries(TYPES.map((type) => [type.value, type.label])) as Record<ProfileFieldType, string>;
const INPUT = 'w-full rounded-2xl border border-gray-300 px-4 py-2.5 text-sm focus:border-primary focus:outline-none';
const LABEL = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500';

interface RequestInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RequestInfoModal: React.FC<RequestInfoModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { cohorts, activeCohort } = useAppData();
  const toast = useToast();
  const [tab, setTab] = useState<'new' | 'list'>('new');

  const [label, setLabel] = useState('');
  const [helpText, setHelpText] = useState('');
  const [fieldType, setFieldType] = useState<ProfileFieldType>('SHORT_TEXT');
  const [optionsText, setOptionsText] = useState('');
  const [required, setRequired] = useState(true);
  const [audience, setAudience] = useState<'GROUPS' | 'PEOPLE'>('GROUPS');
  const [cohortIds, setCohortIds] = useState<string[]>([]);
  const [allGroups, setAllGroups] = useState(true);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Participant[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const [fields, setFields] = useState<ProfileField[]>([]);
  const [summary, setSummary] = useState<Map<string, { applies: number; answered: number }>>(new Map());
  const [stopping, setStopping] = useState<string | null>(null);

  const reset = () => {
    setLabel(''); setHelpText(''); setFieldType('SHORT_TEXT'); setOptionsText(''); setRequired(true);
    setAudience('GROUPS'); setCohortIds(activeCohort ? [activeCohort.id] : []); setAllGroups(true); setGroupIds([]); setParticipantIds([]);
    setError('');
  };

  useEffect(() => {
    if (!isOpen) return;
    reset();
    setTab('new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Groups and participants in the chosen cohorts, for the pickers.
  useEffect(() => {
    if (!isOpen || cohortIds.length === 0) { setGroups([]); setPeople([]); return; }
    let cancelled = false;
    Promise.all(cohortIds.map((cohortId) => Promise.all([
      groupsApi.getAll({ cohortId }).then((res) => res.groups).catch(() => [] as Group[]),
      participantsApi.getAll({ cohortId }).then((res) => res.participants).catch(() => [] as Participant[]),
    ]))).then((results) => {
      if (cancelled) return;
      setGroups(results.flatMap(([gs]) => gs));
      setPeople(results.flatMap(([, ps]) => ps));
    });
    return () => { cancelled = true; };
  }, [isOpen, cohortIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadList = async () => {
    const [{ fields: all }, counts] = await Promise.all([profileFieldsApi.getAll(), profileFieldsApi.getSummary()]);
    setFields(all);
    setSummary(counts);
  };

  useEffect(() => {
    if (isOpen && tab === 'list') void loadList().catch(() => toast({ message: 'Could not load requested fields.', tone: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab]);

  const cohortName = useMemo(() => new Map(cohorts.map((cohort) => [cohort.id, cohort.name])), [cohorts]);
  const cohortLabel = (id: string) => cohortName.get(id) ?? 'Cohort';

  const send = async () => {
    if (!user) return;
    const options = optionsText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!label.trim()) { setError('Give the field a name.'); return; }
    if (fieldType === 'CHOICE' && options.length < 2) { setError('Add at least two choices, one per line.'); return; }
    if (cohortIds.length === 0) { setError('Choose at least one cohort.'); return; }
    if (audience === 'GROUPS' && !allGroups && groupIds.length === 0) { setError('Choose at least one group, or ask all groups.'); return; }
    if (audience === 'PEOPLE' && participantIds.length === 0) { setError('Choose at least one participant.'); return; }

    setSending(true);
    setError('');
    try {
      await profileFieldsApi.create({
        label: label.trim(),
        helpText: helpText.trim() || null,
        fieldType,
        options: fieldType === 'CHOICE' ? options : [],
        required,
        cohortIds,
        groupIds: audience === 'GROUPS' && !allGroups ? groupIds : null,
        participantIds: audience === 'PEOPLE' ? participantIds : null,
      }, user.id);

      // Let the people it applies to right now know. Later joiners see it on their profile.
      const recipients = audience === 'PEOPLE'
        ? participantIds
        : people.filter((person) => person.status === 'ACTIVE' && (allGroups || (person.groupId && groupIds.includes(person.groupId)))).map((person) => person.id);
      void participantPushApi.notify(recipients, 'Please update your profile', `The FOF team would like to know: ${label.trim()}. Add it on your profile.`, '/me/profile');

      toast({ message: `Requested from ${recipients.length} participant${recipients.length === 1 ? '' : 's'}` });
      reset();
      setTab('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setSending(false);
    }
  };

  const stopAsking = async (field: ProfileField) => {
    setStopping(field.id);
    try {
      await profileFieldsApi.archive(field.id);
      await loadList();
      toast({ message: `Stopped asking for "${field.label}"` });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not update this field.', tone: 'error' });
    } finally {
      setStopping(null);
    }
  };

  const audienceSummary = (field: ProfileField) => {
    if (field.participantIds?.length) return `${field.participantIds.length} participant${field.participantIds.length === 1 ? '' : 's'}`;
    const names = field.cohortIds.map(cohortLabel).join(', ');
    return field.groupIds ? `${names} · ${field.groupIds.length} group${field.groupIds.length === 1 ? '' : 's'}` : `${names} · all groups`;
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Request information"
      subtitle="Ask participants to add details to their profile."
      wide
      footer={tab === 'new' ? (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={() => { void send(); }} disabled={sending} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      ) : undefined}
    >
      <div className="mb-4">
        <SegmentedTabs tabs={[{ key: 'new', label: 'New request' }, { key: 'list', label: 'Requested fields' }]} active={tab} onChange={(key) => setTab(key as 'new' | 'list')} />
      </div>

      {tab === 'new' ? (
        <div className="space-y-4">
          <div>
            <label className={LABEL}>What do you want to know?</label>
            <input value={label} onChange={(e) => { setLabel(e.target.value); setError(''); }} placeholder="e.g. Area you live in" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Help text (optional)</label>
            <input value={helpText} onChange={(e) => setHelpText(e.target.value)} placeholder="A short hint shown under the question" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Answer type</label>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((type) => (
                <button key={type.value} type="button" aria-pressed={fieldType === type.value} onClick={() => setFieldType(type.value)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${fieldType === type.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {type.label}
                </button>
              ))}
            </div>
          </div>
          {fieldType === 'CHOICE' && (
            <div>
              <label className={LABEL}>Choices, one per line</label>
              <textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} placeholder={'Single\nMarried'} className={`${INPUT} resize-y`} />
            </div>
          )}
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-orange-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Required</p>
              <p className="text-xs text-gray-500">Required fields count towards profile completion. Optional ones don&apos;t.</p>
            </div>
            <button type="button" role="switch" aria-checked={required} aria-label="Required" onClick={() => setRequired((value) => !value)} className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${required ? 'bg-primary' : 'bg-slate-200'}`}>
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${required ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Who should fill this in?</p>
            <div className="mt-2">
              <AppMultiSelect values={cohortIds} onChange={(values) => { setCohortIds(values); setGroupIds([]); setParticipantIds([]); }} options={cohorts.filter((cohort) => cohort.status !== 'ARCHIVED').map((cohort) => ({ value: cohort.id, label: cohort.name }))} placeholder="Choose cohorts" label="Cohorts" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([['GROUPS', 'Groups'], ['PEOPLE', 'Specific participants']] as Array<['GROUPS' | 'PEOPLE', string]>).map(([value, text]) => (
                <button key={value} type="button" aria-pressed={audience === value} onClick={() => setAudience(value)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${audience === value ? 'bg-[#3f4757] text-white' : 'bg-white text-gray-600'}`}>
                  {text}
                </button>
              ))}
            </div>
            {audience === 'GROUPS' ? (
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={allGroups} onChange={(e) => setAllGroups(e.target.checked)} className="accent-primary" />
                  All groups, including people who join later
                </label>
                {!allGroups && (
                  <AppMultiSelect values={groupIds} onChange={setGroupIds} options={groups.map((group) => ({ value: group.id, label: group.name, meta: cohortIds.length > 1 ? cohortLabel(group.cohortId) : undefined }))} placeholder="Choose groups" />
                )}
              </div>
            ) : (
              <div className="mt-3">
                <AppMultiSelect values={participantIds} onChange={setParticipantIds} options={people.filter((person) => person.status === 'ACTIVE').map((person) => ({ value: person.id, label: person.fullName, meta: person.groupName ?? undefined }))} placeholder="Choose participants" />
              </div>
            )}
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {fields.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No fields requested yet.</p>
          ) : fields.map((field) => {
            const counts = summary.get(field.id);
            return (
              <div key={field.id} className={`rounded-2xl border px-4 py-3 ${field.archivedAt ? 'border-gray-100 bg-gray-50' : 'border-orange-100'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{field.label}</p>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">{TYPE_LABEL[field.fieldType]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${field.required ? 'bg-sky-100/80 text-sky-700' : 'bg-neutral-100 text-neutral-600'}`}>{field.required ? 'Required' : 'Optional'}</span>
                  {field.archivedAt && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">Stopped</span>}
                  {!field.archivedAt && (
                    <button type="button" onClick={() => { void stopAsking(field); }} disabled={stopping === field.id} className="ml-auto text-xs font-semibold text-red-700 disabled:opacity-50">
                      {stopping === field.id ? 'Stopping…' : 'Stop asking'}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {audienceSummary(field)}
                  {counts && !field.archivedAt ? ` · ${counts.answered} of ${counts.applies} answered` : ''}
                </p>
              </div>
            );
          })}
          <p className="pt-1 text-xs text-gray-500">Stopping a field hides it from profiles. Answers already given are kept.</p>
        </div>
      )}
    </ModalShell>
  );
};

export default RequestInfoModal;
