import React, { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import AppSelect from '../components/AppSelect';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { useParticipantPush } from '../hooks/useParticipantPush';
import { participantAppApi } from '../services/api';
import { currentWeekNumber, formatTime, titleCaseDay } from '../utils/participantApp';
import { AGE_RANGE_OPTIONS, GENDER_OPTIONS, toSelectOptions } from '../constants/departments';
import { useSearchParams } from 'react-router-dom';
import type { ProfileFieldEntry } from '../types';

// Participant profile: how complete it is, their photo and details (including any
// fields the FOF team requested), their programme, reminders and password.
// Everything is edited in one go from "Edit profile info"; reminders and password
// stay folded away to keep the page short.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const FIELD = 'min-h-[44px] w-full rounded-xl border border-gray-200 px-3.5 py-2 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const MEETING_TIMINGS = [
  { label: '1 day before', short: '1 day', value: 1440 },
  { label: '1 hour before', short: '1 hour', value: 60 },
  { label: '30 mins before', short: '30 mins', value: 30 },
];

const formatBirthday = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';

const Switch: React.FC<{ on: boolean; onToggle?: () => void; label: string; disabled?: boolean }> = ({ on, onToggle, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    disabled={disabled}
    className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition disabled:opacity-60 ${on ? 'bg-primary' : 'bg-gray-200'}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

// A card whose body folds away, with a one-line summary while closed.
const Fold: React.FC<{ title: string; summary: string; children: React.ReactNode }> = ({ title, summary, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <section className={CARD}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          {!open && <p className="mt-0.5 truncate text-[13px] text-gray-500">{summary}</p>}
        </div>
        <span className={`flex-none text-xs text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">&#9662;</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
};

const ParticipantProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { home, loading, reload } = useParticipantApp();
  const toast = useToast();
  const push = useParticipantPush();
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ email: '', gender: '', ageRange: '', occupation: '', dateOfBirth: '' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [searchParams] = useSearchParams();
  const welcome = searchParams.get('welcome') === '1';
  const [detailsError, setDetailsError] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [meetingMinutes, setMeetingMinutes] = useState<number[]>([60]);
  const [recapReleased, setRecapReleased] = useState(true);
  const [savingReminders, setSavingReminders] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!home) return;
    setMeetingMinutes(home.reminders.meetingRemindMinutes);
    setRecapReleased(home.reminders.recapReleased);
  }, [home?.reminders.meetingRemindMinutes.join(','), home?.reminders.recapReleased]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !home || !user) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const startEditing = () => {
    setDetails({
      email: home.profile.email ?? '',
      gender: home.profile.gender ?? '',
      ageRange: home.profile.ageRange ?? '',
      occupation: home.profile.occupation ?? '',
      dateOfBirth: home.profile.dateOfBirth ?? '',
    });
    setAnswers(Object.fromEntries(home.profileFields.map((field) => [field.id, field.value ?? ''])));
    setDetailsError('');
    setEditing(true);
  };

  const saveDetails = async () => {
    if (details.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(details.email.trim())) { setDetailsError('Enter a valid email address.'); return; }
    setSavingDetails(true);
    setDetailsError('');
    try {
      await participantAppApi.saveProfile({ ...details, answers });
      await reload();
      setEditing(false);
      toast({ message: 'Details saved' });
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const saveReminders = async (minutes: number[], recap: boolean) => {
    const previous = { minutes: meetingMinutes, recap: recapReleased };
    setMeetingMinutes(minutes);
    setRecapReleased(recap);
    setSavingReminders(true);
    try {
      await participantAppApi.saveReminders(minutes, recap);
    } catch (err) {
      setMeetingMinutes(previous.minutes);
      setRecapReleased(previous.recap);
      toast({ message: err instanceof Error ? err.message : 'Could not save your reminders.', tone: 'error' });
    } finally {
      setSavingReminders(false);
    }
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await participantAppApi.uploadAvatar(home.participant.id, file);
      await reload();
      toast({ message: 'Photo updated' });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not upload your photo.', tone: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const changePassword = async () => {
    if (next.length < 8) { setPasswordError('Use at least 8 characters.'); return; }
    setChanging(true);
    setPasswordError('');
    try {
      await participantAppApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast({ message: 'Password changed' });
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setChanging(false);
    }
  };

  const group = home.group;
  const weekNumber = currentWeekNumber(home.cohort?.startDate, new Date());
  const programmeRows: Array<[string, string]> = [
    ['Group', group?.name || 'Not in a group yet'],
    ['Your support', group?.supportName || ''],
    ['Group call', group?.meetingDay && group.meetingTime ? `${titleCaseDay(group.meetingDay)}, ${formatTime(group.meetingTime)}` : ''],
    ['Week', weekNumber >= 1 ? `${Math.min(weekNumber, home.weeks.length)} of ${home.weeks.length}` : 'Not started'],
    ['Username', home.participant.phone || ''],
  ];
  // Blank values stay blank: that is what is left to complete.
  const detailRows: Array<[string, string]> = [
    ['Email', home.profile.email || ''],
    ['Gender', home.profile.gender || ''],
    ['Age range', home.profile.ageRange || ''],
    ['Date of birth', formatBirthday(home.profile.dateOfBirth)],
    ['Occupation', home.profile.occupation || ''],
  ];
  const completion = home.profileCompletion;

  const answerText = (field: ProfileFieldEntry) => {
    if (!field.value) return '';
    return field.fieldType === 'DATE' ? formatBirthday(field.value) : field.value;
  };

  const renderFieldInput = (field: ProfileFieldEntry) => {
    const value = answers[field.id] ?? '';
    const set = (next: string) => setAnswers((prev) => ({ ...prev, [field.id]: next }));
    if (field.fieldType === 'LONG_TEXT') return <textarea value={value} onChange={(e) => set(e.target.value)} rows={3} className={`${FIELD} resize-y`} />;
    if (field.fieldType === 'DATE') return <input type="date" value={value} onChange={(e) => set(e.target.value)} className={FIELD} />;
    if (field.fieldType === 'CHOICE') return <AppSelect value={value} onChange={set} options={[{ value: '', label: 'Choose…' }, ...toSelectOptions(field.options)]} placeholder="Choose…" />;
    if (field.fieldType === 'YES_NO') {
      return (
        <div className="flex gap-2" role="radiogroup" aria-label={field.label}>
          {['Yes', 'No'].map((option) => (
            <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => set(value === option ? '' : option)} className={`min-h-[40px] flex-1 rounded-xl border text-sm font-semibold ${value === option ? 'border-[#ffdeca] bg-[#fff8f3] text-[#c2410c]' : 'border-gray-200 bg-white text-gray-700'}`}>
              {option}
            </button>
          ))}
        </div>
      );
    }
    return <input value={value} onChange={(e) => set(e.target.value)} className={FIELD} />;
  };

  const reminderSummary = [
    'Sunday class',
    meetingMinutes.length > 0
      ? `Group call ${MEETING_TIMINGS.filter((t) => meetingMinutes.includes(t.value)).map((t) => t.short).join(', ')}`
      : 'Group call off',
    `Recap ${recapReleased ? 'on' : 'off'}`,
  ].join(' · ');

  const pushNote: Record<string, string> = {
    unsupported: 'Notifications don’t work in this browser. On iPhone, add the app to your Home Screen first.',
    blocked: 'Notifications are blocked. Allow them for this site in your browser settings.',
    failed: 'Could not turn on notifications.',
    ready: 'Turn on notifications to get these reminders.',
    saving: 'Turning on notifications…',
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" subtitle="Your details, photo and reminders." />
      <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="flex flex-col gap-3.5">
        {welcome && completion.percent < 100 && (
          <p className="rounded-[14px] bg-[#fff8f3] px-4 py-3 text-[13.5px] leading-relaxed text-gray-700">
            Welcome to FOF! Take a minute to complete your profile so your support can get to know you.
          </p>
        )}

        <section className={CARD}>
          <div className="flex items-start gap-3.5">
            <Avatar name={home.participant.name} avatarUrl={home.profile.avatarUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-gray-900">{home.participant.name}</h2>
              <button type="button" onClick={() => photoInput.current?.click()} disabled={uploading} className="text-[13px] font-semibold text-[#c2410c] disabled:opacity-60">
                {uploading ? 'Uploading…' : home.profile.avatarUrl ? 'Change photo' : 'Add a photo'}
              </button>
            </div>
            {!editing && (
              <button type="button" onClick={startEditing} className="inline-flex flex-none items-center gap-1.5 rounded-full border border-[#ffdeca] bg-[#fff8f3] px-3 py-1.5 text-xs font-semibold text-[#c2410c]">
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="m16.86 4.49 1.69-1.69a1.88 1.88 0 1 1 2.65 2.65L6.83 19.82a4.5 4.5 0 0 1-1.9 1.13l-2.68.8.8-2.69a4.5 4.5 0 0 1 1.13-1.89L16.86 4.49Z" /></svg>
                Edit profile info
              </button>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-gray-900">Profile {completion.percent}% complete</span>
              {completion.missing > 0 && <span className="text-gray-500">{completion.missing} to add</span>}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#f1f2f5]">
              <span className={`block h-full rounded-full ${completion.percent === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${completion.percent}%` }} />
            </div>
          </div>

          {editing ? (
            <div className="mt-4 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-gray-900">Email</span>
                <input type="email" value={details.email} onChange={(e) => setDetails((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@example.com" className={FIELD} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="mb-1 block text-[13px] font-semibold text-gray-900">Gender</span>
                  <AppSelect value={details.gender} onChange={(value) => setDetails((prev) => ({ ...prev, gender: value }))} options={[{ value: '', label: 'Choose…' }, ...toSelectOptions(GENDER_OPTIONS)]} placeholder="Choose…" />
                </div>
                <div>
                  <span className="mb-1 block text-[13px] font-semibold text-gray-900">Age range</span>
                  <AppSelect value={details.ageRange} onChange={(value) => setDetails((prev) => ({ ...prev, ageRange: value }))} options={[{ value: '', label: 'Choose…' }, ...toSelectOptions(AGE_RANGE_OPTIONS)]} placeholder="Choose…" />
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-gray-900">Date of birth</span>
                <input type="date" value={details.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDetails((prev) => ({ ...prev, dateOfBirth: e.target.value }))} className={FIELD} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[13px] font-semibold text-gray-900">Occupation</span>
                <input value={details.occupation} onChange={(e) => setDetails((prev) => ({ ...prev, occupation: e.target.value }))} placeholder="What you do for a living" className={FIELD} />
              </label>
              {home.profileFields.length > 0 && (
                <>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.05em] text-[#9a6a4b]">More about you</p>
                  {home.profileFields.map((field) => (
                    <div key={field.id}>
                      <span className="mb-1 block text-[13px] font-semibold text-gray-900">
                        {field.label}{!field.required && <span className="font-normal text-gray-400"> (optional)</span>}
                      </span>
                      {field.helpText && <span className="mb-1 block text-xs text-gray-500">{field.helpText}</span>}
                      {renderFieldInput(field)}
                    </div>
                  ))}
                </>
              )}
              {detailsError && <p className="text-xs font-medium text-red-700">{detailsError}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" onClick={() => setEditing(false)} disabled={savingDetails} className="min-h-[44px] rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700">Cancel</button>
                <button type="button" onClick={() => { void saveDetails(); }} disabled={savingDetails} className="min-h-[44px] rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60">
                  {savingDetails ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="text-xs text-gray-500">Your phone number is your username. Ask your support if it needs to change.</p>
            </div>
          ) : (
            <>
              <dl className="mt-3 divide-y divide-gray-100">
                {detailRows.map(([label, value]) => (
                  <div key={label} className="flex min-h-[36px] items-center justify-between gap-4 py-2 text-sm">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-right font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
              {home.profileFields.length > 0 && (
                <>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.05em] text-[#9a6a4b]">More about you</p>
                  <dl className="mt-1 divide-y divide-gray-100">
                    {home.profileFields.map((field) => (
                      <div key={field.id} className="flex min-h-[36px] items-center justify-between gap-4 py-2 text-sm">
                        <dt className="text-gray-500">{field.label}{!field.required && <span className="text-gray-400"> (optional)</span>}</dt>
                        <dd className="text-right font-semibold text-gray-900">{answerText(field)}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </>
          )}
        </section>

        <section className={CARD}>
          <h3 className="text-base font-bold text-gray-900">Your programme</h3>
          <dl className="mt-2 divide-y divide-gray-100">
            {programmeRows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-right font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Fold title="Reminders" summary={reminderSummary}>
          {push.status !== 'enabled' && (
            <div className="mb-2 flex items-center gap-3 rounded-xl bg-[#fff8f3] px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-gray-600">{pushNote[push.status]}</p>
              {(push.status === 'ready' || push.status === 'failed') && (
                <button type="button" onClick={() => { void push.enable(); }} className="flex-none rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Turn on</button>
              )}
            </div>
          )}
          <div className="divide-y divide-gray-100">
            <div className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Sunday class</p>
                <p className="text-xs text-gray-500">Saturday and Sunday morning. Always on.</p>
              </div>
              <Switch on label="Sunday class reminders are always on" disabled />
            </div>
            <div className="py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Group call</p>
                  <p className="text-xs text-gray-500">Before your weekly meeting.</p>
                </div>
                <Switch on={meetingMinutes.length > 0} label="Group call reminders" disabled={savingReminders} onToggle={() => { void saveReminders(meetingMinutes.length > 0 ? [] : [60], recapReleased); }} />
              </div>
              {meetingMinutes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {MEETING_TIMINGS.map((timing) => {
                    const selected = meetingMinutes.includes(timing.value);
                    return (
                      <button
                        key={timing.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={savingReminders || (selected && meetingMinutes.length === 1)}
                        onClick={() => { void saveReminders(selected ? meetingMinutes.filter((m) => m !== timing.value) : [...meetingMinutes, timing.value].sort((a, b) => b - a), recapReleased); }}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${selected ? 'bg-[#fff1e6] text-[#c2410c]' : 'bg-[#f6f7f9] text-gray-500'} disabled:cursor-default`}
                      >
                        {timing.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Weekly recap</p>
                <p className="text-xs text-gray-500">When your week&apos;s recap is out.</p>
              </div>
              <Switch on={recapReleased} label="Weekly recap reminders" disabled={savingReminders} onToggle={() => { void saveReminders(meetingMinutes, !recapReleased); }} />
            </div>
          </div>
        </Fold>

        <Fold title="Password" summary="Change your password">
          <div className="flex flex-col gap-2.5">
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={FIELD} />
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setPasswordError(''); }} placeholder="New password (at least 8 characters)" className={FIELD} />
            {passwordError && <p className="text-xs font-medium text-red-700">{passwordError}</p>}
            <button type="button" onClick={() => { void changePassword(); }} disabled={changing || !current || !next} className="min-h-[44px] rounded-xl bg-[#3f4757] px-4 text-sm font-semibold text-white disabled:opacity-50">
              {changing ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </Fold>

        <p className="flex items-start gap-2 px-1 text-[12px] leading-normal text-gray-500">
          <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" /></svg>
          <span>Your weekly reflections are private to you. Your attendance and faith project are visible to your support and the programme team.</span>
        </p>
      </div>
    </div>
  );
};

export default ParticipantProfilePage;
