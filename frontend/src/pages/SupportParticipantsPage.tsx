import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import SegmentedTabs from '../components/SegmentedTabs';
import SundayClassPanel from '../components/attendance/SundayClassPanel';
import GroupCallCard, { formatMeetingSlot } from '../components/groups/GroupCallCard';
import MeetingModePanel from '../components/groups/MeetingModePanel';
import ParticipantCard from '../components/groups/ParticipantCard';
import ModalShell from '../components/followups/ModalShell';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { faithProjectsApi, groupOnboardingStatusApi, groupPrayerFocusApi, groupPrayerStatusApi, groupsApi, participantHandoversApi, participantFlagsApi, participantNotesApi, participantsApi, coverRequestsApi } from '../services/api';
import type { FaithProject, Group, GroupOnboardingStatus, GroupPrayerFocus, GroupPrayerStatus, Participant, ParticipantHandover, ParticipantFlag, ParticipantNote, CoverRequest } from '../types';
import { getIdealWeekForCohort } from '../utils/weekFocus';
import { sortByText } from '../utils/sort';

type GroupTab = 'faith' | 'prayers' | 'sunday';

const virtualGroupStatus = (groupId: string, groupName: string | null | undefined, participantCount: number): GroupOnboardingStatus => ({
  id: `virtual-${groupId}`,
  groupId,
  groupName: groupName ?? 'Untitled group',
  supportId: null,
  supportName: null,
  participantCount,
  groupCreated: false,
  updatedById: null,
  updatedByName: null,
  updatedAt: undefined,
  completedAt: null,
});

const SupportParticipantsPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCohort, weeks } = useAppData();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groupStatuses, setGroupStatuses] = useState<GroupOnboardingStatus[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [faithProjects, setFaithProjects] = useState<FaithProject[]>([]);
  const [groupPrayerFocuses, setGroupPrayerFocuses] = useState<GroupPrayerFocus[]>([]);
  const [groupPrayerStatuses, setGroupPrayerStatuses] = useState<GroupPrayerStatus[]>([]);
  const [participantNotes, setParticipantNotes] = useState<ParticipantNote[]>([]);
  const [participantHandovers, setParticipantHandovers] = useState<ParticipantHandover[]>([]);
  const [flags, setFlags] = useState<ParticipantFlag[]>([]);
  const [covers, setCovers] = useState<CoverRequest[]>([]);
  const [noteParticipant, setNoteParticipant] = useState<Participant | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedWeekId, setSelectedWeekId] = useState<number | null>(null);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<GroupTab>(() => (searchParams.get('tab') === 'sunday' ? 'sunday' : 'faith'));
  const [savingPrayerFocus, setSavingPrayerFocus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  if (!user || user.role !== 'SUPPORT') return <Navigate to="/support" replace />;

  const cohortWeeks = useMemo(
    () => (weeks ?? []).filter((week) => week.cohortId === activeCohort?.id).sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks, activeCohort]
  );

  const load = useCallback(async () => {
    if (!activeCohort || !user.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    try {
      // These reads are independent — fire them in one parallel batch
      // instead of waterfalling (each round-trip to eu-west-1 is ~300-900ms).
      const [participantsRes, faithRes, prayerFocusRes, groupStatusInitial, prayerStatusRes, groupsRes] = await Promise.all([
        participantsApi.getAll({ cohortId: activeCohort.id, supportId: user.id }).catch((err) => {
          console.error('Failed to load participants:', err);
          return { participants: [] as Participant[] };
        }),
        faithProjectsApi.getAll({ cohortId: activeCohort.id }).catch((err) => {
          console.error('Failed to load faith projects:', err);
          return { projects: [] as FaithProject[] };
        }),
        groupPrayerFocusApi.getForCohort(activeCohort.id).catch((err) => {
          console.error('Failed to load prayer focuses:', err);
          return { focuses: [] as GroupPrayerFocus[] };
        }),
        groupOnboardingStatusApi.getForSupport(user.id, activeCohort.id).catch((err) => {
          console.error('Failed to load group statuses:', err);
          return { statuses: [] as GroupOnboardingStatus[] };
        }),
        groupPrayerStatusApi.getForCohort(activeCohort.id).catch((err) => {
          console.error('Failed to load prayer statuses:', err);
          return { statuses: [] as GroupPrayerStatus[] };
        }),
        groupsApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ groups: [] as Group[] })),
      ]);
      let groupStatusRes = groupStatusInitial;

      if (participantsRes.participants.length === 0 && groupStatusRes.statuses.length === 0) {
        const { groups } = await groupsApi.getAll({ cohortId: activeCohort.id }).catch(() => ({ groups: [] as import('../types').Group[] }));
        if (groups.length === 1) {
          const singleGroup = groups[0];
          const [{ participants: groupParticipants }, cohortStatusesRes] = await Promise.all([
            groupsApi.getParticipants(singleGroup.id).catch(() => ({ participants: [] as Participant[] })),
            groupOnboardingStatusApi.getForCohort(activeCohort.id).catch(() => ({ statuses: [] as GroupOnboardingStatus[] })),
          ]);
          participantsRes.participants = groupParticipants;
          const existingStatus = cohortStatusesRes.statuses.find((status) => status.groupId === singleGroup.id);
          groupStatusRes = {
            statuses: [existingStatus ?? {
              id: `virtual-${singleGroup.id}`,
              groupId: singleGroup.id,
              groupName: singleGroup.name,
              supportId: singleGroup.supportId ?? null,
              supportName: singleGroup.supportName ?? null,
              participantCount: singleGroup.participantCount ?? groupParticipants.length,
              groupCreated: false,
              updatedById: null,
              updatedByName: null,
              updatedAt: undefined,
              completedAt: null,
            }],
          };
        }
      }

      // Groups this support is covering right now (only inside the cover period).
      const activeCovers = await coverRequestsApi.getActiveForCover(user.id).then((res) => res.requests).catch(() => [] as CoverRequest[]);
      const coveredGroups = groupsRes.groups.filter((group) => group.supportId !== user.id && activeCovers.some((cover) => cover.supportId === group.supportId));
      const coveredParticipantLists = await Promise.all(coveredGroups.map((group) =>
        groupsApi.getParticipants(group.id)
          .then((res) => res.participants.map((participant) => ({ ...participant, groupId: group.id, groupName: participant.groupName ?? group.name })))
          .catch(() => [] as Participant[])
      ));
      const coveredParticipants = coveredParticipantLists.flat();

      const participantIds = participantsRes.participants.map((participant) => participant.id);
      const [notesRes, handoversRes, flagsRes] = await Promise.all([
        participantNotesApi.getForParticipants(participantIds).catch(() => ({ notes: [] as ParticipantNote[] })),
        participantHandoversApi.getForParticipants(participantIds).catch(() => ({ handovers: [] as ParticipantHandover[] })),
        participantFlagsApi.getOpenForParticipants(participantIds).catch(() => ({ flags: [] as ParticipantFlag[] })),
      ]);

      setParticipants(sortByText([...participantsRes.participants, ...coveredParticipants], (participant) => participant.fullName));
      setCovers(activeCovers);
      setParticipantNotes(notesRes.notes);
      setParticipantHandovers(handoversRes.handovers);
      setFlags(flagsRes.flags);
      const fallbackGroups = new Map<string, GroupOnboardingStatus>();
      participantsRes.participants.forEach((participant) => {
        if (!participant.groupId || fallbackGroups.has(participant.groupId)) return;
        const count = participantsRes.participants.filter((entry) => entry.groupId === participant.groupId).length;
        fallbackGroups.set(participant.groupId, virtualGroupStatus(participant.groupId, participant.groupName, count));
      });
      groupStatusRes.statuses.forEach((status) => fallbackGroups.set(status.groupId, status));
      const ownStatuses = sortByText(Array.from(fallbackGroups.values()), (status) => status.groupName);
      const coveredStatuses = coveredGroups.map((group, index) => virtualGroupStatus(group.id, `${group.name} (covering)`, coveredParticipantLists[index].length));
      setGroupStatuses([...ownStatuses, ...coveredStatuses]);
      setGroups(groupsRes.groups.filter((g) => g.supportId === user.id || coveredGroups.some((covered) => covered.id === g.id)));
      setFaithProjects(sortByText(faithRes.projects, (project) => project.title || project.participantName));
      setGroupPrayerFocuses(prayerFocusRes.focuses);
      setGroupPrayerStatuses(prayerStatusRes.statuses);

      const availableGroupIds = Array.from(new Set([
        ...groupStatusRes.statuses.map((status) => status.groupId),
        ...participantsRes.participants.map((participant) => participant.groupId).filter(Boolean) as string[],
        ...coveredGroups.map((group) => group.id),
      ]));
      setSelectedGroupId((current) => (current && availableGroupIds.includes(current) ? current : (availableGroupIds[0] ?? '')));
    } catch (err: any) {
      console.error('Unexpected error loading support participants page:', err);
      setLoadError(err?.message || 'Something went wrong loading your group.');
    } finally {
      setLoading(false);
    }
  }, [activeCohort?.id, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (cohortWeeks.length === 0) return;
    const selectedStillExists = selectedWeekId !== null && cohortWeeks.some((week) => week.id === selectedWeekId);
    if (!selectedStillExists) {
      setSelectedWeekId(getIdealWeekForCohort(activeCohort, cohortWeeks)?.id ?? cohortWeeks[0].id);
    }
  }, [activeCohort, cohortWeeks, selectedWeekId]);

  const groupOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; meta?: string }>();
    groupStatuses.forEach((status) => {
      map.set(status.groupId, {
        value: status.groupId,
        label: status.groupName || 'Untitled group',
        meta: `${status.participantCount ?? 0} participants`,
      });
    });
    participants.forEach((participant) => {
      if (!participant.groupId || map.has(participant.groupId)) return;
      map.set(participant.groupId, {
        value: participant.groupId,
        label: participant.groupName || 'Untitled group',
        meta: 'Participant group',
      });
    });
    return sortByText(Array.from(map.values()), (option) => option.label);
  }, [groupStatuses, participants]);

  const selectedParticipants = useMemo(
    () => sortByText(
      participants.filter((participant) => participant.groupId === selectedGroupId),
      (participant) => participant.fullName
    ),
    [participants, selectedGroupId]
  );

  const selectedGroup = useMemo(
    () => groupStatuses.find((status) => status.groupId === selectedGroupId) ?? null,
    [groupStatuses, selectedGroupId]
  );
  const selectedGroupData = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  // A covered group belongs to another support: the covering support can only mark attendance there.
  const coveringFor = selectedGroupData && selectedGroupData.supportId !== user.id
    ? covers.find((cover) => cover.supportId === selectedGroupData.supportId) ?? null
    : null;

  useEffect(() => {
    if (coveringFor && activeTab === 'faith') setActiveTab('prayers');
  }, [coveringFor, activeTab]);

  const selectedWeek = cohortWeeks.find((week) => week.id === selectedWeekId) ?? null;
  const currentPrayerFocus = groupPrayerFocuses.find((focus) => focus.groupId === selectedGroupId && focus.weekId === selectedWeekId) ?? null;
  const currentPrayerStatus = groupPrayerStatuses.find((status) => status.groupId === selectedGroupId && status.weekId === selectedWeekId) ?? null;
  const focusedParticipant = currentPrayerFocus
    ? participants.find((participant) => participant.id === currentPrayerFocus.participantId) ?? null
    : null;

  const setPrayerFocus = async (participantId: string) => {
    if (!selectedGroupId || !selectedWeekId || !user.id) return;
    setSavingPrayerFocus(true);
    try {
      if (!participantId) {
        await groupPrayerFocusApi.clear(selectedGroupId, selectedWeekId);
        setGroupPrayerFocuses((prev) => prev.filter((entry) => !(entry.groupId === selectedGroupId && entry.weekId === selectedWeekId)));
        return;
      }

      const { focus } = await groupPrayerFocusApi.setFocus(selectedGroupId, selectedWeekId, participantId, user.id);
      setGroupPrayerFocuses((prev) => {
        const others = prev.filter((entry) => !(entry.groupId === focus.groupId && entry.weekId === focus.weekId));
        return [...others, focus];
      });
    } finally {
      setSavingPrayerFocus(false);
    }
  };

  const setPrayerDone = async (done: boolean) => {
    if (!selectedGroupId || !selectedWeekId || !user.id) return;
    const wasDone = currentPrayerStatus?.done === true;
    const { status } = await groupPrayerStatusApi.setDone(selectedGroupId, selectedWeekId, done, user.id);
    setGroupPrayerStatuses((prev) => {
      const others = prev.filter((entry) => !(entry.groupId === status.groupId && entry.weekId === status.weekId));
      return [...others, status];
    });
    if (done && !wasDone) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      fetch(`${supabaseUrl}/functions/v1/notify-group-meeting-completed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          groupName: selectedGroup?.groupName ?? selectedGroupData?.name ?? 'A group',
          weekNumber: selectedWeek?.weekNumber,
          supportName: user.name,
        }),
      }).catch(() => {/* Notification delivery must not block marking the meeting done. */});
    }
  };

  const saveParticipantNote = async () => {
    if (!noteParticipant || !user.id || !noteBody.trim()) return;
    setSavingNote(true);
    try {
      const { note } = await participantNotesApi.create({
        participantId: noteParticipant.id, body: noteBody, authorId: user.id,
        groupId: noteParticipant.groupId ?? null, noteType: 'HANDOVER',
      });
      setParticipantNotes((prev) => [note, ...prev]);
      setNoteParticipant(null);
      setNoteBody('');
    } finally {
      setSavingNote(false);
    }
  };

  // Meeting Mode submit: notes are kept as a MEETING note on the prayer-focus participant, then the week is marked done.
  const handleMeetingSubmit = async ({ summary, concern }: { summary: string; concern: string }) => {
    if (!selectedWeekId || !user.id) return;
    const body = [summary && `How it went: ${summary}`, concern && `Needs attention: ${concern}`].filter(Boolean).join('\n\n');
    if (body && focusedParticipant) {
      const { note } = await participantNotesApi.create({
        participantId: focusedParticipant.id, body, authorId: user.id,
        groupId: selectedGroupId, weekId: selectedWeekId, noteType: 'MEETING',
      });
      setParticipantNotes((prev) => [note, ...prev]);
    }
    await setPrayerDone(true);
  };

  return (
    <div className="page-content">
      <PageHeader
        title="My Group"
        subtitle="Your group's faith projects and weekly prayer check-ins."
      />

      {loading ? (
        <PageLoader />
      ) : loadError ? (
        <section className="surface-card p-6 text-center">
          <p className="text-sm text-red-600">{loadError}</p>
          <button type="button" onClick={() => { void load(); }} className="mt-4 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white">
            Retry
          </button>
        </section>
      ) : !selectedGroupId ? (
        <section className="surface-card p-6 text-center">
          <p className="text-sm text-gray-500">You do not have a group assigned yet.</p>
          <p className="mt-1 text-xs text-gray-400">Once a group is assigned, your group workspace will appear here.</p>
        </section>
      ) : (
        <div className="max-w-[760px] space-y-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] text-gray-500">
                {selectedGroup?.groupName || groupOptions.find((option) => option.value === selectedGroupId)?.label}
                {(() => {
                  const slot = formatMeetingSlot(selectedGroupData?.meetingDay, selectedGroupData?.meetingTime);
                  return slot ? ` · meets ${slot}` : '';
                })()}
                {` · ${selectedParticipants.length} participant${selectedParticipants.length === 1 ? '' : 's'}`}
              </p>
              {groupOptions.length > 1 && (
                <div className="ml-auto w-full max-w-[14rem]">
                  <AppSelect
                    value={selectedGroupId}
                    onChange={setSelectedGroupId}
                    options={groupOptions}
                    placeholder="Choose a group"
                    compact
                  />
                </div>
              )}
            </div>

            {coveringFor && (
              <p className="rounded-xl bg-sky-100/80 px-3.5 py-2.5 text-[13px] font-semibold text-sky-700">
                Covering for {coveringFor.supportName || 'another support'} until {new Date(coveringFor.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. You can mark attendance for this group.
              </p>
            )}

            <div>
              <SegmentedTabs
                tabs={[
                  ...(coveringFor ? [] : [{ key: 'faith', label: 'Participants', shortLabel: 'People' }]),
                  { key: 'prayers', label: 'Group meetings', shortLabel: 'Meetings' },
                  { key: 'sunday', label: 'Sunday class', shortLabel: 'Sunday' },
                ]}
                active={activeTab}
                onChange={(key) => setActiveTab(key as GroupTab)}
              />
            </div>
          </div>

          {activeTab === 'sunday' ? (
            <SundayClassPanel
              supportId={coveringFor ? (selectedGroupData?.supportId ?? user.id) : user.id}
              markedById={user.id}
              participants={selectedParticipants}
              weeks={cohortWeeks}
              weekId={selectedWeekId}
              onWeekChange={setSelectedWeekId}
              venue={activeCohort?.venue}
              onParticipantUpdated={(updated) => {
                setParticipants((prev) => sortByText(prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x), (p) => p.fullName));
              }}
            />
          ) : activeTab === 'faith' ? (
            <div className="space-y-3">
            <GroupCallCard
              group={selectedGroupData}
              fallbackLink={user.whatsappGroupUrl ?? null}
              onGroupUpdated={(updated) => setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g))}
            />
            {selectedParticipants.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-orange-200 bg-white py-12 text-center text-sm text-gray-500">
                No participants are in this group yet.
              </div>
            ) : selectedParticipants.map((participant) => (
              <ParticipantCard
                key={participant.id}
                participant={participant}
                groupName={selectedGroup?.groupName ?? participant.groupName ?? null}
                project={faithProjects.find((entry) => entry.participantId === participant.id) ?? null}
                notes={participantNotes.filter((entry) => entry.participantId === participant.id)}
                handovers={participantHandovers.filter((entry) => entry.participantId === participant.id)}
                weekId={selectedWeek?.id ?? null}
                userId={user.id}
                supportName={user.name}
                onProjectSaved={(savedProject) => {
                  setFaithProjects((prev) => {
                    const others = prev.filter((entry) => entry.participantId !== savedProject.participantId);
                    return sortByText([...others, savedProject], (project) => project.title || project.participantName);
                  });
                }}
                onParticipantUpdated={(updated) => {
                  setParticipants((prev) => sortByText(prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x), (p) => p.fullName));
                }}
                onAddNote={() => { setNoteParticipant(participant); setNoteBody(''); }}
                onNoteAdded={(note) => setParticipantNotes((prev) => [note, ...prev])}
                openFlag={flags.find((flag) => flag.participantId === participant.id) ?? null}
                onFlagRaised={(flag) => setFlags((prev) => [flag, ...prev.filter((entry) => entry.participantId !== flag.participantId)])}
                onFlagCleared={(flagId) => setFlags((prev) => prev.filter((entry) => entry.id !== flagId))}
              />
            ))}
            </div>
          ) : (
            <MeetingModePanel
              weeks={cohortWeeks}
              weekId={selectedWeekId}
              onWeekChange={setSelectedWeekId}
              slotLabel={formatMeetingSlot(selectedGroupData?.meetingDay, selectedGroupData?.meetingTime, selectedGroupData?.meetingDurationMins)}
              participants={selectedParticipants}
              faithProjects={faithProjects}
              focusParticipantId={currentPrayerFocus?.participantId ?? null}
              savingFocus={savingPrayerFocus}
              onSetFocus={setPrayerFocus}
              submitted={!!currentPrayerStatus?.done}
              onSubmit={handleMeetingSubmit}
              onReopen={() => setPrayerDone(false)}
              groupId={selectedGroupId || null}
              userId={user.id}
              recapSummary={selectedWeek?.recapSummary}
              discussionPrompt={selectedWeek?.discussionPrompt}
              recapDocumentUrl={selectedWeek?.recapDocumentUrl}
              recapDocumentName={selectedWeek?.recapDocumentName}
            />
          )}
        </div>
      )}

      <ModalShell
        isOpen={!!noteParticipant}
        onClose={() => setNoteParticipant(null)}
        title={noteParticipant ? `Add note — ${noteParticipant.fullName}` : 'Add participant note'}
        subtitle="This note stays with the participant and is visible to admins and a future assigned support."
        footer={<>
          <button type="button" onClick={() => setNoteParticipant(null)} className="rounded-2xl border border-orange-200 px-5 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
          <button type="button" onClick={() => { void saveParticipantNote(); }} disabled={savingNote || !noteBody.trim()} className="rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{savingNote ? 'Saving…' : 'Submit note'}</button>
        </>}
      >
        <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} rows={5} placeholder="Add helpful context for the next support…" className="w-full rounded-xl border border-orange-200 px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </ModalShell>
    </div>
  );
};

export default SupportParticipantsPage;
