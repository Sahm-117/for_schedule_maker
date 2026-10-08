import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppData } from '../../context/AppDataContext';
import { groupsApi, participantsApi, supportRecapsApi, teenMeetingsApi } from '../../services/api';
import type { Group, MeetingAttendanceStatus, Participant, SupportRecap, Week } from '../../types';
import { classDateIso, lagosTodayIso } from '../../utils/participantApp';
import { getIdealWeekForCohort } from '../../utils/weekFocus';
import { sortByText } from '../../utils/sort';
import Spinner from '../Spinner';

interface TeenMeetingCardProps {
  userId: string;
  userName: string;
}

const MARKS: Array<{ value: MeetingAttendanceStatus; label: string; active: string }> = [
  { value: 'JOINED', label: 'Joined', active: 'bg-emerald-600 text-white' },
  { value: 'EXCUSED', label: 'Excused', active: 'bg-amber-500 text-white' },
  { value: 'MISSED', label: 'Missed', active: 'bg-red-600 text-white' },
];

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// A Teen Support's weekly meeting with their teens (usually Saturday, but whenever the group can
// meet). They record that they met, the day, how each teen did, and their own notes. It reuses the
// group meeting records but stays out of the hub dashboards and red-flag counts.
const TeenMeetingCard: React.FC<TeenMeetingCardProps> = ({ userId, userName }) => {
  const { activeCohort, weeks } = useAppData();
  const [group, setGroup] = useState<Group | null>(null);
  const [teens, setTeens] = useState<Participant[]>([]);
  const [recaps, setRecaps] = useState<SupportRecap[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const cohortWeeks = useMemo(
    () => (weeks ?? []).filter((week) => week.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort?.id],
  );
  const today = lagosTodayIso(new Date());
  // Weeks whose class has been held; a meeting follows each class.
  const startedWeeks = useMemo<Week[]>(
    () => (activeCohort?.startDate ? cohortWeeks.filter((week) => classDateIso(activeCohort.startDate!, week) <= today) : []),
    [activeCohort?.startDate, cohortWeeks, today],
  );
  const [weekId, setWeekId] = useState<number | null>(null);
  useEffect(() => {
    if (startedWeeks.length === 0) { setWeekId(null); return; }
    setWeekId((current) => {
      if (current && startedWeeks.some((week) => week.id === current)) return current;
      const ideal = getIdealWeekForCohort(activeCohort, startedWeeks);
      return (ideal ?? startedWeeks[startedWeeks.length - 1]).id;
    });
  }, [startedWeeks, activeCohort]);
  const week = startedWeeks.find((w) => w.id === weekId) ?? null;

  useEffect(() => {
    if (!activeCohort) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    Promise.all([
      groupsApi.getTeenGroupForSupport(userId, activeCohort.id),
      participantsApi.getAll({ cohortId: activeCohort.id }),
      supportRecapsApi.getForCohort(activeCohort.id).catch(() => ({ recaps: [] as SupportRecap[] })),
    ])
      .then(([groupRes, peopleRes, recapRes]) => {
        if (cancelled) return;
        setGroup(groupRes.group);
        const mine = groupRes.group
          ? peopleRes.participants.filter((p) => p.status === 'ACTIVE' && p.groupId === groupRes.group!.id)
          : [];
        setTeens(sortByText(mine, (p) => p.fullName));
        setRecaps(recapRes.recaps);
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load your teens.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeCohort, userId]);

  // The selected week's saved meeting.
  const [saved, setSaved] = useState<{ done: boolean; metOn: string | null; notes: string | null } | null>(null);
  const [marks, setMarks] = useState<Map<string, MeetingAttendanceStatus>>(new Map());
  const [metOn, setMetOn] = useState('');
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const defaultDay = useMemo(() => {
    if (!activeCohort?.startDate || !week) return today;
    const saturday = addDays(classDateIso(activeCohort.startDate, week), 6);
    return saturday > today ? today : saturday;
  }, [activeCohort?.startDate, week, today]);

  const defaultDayRef = useRef(defaultDay);
  defaultDayRef.current = defaultDay;

  const loadWeek = useCallback(async () => {
    if (!group || !week) { setSaved(null); return; }
    try {
      const { status, records } = await teenMeetingsApi.getWeek(group.id, week.id);
      setSaved(status ? { done: status.done, metOn: status.metOn ?? null, notes: status.notes ?? null } : null);
      setMarks(new Map(records.map((r) => [r.participantId, r.status])));
      setMetOn(status?.metOn ?? defaultDayRef.current);
      setNotes(status?.notes ?? '');
      setEditing(false);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this meeting.');
    }
  }, [group, week]);
  useEffect(() => { void loadWeek(); }, [loadWeek]);

  const recap = recaps.find((r) => r.weekId === week?.id) ?? null;
  const recapLine = !recap ? 'No recap for this week yet.'
    : recap.teenRecap ? 'Your teen recap is ready.'
    : recap.hasTeenRecap && recap.teenRecapReleaseAt ? 'The teen recap arrives soon. You can use the adult recap.'
    : 'No teen recap yet. You can use the adult recap.';

  const allMarked = teens.length > 0 && teens.every((t) => marks.has(t.id));
  const counts = useMemo(() => {
    const values = teens.map((t) => marks.get(t.id)).filter(Boolean);
    return {
      joined: values.filter((v) => v === 'JOINED').length,
      excused: values.filter((v) => v === 'EXCUSED').length,
      missed: values.filter((v) => v === 'MISSED').length,
    };
  }, [teens, marks]);

  const save = async () => {
    if (!group || !week) return;
    if (!metOn) { setError('Pick the day you met.'); return; }
    if (activeCohort?.startDate && metOn < classDateIso(activeCohort.startDate, week)) {
      setError(`The meeting follows the class on ${dayLabel(classDateIso(activeCohort.startDate, week))}. Pick that day or later.`);
      return;
    }
    if (!allMarked) { setError('Mark each teen as joined, excused or missed.'); return; }
    setSaving(true);
    setError('');
    const wasDone = saved?.done === true;
    try {
      await teenMeetingsApi.save({
        groupId: group.id,
        weekId: week.id,
        userId,
        metOn,
        notes: notes.trim() || null,
        done: true,
        marks: teens.map((t) => ({ participantId: t.id, status: marks.get(t.id)! })),
      });
      setSaved({ done: true, metOn, notes: notes.trim() || null });
      setEditing(false);
      if (!wasDone) {
        // Tell the admins the first time; failing to reach them must not undo the saved meeting.
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
        fetch(`${supabaseUrl}/functions/v1/notify-group-meeting-completed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body: JSON.stringify({ groupName: `${userName}'s teens`, weekNumber: week.weekNumber, supportName: userName, teen: true }),
        }).catch(() => { /* the meeting is saved either way */ });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the meeting.');
    } finally {
      setSaving(false);
    }
  };

  const weekIndex = week ? startedWeeks.findIndex((w) => w.id === week.id) : -1;

  return (
    <section className="rounded-[20px] border border-[#ffdeca] bg-white p-[18px] shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]" data-testid="teen-meeting">
      <div className="flex items-center gap-2">
        <p className="text-base font-bold text-gray-900">Your teens' weekly meeting</p>
        {week && startedWeeks.length > 1 && (
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-600">
            <button type="button" aria-label="Earlier week" disabled={weekIndex <= 0} onClick={() => setWeekId(startedWeeks[weekIndex - 1].id)} className="grid h-8 w-8 place-items-center rounded-full border border-gray-200 disabled:opacity-40">‹</button>
            Week {week.weekNumber}
            <button type="button" aria-label="Later week" disabled={weekIndex >= startedWeeks.length - 1} onClick={() => setWeekId(startedWeeks[weekIndex + 1].id)} className="grid h-8 w-8 place-items-center rounded-full border border-gray-200 disabled:opacity-40">›</button>
          </span>
        )}
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading…</p>
      ) : loadError ? (
        <p className="mt-3 text-sm text-red-600">{loadError}</p>
      ) : !group || teens.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">When teens are assigned to you, you can record your meeting with them here.</p>
      ) : !week ? (
        <p className="mt-2 text-sm text-gray-500">Your first meeting comes after the first class.</p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-gray-500">Week {week.weekNumber}{week.title ? ` · ${week.title}` : ''}. {recapLine}</p>
          <NavLink to="/support/recap" className="mt-1 inline-block text-[13px] font-semibold text-primary">Open the teen recap and manual</NavLink>

          {saved?.done && !editing ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800">
                You met{saved.metOn ? ` on ${dayLabel(saved.metOn)}` : ''}
              </p>
              <p className="mt-0.5 text-[13px] text-emerald-800">{counts.joined} joined · {counts.excused} excused · {counts.missed} missed</p>
              {saved.notes && <p className="mt-2 whitespace-pre-line text-[13px] text-gray-700">{saved.notes}</p>}
              <button type="button" onClick={() => setEditing(true)} className="mt-2 text-[13px] font-semibold text-primary">Edit</button>
            </div>
          ) : !editing && !saved?.done ? (
            <button type="button" onClick={() => setEditing(true)} className="mt-3 min-h-[46px] w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white">We met</button>
          ) : (
            <div className="mt-3 flex flex-col gap-3.5">
              <div>
                <label htmlFor="teen-met-on" className="mb-1.5 block text-[13px] font-semibold text-gray-900">Day you met</label>
                <input id="teen-met-on" type="date" value={metOn} max={today} min={activeCohort?.startDate && week ? classDateIso(activeCohort.startDate, week) : undefined} onChange={(e) => setMetOn(e.target.value)} className="min-h-[46px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <ul className="flex flex-col gap-2.5">
                {teens.map((teen) => (
                  <li key={teen.id} className="rounded-2xl border border-gray-100 px-3.5 py-3">
                    <p className="text-sm font-semibold text-gray-900">{teen.fullName}</p>
                    <div className="mt-2 flex gap-2">
                      {MARKS.map((mark) => (
                        <button
                          key={mark.value}
                          type="button"
                          aria-pressed={marks.get(teen.id) === mark.value}
                          onClick={() => { setMarks((prev) => new Map(prev).set(teen.id, mark.value)); setError(''); }}
                          className={`min-h-[40px] flex-1 rounded-full text-[13px] font-semibold transition ${marks.get(teen.id) === mark.value ? mark.active : 'border border-gray-200 bg-white text-gray-600'}`}
                        >
                          {mark.label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <div>
                <label htmlFor="teen-notes" className="mb-1.5 block text-[13px] font-semibold text-gray-900">Your notes (staff can read these)</label>
                <textarea id="teen-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="How did it go? Anything to follow up?" className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <div className="flex flex-wrap gap-2.5">
                {(saved?.done || editing) && (
                  <button type="button" onClick={() => { void loadWeek(); }} className="min-h-[46px] flex-none rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700">Cancel</button>
                )}
                <button type="button" onClick={() => { void save(); }} disabled={saving} className="min-h-[46px] min-w-0 flex-auto rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : saved?.done ? 'Save changes' : 'We met'}
                </button>
              </div>
            </div>
          )}
          {error && !editing && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </section>
  );
};

export default TeenMeetingCard;
