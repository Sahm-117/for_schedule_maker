import React, { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { useParticipantPush } from '../hooks/useParticipantPush';
import { participantAppApi } from '../services/api';
import { currentWeekNumber, formatTime, titleCaseDay } from '../utils/participantApp';

// Participant profile: photo, their details, what they want a nudge about, and
// changing their password. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const FIELD = 'min-h-[46px] w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

const MEETING_TIMINGS = [
  { label: '1 day before', value: 1440 },
  { label: '1 hour before', value: 60 },
  { label: '30 mins before', value: 30 },
];

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

const ParticipantProfilePage: React.FC = () => {
  const { user } = useAuth();
  const { home, loading, reload } = useParticipantApp();
  const toast = useToast();
  const push = useParticipantPush();
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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
  const rows: Array<[string, string]> = [
    ['Group', group?.name || 'Not in a group yet'],
    ['Your support', group?.supportName || '—'],
    ['Group call', group?.meetingDay && group.meetingTime ? `${titleCaseDay(group.meetingDay)}, ${formatTime(group.meetingTime)}` : 'Not set yet'],
    ['Week', weekNumber >= 1 ? `${Math.min(weekNumber, home.weeks.length)} of ${home.weeks.length}` : 'Not started'],
    ['Username', home.participant.phone || '—'],
    ['Email', home.profile.email || '—'],
  ];

  const pushNote: Record<string, string> = {
    unsupported: 'This browser can’t show notifications. On iPhone, add the app to your Home Screen first.',
    blocked: 'Notifications are blocked. Allow them for this site in your browser settings.',
    failed: 'Could not turn on notifications. Try again.',
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile" subtitle="Your details, photo and reminders." />
      <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />

      <div className="flex flex-col gap-4">
        <section className={CARD}>
          <div className="flex items-center gap-3.5">
            <Avatar name={home.participant.name} avatarUrl={home.profile.avatarUrl} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900">{home.participant.name}</h2>
              <p className="mt-0.5 text-[13px] text-gray-500">Participant{group ? ` · ${group.name}` : ''}{home.cohort ? ` · ${home.cohort.name}` : ''}</p>
            </div>
          </div>
          <button type="button" onClick={() => photoInput.current?.click()} disabled={uploading} className="mt-4 min-h-[44px] rounded-xl border border-[#ffdeca] bg-[#fff8f3] px-4 text-sm font-semibold text-[#c2410c] disabled:opacity-60">
            {uploading ? 'Uploading…' : home.profile.avatarUrl ? 'Change photo' : 'Add a photo'}
          </button>
          <p className="mt-2 text-xs text-gray-500">Your photo is visible to your support and the programme team.</p>
        </section>

        <section className={CARD}>
          <h3 className="text-base font-bold text-gray-900">Your details</h3>
          <dl className="mt-3 divide-y divide-gray-100">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-right font-semibold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={CARD}>
          <h3 className="text-base font-bold text-gray-900">Reminders</h3>
          <p className="mt-0.5 text-[13px] text-gray-500">Choose what you want a nudge about.</p>

          {push.status !== 'enabled' && (
            <div className="mt-3.5 rounded-[14px] bg-[#fff8f3] p-3.5">
              <p className="text-[13.5px] font-semibold text-gray-900">Turn on notifications</p>
              <p className="mt-0.5 text-[12.5px] text-gray-600">{pushNote[push.status] || 'Reminders arrive as notifications on this device.'}</p>
              {(push.status === 'ready' || push.status === 'failed' || push.status === 'saving') && (
                <button type="button" onClick={() => { void push.enable(); }} disabled={push.status === 'saving'} className="mt-2.5 min-h-[40px] rounded-xl bg-primary px-4 text-[13px] font-semibold text-white disabled:opacity-60">
                  {push.status === 'saving' ? 'Turning on…' : 'Turn on'}
                </button>
              )}
            </div>
          )}

          <div className="mt-3 divide-y divide-gray-100">
            <div className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Sunday class</p>
                <p className="text-xs text-gray-500">Saturday midday, Saturday evening and Sunday morning. Always on.</p>
              </div>
              <Switch on label="Sunday class reminders are always on" disabled />
            </div>
            <div className="py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">Group call</p>
                  <p className="text-xs text-gray-500">Before your weekly group meeting.</p>
                </div>
                <Switch on={meetingMinutes.length > 0} label="Group call reminders" disabled={savingReminders} onToggle={() => { void saveReminders(meetingMinutes.length > 0 ? [] : [60], recapReleased); }} />
              </div>
              {meetingMinutes.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {MEETING_TIMINGS.map((timing) => {
                    const selected = meetingMinutes.includes(timing.value);
                    return (
                      <button
                        key={timing.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={savingReminders || (selected && meetingMinutes.length === 1)}
                        onClick={() => { void saveReminders(selected ? meetingMinutes.filter((m) => m !== timing.value) : [...meetingMinutes, timing.value].sort((a, b) => b - a), recapReleased); }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${selected ? 'bg-primary text-white' : 'bg-[#f6f7f9] text-gray-600'} disabled:cursor-default`}
                      >
                        {timing.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">Weekly recap and reflection</p>
                <p className="text-xs text-gray-500">When your week&apos;s recap is out.</p>
              </div>
              <Switch on={recapReleased} label="Weekly recap reminders" disabled={savingReminders} onToggle={() => { void saveReminders(meetingMinutes, !recapReleased); }} />
            </div>
          </div>
        </section>

        <section className={CARD}>
          <h3 className="text-base font-bold text-gray-900">Change password</h3>
          <div className="mt-3 flex flex-col gap-2.5">
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" className={FIELD} />
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setPasswordError(''); }} placeholder="New password (at least 8 characters)" className={FIELD} />
            {passwordError && <p className="text-xs font-medium text-red-700">{passwordError}</p>}
            <button type="button" onClick={() => { void changePassword(); }} disabled={changing || !current || !next} className="min-h-[44px] rounded-xl bg-[#3f4757] px-4 text-sm font-semibold text-white disabled:opacity-50">
              {changing ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </section>

        <div className="flex items-start gap-2 rounded-xl bg-[#f6f7f9] px-3.5 py-3 text-[12.5px] leading-normal text-gray-500">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mt-0.5 flex-none" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" /></svg>
          <span>Your weekly reflections are private to you. Your attendance and faith project are visible to your support and the programme team.</span>
        </div>
      </div>
    </div>
  );
};

export default ParticipantProfilePage;
