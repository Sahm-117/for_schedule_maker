import React, { useEffect, useState } from 'react';
import { startPolling } from '../hooks/usePolling';
import { NavLink, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import LinkText from '../components/LinkText';
import PageLoader from '../components/PageLoader';
import Avatar from '../components/Avatar';
import WhatsAppIcon from '../components/WhatsAppIcon';
import DocumentViewerSheet from '../components/DocumentViewerSheet';
import SegmentedTabs from '../components/SegmentedTabs';
import ParticipantDiscussionTab from '../components/participantApp/ParticipantDiscussionTab';
import { useShellHelp } from '../components/shellHelp';
import { useParticipantApp } from '../context/ParticipantAppContext';
import { buildWhatsAppLink } from '../utils/phone';
import { normalizeLink } from '../utils/links';
import { participantAppApi } from '../services/api';
import { currentWeekNumber, formatTime, recapHasContent, titleCaseDay } from '../utils/participantApp';

// My Group: the weekly group meeting, who is in the group, and a way to reach
// their support. Other members' phone numbers are not shared. Matches the V2 design.
// While the meeting is on, participants follow along with just two things:
// who the group is praying for and that week's recap.

const CARD = 'rounded-[22px] border border-[#eef0f4] bg-white p-5 shadow-[0_2px_8px_-3px_rgba(17,24,39,0.10)]';

const ParticipantGroupPage: React.FC = () => {
  const { home, loading } = useParticipantApp();
  const openHelp = useShellHelp();
  const [docOpen, setDocOpen] = useState(false);
  const [searchParams] = useSearchParams();
  // Discussion comes first; the meeting tab opens by default while a meeting is on.
  const [tabChoice, setTabChoice] = useState<'discussion' | 'meeting' | null>(
    searchParams.get('tab') === 'meeting' ? 'meeting' : searchParams.get('tab') === 'discussion' ? 'discussion' : null,
  );
  const [unseen, setUnseen] = useState(0);
  const tabNow = tabChoice ?? (home?.groupMeetingLive ? 'meeting' : 'discussion');
  // Orange dot on Discussion while it's closed and others have posted since last look.
  useEffect(() => {
    if (tabNow === 'discussion') { setUnseen(0); return undefined; }
    const check = () => { participantAppApi.discussionUnseen().then(setUnseen).catch(() => {}); };
    check();
    return startPolling(check, 30000);
  }, [tabNow]);
  if (loading || !home) return <PageLoader />;
  const tab = tabNow;

  const group = home.group;
  const scheduled = !!(group?.meetingDay && group.meetingTime);
  const weekNumber = currentWeekNumber(home.cohort?.startDate, new Date(), home.weeks);
  const supportName = group?.supportName || 'your support';
  const liveWeek = home.groupMeetingLive ? home.weeks.find((w) => w.id === home.groupMeetingLive!.weekId) ?? null : null;
  const prayerFocus = home.groupMeetingLive && home.groupPrayerFocus?.weekId === home.groupMeetingLive.weekId ? home.groupPrayerFocus : null;
  const recapFinished = !!home.groupMeetingLive?.recapFinished;
  const prayerFinished = !recapFinished && !!home.groupMeetingLive?.prayerFinished;
  // The support is going through this recap with them, so the meeting sends it
  // even before its normal release time; fall back to the released week.
  const meetingRecap = home.groupMeetingLive?.recap;
  const liveRecap = !prayerFinished || !liveWeek ? null
    : meetingRecap ? { ...liveWeek, ...meetingRecap }
      : liveWeek.released && recapHasContent(liveWeek) ? liveWeek : null;
  const supportLink = buildWhatsAppLink(group?.supportPhone, `Hi ${supportName.split(' ')[0]}, it's ${home.participant.name.split(' ')[0]} from FOF.`);

  return (
    <div className="max-w-2xl lg:max-w-5xl">
      <PageHeader title="My group" subtitle={group ? `${group.name}${group.supportName ? ` · Support: ${group.supportName}` : ''}` : undefined} tourId="participant:group" />
      {!group ? (
        <section data-wt="pg-no-group" className={CARD}>
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffe8d5] text-[#c2410c]" aria-hidden="true">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M17 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 7 18.5V20m5-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 9v-1a3 3 0 0 0-2.2-2.9M16.5 5.2a3 3 0 0 1 0 5.6" /></svg>
          </span>
          <h2 className="mt-3 text-lg font-bold text-gray-900">You&apos;ll be placed in a group soon</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
            Before your first class you&apos;ll be put in a small group with a support, someone who walks with you through FOF.
            They&apos;ll message you, and your group&apos;s call time and link will show here.
          </p>
          {openHelp && (
            <button type="button" onClick={openHelp} className="mt-4 min-h-[46px] w-full rounded-xl border border-[#ffdeca] bg-white p-3 text-sm font-semibold text-[#c2410c]">
              Need help before then?
            </button>
          )}
        </section>
      ) : (
        <div className={`flex flex-col gap-4 ${tab === 'meeting' ? 'desktop-cols' : ''}`}>
          <div className="span-all lg:max-w-md"><SegmentedTabs
            accent
            tabs={[
              { key: 'discussion', label: 'Discussion', dot: unseen > 0 },
              { key: 'meeting', label: 'Meeting' },
            ]}
            active={tab}
            onChange={(key) => setTabChoice(key as 'discussion' | 'meeting')}
          /></div>
          {tab === 'discussion' ? (
            <ParticipantDiscussionTab viewerName={home.participant.name} viewerAvatarUrl={home.profile?.avatarUrl} viewerGender={home.profile?.gender} />
          ) : (
          <>

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

          {home.groupMeetingLive && !prayerFinished && !recapFinished && (
            <section data-wt="pg-live-prayer" className={`${CARD} text-center`} aria-live="polite">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                <span className="relative flex h-2 w-2 flex-none">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-gray-400">Now praying for</p>
              {prayerFocus ? (
                <>
                  <p className="mt-2 text-2xl font-bold leading-snug text-gray-900">{prayerFocus.participantName}</p>
                  {prayerFocus.projectText?.trim() && (
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700"><LinkText text={prayerFocus.projectText.trim()} /></p>
                  )}
                </>
              ) : (
                <p className="mt-3 animate-pulse text-sm text-gray-500">Waiting for {supportName} to pick someone…</p>
              )}
            </section>
          )}

          {home.groupMeetingLive && recapFinished && (
            <section data-wt="pg-live-done" className={`${CARD} text-center`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">{liveWeek ? `Week ${liveWeek.weekNumber} recap` : 'This week'}</p>
              <p className="mt-2 text-xl font-bold text-gray-900">Meeting completed ✓</p>
              <p className="mt-1 text-sm text-gray-500">Drop your reflection now.</p>
              <NavLink
                to={liveWeek?.released ? `/me/week/${liveWeek.weekNumber}` : '/me/journey'}
                className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-white"
              >
                Write my reflection
                <span aria-hidden="true">→</span>
              </NavLink>
            </section>
          )}

          {home.groupMeetingLive && prayerFinished && !liveRecap && (
            <section data-wt="pg-live-recap" className={`${CARD} text-center`}>
              <p className="text-[15px] font-bold text-gray-900">Prayer finished ✓</p>
              <p className="mt-1 text-sm text-gray-500">{supportName} is going through this week&apos;s recap.</p>
            </section>
          )}

          {liveRecap && (
            <section data-wt="pg-live-recap" className={CARD}>
              <p className="mb-2 text-[11px] font-bold text-emerald-700">Prayer finished ✓</p>
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9a6a4b]">Week {liveRecap.weekNumber} recap</span>
              <h2 className="mt-2 text-xl font-bold tracking-[-0.01em] text-gray-900">{liveRecap.title || `Week ${liveRecap.weekNumber}`}</h2>
              {liveRecap.recapSummary?.trim() && (
                <p className="mt-2 whitespace-pre-line text-[14.5px] leading-[1.65] text-gray-700"><LinkText text={liveRecap.recapSummary.trim()} /></p>
              )}
              {liveRecap.discussionPrompt?.trim() && (
                <div className="mt-3 rounded-[14px] border border-[#f1f2f5] p-3.5">
                  <p className="text-[13px] font-bold text-gray-900">Something to think about</p>
                  <p className="mt-1 text-sm leading-normal text-gray-700">{liveRecap.discussionPrompt.trim()}</p>
                </div>
              )}
              {liveRecap.recapDocumentUrl && (
                <button
                  type="button"
                  onClick={() => setDocOpen(true)}
                  className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] font-semibold text-white"
                >
                  <svg className="h-[18px] w-[18px] flex-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.5A3.5 3.5 0 0 0 8.5 3H4v14h5a3 3 0 0 1 3 3m0-13.5A3.5 3.5 0 0 1 15.5 3H20v14h-5a3 3 0 0 0-3 3m0-13.5V20" />
                  </svg>
                  Read the full recap
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </section>
          )}

          <section data-wt="pg-members" className={CARD}>
            <h2 className="text-base font-bold text-gray-900">Your group · {home.members.length + (group.supportName ? 1 : 0)} {home.members.length + (group.supportName ? 1 : 0) === 1 ? 'person' : 'people'}</h2>
            <div className="mt-3.5 flex flex-col gap-2.5">
              {group.supportName && (
                <div className="flex items-center gap-3 rounded-[14px] border border-[#ffdeca] bg-[#fffaf5] px-3.5 py-2.5">
                  <Avatar name={group.supportName} avatarUrl={group.supportAvatarUrl} size="md" enlargeable />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-gray-900">{group.supportName}</p>
                    <p className="text-xs text-gray-500">{supportLink ? 'Your support' : 'Your support · number not available yet'}</p>
                  </div>
                  {supportLink && (
                    <a href={supportLink} target="_blank" rel="noreferrer" aria-label={`Message ${supportName} on WhatsApp`} className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[#25d366] text-white">
                      <WhatsAppIcon className="h-[22px] w-[22px] flex-none text-white" />
                    </a>
                  )}
                </div>
              )}
              {home.members.length > 0 && (
                <div role="group" aria-label="People in your group, scroll sideways" className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {home.members.map((member) => (
                    <div key={member.name} className="flex w-[104px] flex-none snap-start flex-col items-center gap-1.5 rounded-[14px] border border-[#f1f2f5] px-2 py-3 text-center">
                      <Avatar name={member.name} avatarUrl={member.avatarUrl} size="md" enlargeable />
                      <p className="line-clamp-2 text-[13px] font-bold leading-tight text-gray-900">{member.name}</p>
                    </div>
                  ))}
                </div>
              )}
              {home.members.length === 0 && <p className="text-[13px] text-gray-500">You are the first in your group so far.</p>}
            </div>
          </section>

          </>
          )}
        </div>
      )}

      {liveRecap && (
        <DocumentViewerSheet
          open={docOpen}
          url={liveRecap.recapDocumentUrl}
          title={`Week ${liveRecap.weekNumber} recap`}
          fileName={liveRecap.recapDocumentName}
          onClose={() => setDocOpen(false)}
        />
      )}
    </div>
  );
};

export default ParticipantGroupPage;
