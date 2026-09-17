import React from 'react';
import PageHeader from '../components/PageHeader';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { buildWhatsAppLink } from '../utils/phone';
import { currentWeekNumber, formatTime, platformLabel, titleCaseDay } from '../utils/participantApp';

// My Group: the weekly group meeting, who is in the group, and a way to reach
// their support. Other members' phone numbers are not shared. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';
const DAY_INDEX: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 };
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

// A weekly repeating calendar event for the group meeting, until the cohort ends.
const calendarFile = (title: string, day: string, time: string, minutes: number, until: string | null, link: string | null) => {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const offset = ((DAY_INDEX[day] ?? 0) - now.getUTCDay() + 7) % 7;
  const [h, m] = time.split(':').map(Number);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset, h - 1, m));
  const end = new Date(start.getTime() + minutes * 60000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FOF IKD//Participant app//EN', 'BEGIN:VEVENT',
    `UID:fof-group-${start.getTime()}@fof-ikd`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `RRULE:FREQ=WEEKLY${until ? `;UNTIL=${until.replace(/-/g, '')}T235959Z` : ''}`,
    `SUMMARY:${title}`, link ? `DESCRIPTION:Join: ${link}` : '', link ? `URL:${link}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
};

const ParticipantGroupPage: React.FC = () => {
  const { home, loading } = useParticipantApp();
  if (loading || !home) return <p className="py-16 text-center text-sm text-gray-500">Loading…</p>;

  const group = home.group;
  const scheduled = !!(group?.meetingDay && group.meetingTime);
  const weekNumber = currentWeekNumber(home.cohort?.startDate, new Date());
  const supportName = group?.supportName || 'your support';
  const supportLink = buildWhatsAppLink(group?.supportPhone, `Hi ${supportName.split(' ')[0]}, it's ${home.participant.name.split(' ')[0]} from FOF.`);

  const addToCalendar = () => {
    if (!group?.meetingDay || !group.meetingTime) return;
    const url = calendarFile(`FOF ${group.name} meeting`, group.meetingDay, group.meetingTime, group.meetingDurationMins || 45, home.cohort?.endDate ?? null, group.callLink);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fof-group-meeting.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="My group" subtitle="Your meeting and group contacts." tourId="participant:group" />
      {!group ? (
        <section className={`${CARD} text-center`}>
          <p className="text-[15px] font-bold text-gray-900">You are not in a group yet</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[13.5px] text-gray-500">The FOF team will add you to a group and introduce your support soon.</p>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">{group.name}</p>

          <section data-wt="pg-meeting" className={CARD}>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-gray-400">Next meeting</p>
              <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold ${scheduled ? 'bg-[#f2fbf5] text-[#15803d]' : 'bg-[#f6f7f9] text-gray-500'}`}>
                {scheduled ? 'Scheduled' : 'Not scheduled'}
              </span>
            </div>
            <p className="mt-2 text-[22px] font-extrabold text-gray-900">
              {scheduled ? `${titleCaseDay(group.meetingDay)} · ${formatTime(group.meetingTime)}` : 'Waiting on your support to schedule this'}
            </p>
            <p className="mt-0.5 text-[13px] text-gray-500">Weekly prayer and check-in · {group.meetingDurationMins || 45} minutes · {platformLabel(group.callPlatform)}</p>

            {/* The meeting's order, as a simple step line (not buttons). */}
            <ol className="mt-5 grid grid-cols-3" aria-label="How the meeting runs">
              {[
                ['Prayer', '20–30 minutes'],
                ['Recap', weekNumber >= 1 ? `Week ${Math.min(weekNumber, home.weeks.length)}` : 'This week'],
                ['Questions', 'Apply the lesson'],
              ].map(([title, sub], index, steps) => (
                <li key={title} className="relative flex flex-col items-center px-1 text-center">
                  {index < steps.length - 1 && (
                    <span className="absolute left-1/2 top-[13px] h-0.5 w-full bg-[#ffdeca]" aria-hidden="true" />
                  )}
                  <span className="relative grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-white">{index + 1}</span>
                  <span className="mt-2 text-[13px] font-bold text-gray-900">{title}</span>
                  <span className="mt-0.5 text-xs text-gray-500">{sub}</span>
                </li>
              ))}
            </ol>

            {scheduled && (
              <div className="mt-[18px] grid gap-2.5 sm:grid-cols-2">
                {group.callLink ? (
                  <a href={group.callLink} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#3f4757] px-[18px] text-sm font-semibold text-white">Join meeting</a>
                ) : (
                  <span className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#f6f7f9] px-[18px] text-sm font-semibold text-gray-400">Link not shared yet</span>
                )}
                <button type="button" onClick={addToCalendar} className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-[18px] text-sm font-semibold text-gray-700">Add to calendar</button>
              </div>
            )}
          </section>

          <section data-wt="pg-members" className={CARD}>
            <h2 className="text-base font-bold text-gray-900">Group members</h2>
            <div className="mt-3.5 flex flex-col gap-2.5">
              {group.supportName && (
                <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#ffdeca] bg-[#fffaf5] px-3.5 py-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#fff1e6] text-sm font-bold text-[#c2410c]">{initialsOf(group.supportName)}</div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-gray-900">{group.supportName}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Your support</p>
                  </div>
                  {supportLink && (
                    <a href={supportLink} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-[40px] items-center rounded-[10px] bg-[#25d366] px-3.5 text-xs font-semibold text-white">Contact</a>
                  )}
                </div>
              )}
              {home.members.map((member) => (
                <div key={member.name} className="flex items-center gap-3 rounded-[14px] border border-[#f1f2f5] px-3.5 py-3">
                  <div className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[#f6f7f9] text-sm font-bold text-gray-600">{initialsOf(member.name)}</div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-gray-900">{member.name}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{group.name}</p>
                  </div>
                </div>
              ))}
              {home.members.length === 0 && <p className="text-[13px] text-gray-500">You are the first in your group so far.</p>}
            </div>
          </section>

          <aside data-wt="pg-help" className="rounded-[22px] border border-[#ffeadb] bg-[#fffaf5] p-5 shadow-[0_2px_6px_-2px_rgba(17,24,39,0.08)]">
            <h2 className="text-sm font-bold text-gray-600">Need help?</h2>
            <p className="mt-2 text-[15px] font-bold text-gray-900">Contact {supportName}</p>
            <p className="mt-1.5 text-[13px] text-gray-500">Ask a question or let your group know if you cannot attend.</p>
            {supportLink ? (
              <a href={supportLink} target="_blank" rel="noreferrer" className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#25d366] p-3 text-sm font-semibold text-white">Contact support</a>
            ) : (
              <p className="mt-4 text-[13px] text-gray-500">Your support&apos;s number is not set yet. Ask at Sunday class.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default ParticipantGroupPage;
