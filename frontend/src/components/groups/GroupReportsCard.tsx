import React, { useEffect, useMemo, useState } from 'react';
import { groupsApi } from '../../services/api';
import type { Group, GroupPrayerFocus, GroupPrayerStatus, MeetingAttendance, MeetingAttendanceStatus, Participant, ParticipantNote, Week } from '../../types';
import ModalShell from '../followups/ModalShell';
import Spinner from '../Spinner';
import { formatDateTime } from '../../utils/time';
import { formatMeetingSlot } from '../GroupMeetingSlotEditor';
import { sortByText } from '../../utils/sort';

// ── Group meeting reports for the admin Group meetings page ──────────────────
// Each group's weekly meeting as its Support ran it: who joined, the prayer focus and what the Support
// wrote. The report is kept as a MEETING note on the week's prayer-focus participant, so it only has
// text when a focus participant was picked. The current week shows as it happens; earlier weeks are one
// tap away. The whole card folds away like the other admin accordions.

const MARK_LABEL: Record<MeetingAttendanceStatus, string> = { JOINED: 'Joined', EXCUSED: 'Excused', MISSED: 'Missed' };
const MARK_TONE: Record<MeetingAttendanceStatus, string> = { JOINED: 'text-emerald-700', EXCUSED: 'text-amber-700', MISSED: 'text-rose-700' };

interface GroupReportsCardProps {
  groups: Group[];
  /** Weeks that have started, oldest first; the last one opens by default. */
  weeks: Week[];
  statuses: GroupPrayerStatus[];
  focuses: GroupPrayerFocus[];
  attendance: MeetingAttendance[];
  notes: ParticipantNote[];
  /** The notes could not be loaded, so an empty list does not mean nothing was written. */
  notesFailed?: boolean;
}

const GroupReportsCard: React.FC<GroupReportsCardProps> = ({ groups, weeks, statuses, focuses, attendance, notes, notesFailed }) => {
  const latestWeekId = weeks.at(-1)?.id ?? null;
  const [expanded, setExpanded] = useState(true);
  const [weekId, setWeekId] = useState<number | null>(latestWeekId);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  // A new week starting (or the weeks loading late) moves the view to it.
  useEffect(() => { setWeekId(latestWeekId); }, [latestWeekId]);

  const rows = useMemo(() => groups.map((group) => {
    const status = weekId === null ? undefined : statuses.find((s) => s.groupId === group.id && s.weekId === weekId);
    const marks = attendance.filter((a) => a.groupId === group.id && a.weekId === weekId);
    const joined = marks.filter((a) => a.status === 'JOINED').length;
    const focus = focuses.find((f) => f.groupId === group.id && f.weekId === weekId) ?? null;
    const written = notes.filter((n) => n.groupId === group.id && n.weekId === weekId);
    return { group, done: status?.done === true, marks, joined, focus, written };
  }), [groups, statuses, attendance, focuses, notes, weekId]);

  if (weeks.length === 0 || groups.length === 0) return null;
  const week = weeks.find((w) => w.id === weekId) ?? null;
  const doneCount = rows.filter((r) => r.done).length;
  const open = rows.find((r) => r.group.id === openGroupId) ?? null;

  return (
    <section data-testid="group-reports" className="rounded-[28px] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(17,24,39,0.04),0_12px_32px_-16px_rgba(17,24,39,0.18)]">
      <h2 className="text-[17px] font-bold text-gray-900">
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
          <span>Group meeting reports</span>
          {week && <span className="text-[13px] font-normal text-gray-500">Week {week.weekNumber} · {doneCount} of {rows.length} done</span>}
          <svg className={`ml-auto h-4 w-4 flex-shrink-0 self-center text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </button>
      </h2>
      {expanded && notesFailed && <p className="mt-2 text-sm text-rose-700">Could not load the written notes. Refresh to try again.</p>}

      {expanded && (
        <>
          {weeks.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose a week">
              {[...weeks].reverse().map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWeekId(w.id)}
                  aria-pressed={w.id === weekId}
                  className={`min-h-[32px] rounded-full px-3 text-[13px] font-semibold ${w.id === weekId ? 'bg-gray-900 text-white' : 'bg-[#f5f5f7] text-gray-700'}`}
                >
                  Week {w.weekNumber}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-3 flex flex-col">
            {rows.map(({ group, done, joined, focus, written }) => {
              const hasReport = done || written.length > 0;
              return (
                <li key={group.id} className="border-t border-[#f0f0f2] py-3 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-gray-900">{group.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${done ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                      {done ? 'Done' : 'Not done'}
                    </span>
                    {hasReport && (
                      <button type="button" onClick={() => setOpenGroupId(group.id)} className="ml-auto min-h-[32px] text-[13px] font-semibold text-[#c2410c]">
                        Read report ›
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-gray-500">
                    {group.supportName ? `${group.supportName} · ` : ''}{formatMeetingSlot(group) ?? 'No meeting set'}
                  </p>
                  <p className="mt-1 text-[13px] text-gray-700">
                    {joined}/{group.participantCount ?? 0} joined
                    {focus?.participantName ? <span className="text-gray-500"> · Prayer focus: {focus.participantName}</span> : null}
                  </p>
                  {written[0] && <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] text-gray-500">{written[0].body}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {open && (
        <ReportModal
          group={open.group}
          weekNumber={week?.weekNumber}
          done={open.done}
          focusName={open.focus?.participantName ?? null}
          marks={open.marks}
          notes={open.written}
          notesFailed={notesFailed}
          onClose={() => setOpenGroupId(null)}
        />
      )}
    </section>
  );
};

const ReportModal: React.FC<{
  group: Group;
  weekNumber?: number;
  done: boolean;
  focusName: string | null;
  marks: MeetingAttendance[];
  notes: ParticipantNote[];
  notesFailed?: boolean;
  onClose: () => void;
}> = ({ group, weekNumber, done, focusName, marks, notes, notesFailed, onClose }) => {
  const [people, setPeople] = useState<Participant[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    groupsApi.getParticipants(group.id)
      .then(({ participants }) => { if (!cancelled) setPeople(sortByText(participants, (p) => p.fullName)); })
      .catch(() => { if (!cancelled) setPeople([]); });
    return () => { cancelled = true; };
  }, [group.id]);

  const markFor = (id: string) => marks.find((m) => m.participantId === id)?.status ?? null;

  return (
    <ModalShell isOpen onClose={onClose} title={`${group.name} · Week ${weekNumber ?? ''}`} subtitle={done ? 'Done' : 'Not done'} wide>
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
          {notes.length === 0 && notesFailed ? (
            <p className="mt-1.5 text-sm text-rose-700">The notes could not be loaded.</p>
          ) : notes.length === 0 ? (
            <p className="mt-1.5 text-sm text-gray-500">
              {focusName ? 'No notes written.' : 'No notes kept. Notes are saved against the week\'s prayer focus participant, and none was picked.'}
            </p>
          ) : notes.map((note) => (
            <div key={note.id} className="mt-1.5">
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-gray-900">{note.body}</p>
              <p className="mt-1 text-[12.5px] text-gray-500">{note.authorName ? `${note.authorName} · ` : ''}{formatDateTime(note.createdAt)}</p>
            </div>
          ))}
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attendance</h3>
          {people === null ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-400"><Spinner className="h-3.5 w-3.5" />Loading…</p>
          ) : people.length === 0 ? (
            <p className="mt-1.5 text-sm text-gray-500">No participants in this group.</p>
          ) : (
            <ul className="mt-1.5 flex flex-col">
              {people.map((p) => {
                const status = markFor(p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-t border-[#f0f0f2] py-2 text-[14px] first:border-t-0">
                    <span className="min-w-0 truncate text-gray-900">{p.fullName}</span>
                    <span className={`flex-none font-semibold ${status ? MARK_TONE[status] : 'text-gray-400'}`}>{status ? MARK_LABEL[status] : 'Not marked'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {focusName && <p className="text-[13px] text-gray-500">Prayer focus: {focusName}</p>}
      </div>
    </ModalShell>
  );
};

export default GroupReportsCard;
