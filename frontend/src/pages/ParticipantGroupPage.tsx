import React from 'react';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import Avatar from '../components/Avatar';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { buildWhatsAppLink } from '../utils/phone';
import { normalizeLink } from '../utils/links';
import { currentWeekNumber, formatTime, titleCaseDay } from '../utils/participantApp';

// My Group: the weekly group meeting, who is in the group, and a way to reach
// their support. Other members' phone numbers are not shared. Matches the V2 design.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const ParticipantGroupPage: React.FC = () => {
  const { home, loading } = useParticipantApp();
  if (loading || !home) return <PageLoader />;

  const group = home.group;
  const scheduled = !!(group?.meetingDay && group.meetingTime);
  const weekNumber = currentWeekNumber(home.cohort?.startDate, new Date());
  const supportName = group?.supportName || 'your support';
  const supportLink = buildWhatsAppLink(group?.supportPhone, `Hi ${supportName.split(' ')[0]}, it's ${home.participant.name.split(' ')[0]} from FOF.`);

  return (
    <div className="max-w-2xl">
      <PageHeader title="My group" tourId="participant:group" />
      {!group ? (
        <section className={`${CARD} text-center`}>
          <p className="text-[15px] font-bold text-gray-900">You are not in a group yet</p>
        </section>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.04em] text-[#9a6a4b]">{group.name}</p>

          <section data-wt="pg-meeting" className={CARD}>
            {home.groupMeetingLive && (
              <div className="mb-3.5 flex items-center justify-between gap-3 rounded-[14px] bg-emerald-100/80 px-3.5 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-bold text-emerald-700">
                  <span className="relative flex h-2 w-2 flex-none">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  On now
                </span>
                {normalizeLink(group.callLink?.trim() || '') && (
                  <a href={normalizeLink(group.callLink!.trim())!} target="_blank" rel="noreferrer" className="flex-none rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Join</a>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.04em] text-gray-400">Next meeting</p>
              <span className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold ${scheduled ? 'bg-[#f2fbf5] text-[#15803d]' : 'bg-[#f6f7f9] text-gray-500'}`}>
                {scheduled ? 'Scheduled' : 'Not scheduled'}
              </span>
            </div>
            <p className="mt-2 text-[22px] font-extrabold text-gray-900">
              {scheduled ? `${titleCaseDay(group.meetingDay)} · ${formatTime(group.meetingTime)}` : 'Waiting on your support to schedule this'}
            </p>
            <p className="mt-0.5 text-[13px] text-gray-500">{group.meetingDurationMins || 45} min</p>

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

          </section>

          <section data-wt="pg-members" className={CARD}>
            <h2 className="text-base font-bold text-gray-900">Group members</h2>
            <div className="mt-3.5 flex flex-col gap-2.5">
              {group.supportName && (
                <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#ffdeca] bg-[#fffaf5] px-3.5 py-3">
                  <Avatar name={group.supportName} avatarUrl={group.supportAvatarUrl} size="md" enlargeable />
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
                  <Avatar name={member.name} avatarUrl={member.avatarUrl} size="md" enlargeable />
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
            {supportLink ? (
              <a href={supportLink} target="_blank" rel="noreferrer" className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#25d366] p-3 text-sm font-semibold text-white">Contact support</a>
            ) : (
              <p className="mt-4 text-[13px] text-gray-500">Number not available yet.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default ParticipantGroupPage;
