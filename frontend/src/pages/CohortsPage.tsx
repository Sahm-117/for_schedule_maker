import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import PageHeader from '../components/PageHeader';
import ConfirmationModal from '../components/ConfirmationModal';
import NextCohortAssignModal from '../components/followups/NextCohortAssignModal';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { uploadClassImage, removeClassImage, cohortsApi, supportHubsApi, usersApi, weeksApi, groupsApi, participantsApi, followUpContactsApi, recapDocumentsApi, teenRecapDocumentsApi, manualDocumentsApi, earlierClassDocumentsApi, aiApi, settingsApi } from '../services/api';
import type { Cohort, EarlierClassDocument, FollowUpContact, User, Week } from '../types';
import { sortByText } from '../utils/sort';
import { DEFAULT_RECAP_RELEASE_TIMES, formatRecapReleaseAt, recapReleaseAt, type RecapReleaseTimes } from '../utils/recapReleaseTimes';
import Spinner from '../components/Spinner';
import SegmentedTabs from '../components/SegmentedTabs';
import AppDateTimePicker from '../components/AppDateTimePicker';
import InfoTip from '../components/InfoTip';
import { hasSupportRole } from '../utils/people';

type CohortFormState = {
  name: string;
  description: string;
  venue: string;
  startDate: string;
  endDate: string;
  weekCount: number;
};

const emptyForm = (): CohortFormState => ({
  name: '',
  description: '',
  venue: '',
  startDate: '',
  endDate: '',
  weekCount: 10,
});

// "Thursday at 6:00 PM", read straight off a RecapReleaseTimes day/time pair -- no
// cohort start date needed, unlike formatRecapReleaseAt (which needs a real
// calendar date). Used in the week editor's compact "Goes out ..." labels.
const DAY_LABEL: Record<string, string> = {
  SUNDAY: 'Sunday', MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday',
};
const formatDayTime = (day: string, time: string) => {
  const [h, m] = time.split(':').map(Number);
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${DAY_LABEL[day] || day} at ${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// "Choose an earlier file" picker, shared by the manual and recap steps of
// the week editor: an inline expandable list rather than a nested modal
// (ModalShell already portals the week editor to body).
// Teen recap release times are typed in Lagos time (always UTC+1, no daylight saving).
const lagosInputFromIso = (iso?: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '' : new Date(ms + 3600000).toISOString().slice(0, 16);
};
const isoFromLagosInput = (value: string): string | null => (value ? new Date(`${value}:00+01:00`).toISOString() : null);

const EarlierFilePicker: React.FC<{
  open: boolean;
  docs: import('../types').EarlierClassDocument[];
  loading: boolean;
  error: string;
  onChoose: (doc: import('../types').EarlierClassDocument) => void;
  onCancel: () => void;
}> = ({ open, docs, loading, error, onChoose, onCancel }) => {
  if (!open) return null;
  return (
    <div className="mt-2 rounded-2xl border border-gray-200 p-3">
      {loading ? (
        <p className="flex items-center gap-1.5 py-3 text-center text-sm text-gray-500"><Spinner className="h-3.5 w-3.5" />Loading earlier files…</p>
      ) : error ? (
        <p className="py-2 text-sm text-red-700">{error}</p>
      ) : docs.length === 0 ? (
        <p className="py-2 text-sm text-gray-400">No earlier files yet.</p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {docs.map((doc, index) => (
            <li key={`${doc.url}-${index}`}>
              <button
                type="button"
                onClick={() => onChoose(doc)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-bold ${doc.kind === 'MANUAL' ? 'bg-indigo-100/80 text-indigo-700' : doc.kind === 'TEEN_RECAP' ? 'bg-pink-100/80 text-pink-700' : 'bg-sky-100/80 text-sky-700'}`}>{doc.kind === 'MANUAL' ? 'Manual' : doc.kind === 'TEEN_RECAP' ? 'Teen recap' : 'Recap'}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{doc.name || 'Document'}</span>
                <span className="flex-none text-xs text-gray-400">{doc.cohortName} · Wk {doc.weekNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onCancel} className="mt-2 text-xs font-semibold text-gray-500">Cancel</button>
    </div>
  );
};

const formatDateRange = (startDate?: string | null, endDate?: string | null) => {
  const formatDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  };
  const start = formatDate(startDate) || 'No start';
  const end = formatDate(endDate) || 'No end';
  return `${start} to ${end}`;
};

// End date = the Sunday that closes week N, where week 1 starts on startDate.
// Each week is 7 days, so week N ends on startDate + (weekCount - 1) * 7 + 6 days,
// then advance to the following Sunday if not already one.
const getAutoEndDate = (startDate: string, weekCount: number) => {
  if (!startDate || weekCount < 1) return '';
  const date = new Date(`${startDate}T12:00:00`);
  date.setDate(date.getDate() + (weekCount - 1) * 7 + 6);
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
};

// Number of weeks spanned by an existing start→end date range (rounded up),
// used to preserve a cohort's real length when editing its start date.
const weeksBetween = (startDate?: string | null, endDate?: string | null): number | null => {
  if (!startDate || !endDate) return null;
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const end = new Date(`${endDate}T12:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
};

const updateStartDate = (
  setter: React.Dispatch<React.SetStateAction<CohortFormState>>,
  startDate: string,
  weekCount: number,
) => {
  setter((prev) => ({
    ...prev,
    startDate,
    endDate: startDate ? getAutoEndDate(startDate, weekCount) : '',
  }));
};

const CohortsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { cohorts, activeCohort, setActiveCohort, reloadWeeks, reloadCohorts } = useAppData();
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [cohortWeeksById, setCohortWeeksById] = useState<Record<string, Week[]>>({});
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [weekAddTarget, setWeekAddTarget] = useState<{ cohortId: string; weekNumber: number } | null>(null);
  const [weekDeleteTarget, setWeekDeleteTarget] = useState<{ cohortId: string; weekId: number; weekNumber: number } | null>(null);
  const editedWeekId = useRef<number | null>(null);
  // Class pictures uploaded during this edit, and the ones kept by Save: anything else is deleted when the editor closes.
  const sessionUploads = useRef<string[]>([]);
  const keptUploads = useRef<Set<string>>(new Set());
  const [weekEditTarget, setWeekEditTarget] = useState<{ cohortId: string; week: Week } | null>(null);
  useEffect(() => {
    editedWeekId.current = weekEditTarget?.week.id ?? null;
    return () => {
      sessionUploads.current.forEach((url) => { if (!keptUploads.current.has(url)) void removeClassImage(url); });
      sessionUploads.current = [];
      keptUploads.current = new Set();
    };
  }, [weekEditTarget?.week.id]);
  const [addWeekChoice, setAddWeekChoice] = useState('blank');
  const [weekTitleDraft, setWeekTitleDraft] = useState('');
  const [recapSummaryDraft, setRecapSummaryDraft] = useState('');
  const [shareWithParticipantsDraft, setShareWithParticipantsDraft] = useState(true);
  const [expectationsDraft, setExpectationsDraft] = useState('');
  // "Draft with AI": admins paste the class notes and get a recap summary and prompt to edit.
  const [aiNotesOpen, setAiNotesOpen] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [discussionPromptDraft, setDiscussionPromptDraft] = useState('');
  const [recapDocUploading, setRecapDocUploading] = useState(false);
  const [recapDocError, setRecapDocError] = useState('');
  const [recapReleaseTimes, setRecapReleaseTimes] = useState<RecapReleaseTimes>(DEFAULT_RECAP_RELEASE_TIMES);
  const [sendNowConfirmOpen, setSendNowConfirmOpen] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  // Class manual (step 1 of the redesigned week editor) -- same shape as the
  // recap fields above, plus its own AI-helper toggle and send-now confirm.
  const [manualSummaryDraft, setManualSummaryDraft] = useState('');
  // The class card on the participant home: a graphic and who is teaching.
  const [classGraphicDraft, setClassGraphicDraft] = useState<string | null>(null);
  const [teacherNameDraft, setTeacherNameDraft] = useState('');
  const [teacherRoleDraft, setTeacherRoleDraft] = useState('');
  const [teacherBioDraft, setTeacherBioDraft] = useState('');
  const [teacherPhotoDraft, setTeacherPhotoDraft] = useState<string | null>(null);
  const [classImageBusy, setClassImageBusy] = useState<'graphic' | 'teacher' | null>(null);
  const [classImageError, setClassImageError] = useState('');
  const [manualDiscussionPromptDraft, setManualDiscussionPromptDraft] = useState('');
  const [manualAiOpen, setManualAiOpen] = useState(false);
  const [manualAiNotes, setManualAiNotes] = useState('');
  const [manualAiDrafting, setManualAiDrafting] = useState(false);
  const [manualAiError, setManualAiError] = useState('');
  const [manualDocUploading, setManualDocUploading] = useState(false);
  const [manualDocError, setManualDocError] = useState('');
  const [manualSendNowConfirmOpen, setManualSendNowConfirmOpen] = useState(false);
  const [sendingManualNow, setSendingManualNow] = useState(false);
  // "Choose an earlier file" picker, shared by the manual and recap steps.
  const [earlierPicker, setEarlierPicker] = useState<'manual' | 'recap' | 'teen' | null>(null);
  // Teen recap: its own text, document and optional release time (empty = as soon as it exists).
  const [recapAudience, setRecapAudience] = useState<'adults' | 'teens'>('adults');
  const [teenSummaryDraft, setTeenSummaryDraft] = useState('');
  const [teenPromptDraft, setTeenPromptDraft] = useState('');
  const [teenReleaseMode, setTeenReleaseMode] = useState<'now' | 'time'>('now');
  const [teenReleaseDraft, setTeenReleaseDraft] = useState('');
  const [teenDocUploading, setTeenDocUploading] = useState(false);
  const [teenDocError, setTeenDocError] = useState('');
  const [earlierDocs, setEarlierDocs] = useState<EarlierClassDocument[]>([]);
  const [earlierDocsLoading, setEarlierDocsLoading] = useState(false);
  const [earlierDocsError, setEarlierDocsError] = useState('');

  useEffect(() => {
    settingsApi.getRecapReleaseTimes().then(setRecapReleaseTimes).catch(() => {});
  }, []);

  const [nextCohortPrompt, setNextCohortPrompt] = useState<{ contacts: FollowUpContact[]; newCohortId: string; newCohortName?: string } | null>(null);

  const [savingCreate, setSavingCreate] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [weekActionPending, setWeekActionPending] = useState(false);
  const [deletingCohort, setDeletingCohort] = useState(false);

  const [createForm, setCreateForm] = useState<CohortFormState>(emptyForm);
  const [detailsForm, setDetailsForm] = useState<CohortFormState>(emptyForm);
  const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.getAll()
      .then((response) => setSupportUsers(sortByText(response.users.filter((user) => hasSupportRole(user) && user.isActive !== false), (user) => user.name)))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    setSelectedCohortId(activeCohort?.id || cohorts[0]?.id || '');
  }, [activeCohort?.id, cohorts]);

  // Summary counts for the active cohort card.
  const [activeSummary, setActiveSummary] = useState<{ groups: number; hubs: number; supports: number; participants: number } | null>(null);
  useEffect(() => {
    if (!activeCohort?.id) { setActiveSummary(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const [{ groups }, { participants }, { hubs }, { users: members }] = await Promise.all([
          groupsApi.getAll({ cohortId: activeCohort.id }),
          participantsApi.getAll({ cohortId: activeCohort.id }),
          supportHubsApi.getAll(activeCohort.id),
          cohortsApi.getMembers(activeCohort.id),
        ]);
        if (cancelled) return;
        // Supports = those switched on for this cohort in the members list.
        const supports = members.filter((u) => hasSupportRole(u) && u.isActive !== false).length;
        setActiveSummary({ groups: groups.length, hubs: hubs.length, supports, participants: participants.length });
      } catch {
        if (!cancelled) setActiveSummary(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCohort?.id, savingMembers]);

  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedCohortId) || null;

  useEffect(() => {
    if (!selectedCohortId) {
      setMemberIds([]);
      return;
    }
    cohortsApi.getMembers(selectedCohortId)
      .then((response) => setMemberIds(response.users.map((user) => user.id)))
      .catch(() => setMemberIds([]));
  }, [selectedCohortId]);

  useEffect(() => {
    let cancelled = false;

    const loadCohortWeeks = async () => {
      const entries = await Promise.all(
        cohorts.map(async (cohort) => {
          try {
            const response = await weeksApi.getAll(cohort.id);
            return [cohort.id, response.weeks] as const;
          } catch {
            return [cohort.id, [] as Week[]] as const;
          }
        }),
      );

      if (!cancelled) {
        setCohortWeeksById(Object.fromEntries(entries));
      }
    };

    if (cohorts.length > 0) {
      void loadCohortWeeks();
    } else {
      setCohortWeeksById({});
    }

    return () => {
      cancelled = true;
    };
  }, [cohorts]);

  const weekCounts = useMemo(
    () => Object.fromEntries(cohorts.map((cohort) => [cohort.id, cohortWeeksById[cohort.id]?.length || 0])),
    [cohorts, cohortWeeksById],
  );

  useEffect(() => {
    if (!selectedCohort) {
      setDetailsForm(emptyForm());
      return;
    }
    setDetailsForm({
      name: selectedCohort.name,
      description: selectedCohort.description || '',
      venue: selectedCohort.venue || '',
      startDate: selectedCohort.startDate || '',
      endDate: selectedCohort.endDate || '',
      // Derive the real week span from the existing dates so changing the start
      // date preserves this cohort's actual length instead of forcing 10 weeks.
      weekCount: weeksBetween(selectedCohort.startDate, selectedCohort.endDate) ?? 10,
    });
  }, [selectedCohort]);

  const sortedSupportUsers = useMemo(
    () => sortByText(supportUsers, (user) => user.name),
    [supportUsers],
  );

  const visibleSupportUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return sortedSupportUsers;
    return sortedSupportUsers.filter((user) => (
      user.name.toLowerCase().includes(q)
      || (user.phone || '').toLowerCase().includes(q)
      || (user.email || '').toLowerCase().includes(q)
    ));
  }, [sortedSupportUsers, memberSearch]);

  const allVisibleMembersOn = visibleSupportUsers.length > 0
    && visibleSupportUsers.every((user) => memberIds.includes(user.id));

  const toggleAllVisibleMembers = () => {
    setMemberIds((prev) => {
      if (allVisibleMembersOn) {
        const visibleIds = new Set(visibleSupportUsers.map((user) => user.id));
        return prev.filter((id) => !visibleIds.has(id));
      }
      const next = new Set(prev);
      visibleSupportUsers.forEach((user) => next.add(user.id));
      return Array.from(next);
    });
  };

  const olderCohorts = useMemo(() => {
    return cohorts
      .filter((cohort) => cohort.id !== activeCohort?.id)
      .filter((cohort) => showArchived || cohort.status !== 'ARCHIVED')
      .sort((a, b) => {
        const left = a.startDate || a.createdAt || '';
        const right = b.startDate || b.createdAt || '';
        return left.localeCompare(right);
      });
  }, [activeCohort?.id, cohorts, showArchived]);

  const archivedOlderCohortCount = useMemo(
    () => cohorts.filter((cohort) => cohort.id !== activeCohort?.id && cohort.status === 'ARCHIVED').length,
    [activeCohort?.id, cohorts],
  );

  const cohortOptions = sortByText(cohorts, (cohort) => cohort.name).map((cohort) => ({
    value: cohort.id,
    label: cohort.name,
    meta: `${weekCounts[cohort.id] || 0} weeks • ${formatDateRange(cohort.startDate, cohort.endDate)}`,
  }));

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const openCreateModal = () => {
    setCreateForm(emptyForm());
    setStatus('');
    setCreateOpen(true);
  };

  const openDetailsModal = (cohort: Cohort) => {
    setSelectedCohortId(cohort.id);
    setStatus('');
    setDetailsOpen(true);
  };

  const openMembersModal = (cohort: Cohort) => {
    setSelectedCohortId(cohort.id);
    setStatus('');
    setMemberSearch('');
    setMembersOpen(true);
  };

  const openDeleteModal = (cohort: Cohort) => {
    setCohortToDelete(cohort);
    setStatus('');
    setDeleteOpen(true);
  };

  const handleCreateCohort = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCohort || !createForm.name.trim()) return;
    setSavingCreate(true);
    setStatus('');
    try {
      const newCohort = await cohortsApi.createFromCurrent({
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        venue: createForm.venue.trim() || null,
        startDate: createForm.startDate || null,
        endDate: createForm.endDate || null,
        sourceCohortId: activeCohort.id,
      });
      await reloadCohorts();
      setCreateOpen(false);
      setCreateForm(emptyForm());
      setStatus('New cohort created from the current cohort.');
      // Check for next-cohort follow-up contacts in the current cohort
      const newCohortId = (newCohort as { cohort: Cohort })?.cohort?.id;
      const newCohortName = (newCohort as { cohort: Cohort })?.cohort?.name;
      if (newCohortId) {
        try {
          const { contacts } = await followUpContactsApi.getNextCohortContacts(activeCohort.id);
          if (contacts.length > 0) {
            setNextCohortPrompt({ contacts, newCohortId, newCohortName });
          }
        } catch { /* non-critical */ }
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create cohort.');
    } finally {
      setSavingCreate(false);
    }
  };

  const handleSaveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCohortId || !detailsForm.name.trim()) return;
    setSavingDetails(true);
    setStatus('');
    try {
      await cohortsApi.update(selectedCohortId, {
        name: detailsForm.name.trim(),
        description: detailsForm.description.trim() || null,
        venue: detailsForm.venue.trim() || null,
        startDate: detailsForm.startDate || null,
        endDate: detailsForm.endDate || null,
      });
      await reloadCohorts();
      setDetailsOpen(false);
      setStatus('Cohort details updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update cohort.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveMembers = async () => {
    if (!selectedCohortId) return;
    setSavingMembers(true);
    setStatus('');
    try {
      await cohortsApi.setMembers(selectedCohortId, memberIds);
      setMembersOpen(false);
      setStatus('Cohort members updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update cohort members.');
    } finally {
      setSavingMembers(false);
    }
  };

  const getCohortWeeks = (cohortId: string) => cohortWeeksById[cohortId] || [];

  const syncCohortWeeks = async (cohortId: string) => {
    const response = await weeksApi.getAll(cohortId);
    setCohortWeeksById((prev) => ({ ...prev, [cohortId]: response.weeks }));
  };

  const openAddWeekModal = (cohortId: string, weekNumber: number) => {
    setWeekAddTarget({ cohortId, weekNumber });
    setAddWeekChoice('blank');
    setStatus('');
  };

  const openDeleteWeekModal = (cohortId: string, week: Week) => {
    setWeekDeleteTarget({ cohortId, weekId: week.id, weekNumber: week.weekNumber });
    setStatus('');
  };

  const openEditWeekModal = (cohortId: string, week: Week) => {
    setWeekEditTarget({ cohortId, week });
    setWeekTitleDraft(week.title || '');
    setRecapSummaryDraft(week.recapSummary || '');
    setDiscussionPromptDraft(week.discussionPrompt || '');
    setShareWithParticipantsDraft(week.shareWithParticipants !== false);
    setExpectationsDraft(week.expectations || '');
    setAiNotesOpen(false);
    setAiNotes('');
    setAiError('');
    setManualSummaryDraft(week.manualSummary || '');
    setClassGraphicDraft(week.classGraphicUrl ?? null);
    setTeacherNameDraft(week.teacherName || '');
    setTeacherRoleDraft(week.teacherRole || '');
    setTeacherBioDraft(week.teacherBio || '');
    setTeacherPhotoDraft(week.teacherPhotoUrl ?? null);
    setClassImageError('');
    setManualDiscussionPromptDraft(week.manualDiscussionPrompt || '');
    setRecapAudience('adults');
    setTeenSummaryDraft(week.teenRecapSummary || '');
    setTeenPromptDraft(week.teenDiscussionPrompt || '');
    setTeenReleaseMode(week.teenRecapReleaseAt ? 'time' : 'now');
    setTeenReleaseDraft(lagosInputFromIso(week.teenRecapReleaseAt));
    setTeenDocError('');
    setManualAiOpen(false);
    setManualAiNotes('');
    setManualAiError('');
    setManualDocError('');
    setEarlierPicker(null);
    setStatus('');
  };

  const handleAddWeek = async () => {
    if (!weekAddTarget) return;
    setWeekActionPending(true);
    setStatus('');
    try {
      await cohortsApi.addWeekAt(
        weekAddTarget.cohortId,
        weekAddTarget.weekNumber,
        addWeekChoice === 'blank' ? undefined : { duplicateFromWeekId: Number(addWeekChoice) },
      );
      await reloadCohorts();
      await syncCohortWeeks(weekAddTarget.cohortId);
      if (activeCohort?.id === weekAddTarget.cohortId) {
        await reloadWeeks();
      }
      setWeekAddTarget(null);
      setStatus(`Week ${weekAddTarget.weekNumber} was added to the cohort.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to add week.');
    } finally {
      setWeekActionPending(false);
    }
  };

  const handleDeleteWeek = async () => {
    if (!weekDeleteTarget) return;
    setWeekActionPending(true);
    setStatus('');
    try {
      const response = await cohortsApi.deleteWeek(weekDeleteTarget.weekId);
      await reloadCohorts();
      await syncCohortWeeks(weekDeleteTarget.cohortId);
      if (activeCohort?.id === weekDeleteTarget.cohortId) {
        await reloadWeeks();
      }
      setWeekDeleteTarget(null);
      setStatus(`Week ${response.deletedWeekNumber} was removed from the cohort.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to remove week.');
    } finally {
      setWeekActionPending(false);
    }
  };

  // Recap documents save straight away (upload / remove), separate from the text fields.
  const handleRecapDocument = async (file: File | null) => {
    if (!weekEditTarget) return;
    setRecapDocUploading(true);
    setRecapDocError('');
    try {
      if (file) {
        const { url, name } = await recapDocumentsApi.upload(weekEditTarget.week.id, file);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, recapDocumentUrl: url, recapDocumentName: name } } : prev));
      } else {
        await recapDocumentsApi.remove(weekEditTarget.week.id);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, recapDocumentUrl: null, recapDocumentName: null } } : prev));
      }
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
    } catch (error) {
      setRecapDocError(error instanceof Error ? error.message : 'The recap document could not be saved.');
    } finally {
      setRecapDocUploading(false);
    }
  };

  // Teen recap document saves straight away, like the adult one.
  const handleTeenRecapDocument = async (file: File | null) => {
    if (!weekEditTarget) return;
    setTeenDocUploading(true);
    setTeenDocError('');
    try {
      if (file) {
        const { url, name } = await teenRecapDocumentsApi.upload(weekEditTarget.week.id, file);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, teenRecapDocumentUrl: url, teenRecapDocumentName: name } } : prev));
      } else {
        await teenRecapDocumentsApi.remove(weekEditTarget.week.id);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, teenRecapDocumentUrl: null, teenRecapDocumentName: null } } : prev));
      }
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
    } catch (error) {
      setTeenDocError(error instanceof Error ? error.message : 'The teen recap document could not be saved.');
    } finally {
      setTeenDocUploading(false);
    }
  };

  const handleAiDraft = async () => {
    if (!weekEditTarget) return;
    setAiDrafting(true);
    setAiError('');
    try {
      const draft = await aiApi.draftRecap(weekTitleDraft.trim() || weekEditTarget.week.title || '', aiNotes);
      setRecapSummaryDraft(draft.summary);
      if (draft.prompt) setDiscussionPromptDraft(draft.prompt);
      setAiNotesOpen(false);
      setAiNotes('');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI help is not available right now.');
    } finally {
      setAiDrafting(false);
    }
  };

  const handleSaveWeekTitle = async () => {
    if (!weekEditTarget) return;
    if (teenReleaseMode === 'time' && !teenReleaseDraft) {
      setRecapAudience('teens');
      setTeenDocError('Pick a release time for the Teen recap, or choose "As soon as it is uploaded".');
      return;
    }
    setWeekActionPending(true);
    setStatus('');
    try {
      await weeksApi.update(weekEditTarget.week.id, {
        title: weekTitleDraft.trim() || null,
        recapSummary: recapSummaryDraft.trim() || null,
        discussionPrompt: discussionPromptDraft.trim() || null,
        shareWithParticipants: shareWithParticipantsDraft,
        expectations: expectationsDraft.split('\n').map((line) => line.trim()).filter(Boolean).join('\n') || null,
        manualSummary: manualSummaryDraft.trim() || null,
        classGraphicUrl: classGraphicDraft,
        teacherName: teacherNameDraft.trim() || null,
        teacherRole: teacherNameDraft.trim() ? teacherRoleDraft.trim() || null : null,
        teacherBio: teacherNameDraft.trim() ? teacherBioDraft.trim() || null : null,
        teacherPhotoUrl: teacherNameDraft.trim() ? teacherPhotoDraft : null,
        manualDiscussionPrompt: manualDiscussionPromptDraft.trim() || null,
        teenRecapSummary: teenSummaryDraft.trim() || null,
        teenDiscussionPrompt: teenPromptDraft.trim() || null,
        teenRecapReleaseAt: teenReleaseMode === 'time' ? isoFromLagosInput(teenReleaseDraft) : null,
      });
      // Pictures that were replaced or removed are no longer used: tidy them away (best effort).
      const oldWeek = weekEditTarget.week;
      const finalPhoto = teacherNameDraft.trim() ? teacherPhotoDraft : null;
      keptUploads.current = new Set([classGraphicDraft, finalPhoto].filter((u): u is string => !!u));
      if (oldWeek.classGraphicUrl && oldWeek.classGraphicUrl !== classGraphicDraft) void removeClassImage(oldWeek.classGraphicUrl);
      if (oldWeek.teacherPhotoUrl && oldWeek.teacherPhotoUrl !== finalPhoto) void removeClassImage(oldWeek.teacherPhotoUrl);
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) {
        await reloadWeeks();
      }
      setWeekEditTarget(null);
      setWeekTitleDraft('');
      setRecapSummaryDraft('');
      setDiscussionPromptDraft('');
      setStatus(`Week ${weekEditTarget.week.weekNumber} updated.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update the week.');
    } finally {
      setWeekActionPending(false);
    }
  };

  // Releases this week's recap to participants right away, ahead of the
  // configured participant time. Only affects participants -- supports still
  // get it at their own configured time regardless.
  const handleSendNow = async () => {
    if (!weekEditTarget) return;
    setSendingNow(true);
    setStatus('');
    try {
      const { week } = await weeksApi.update(weekEditTarget.week.id, { participantReleasedEarlyAt: new Date().toISOString() });
      setWeekEditTarget((prev) => (prev ? { ...prev, week } : prev));
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
      setStatus(`Week ${weekEditTarget.week.weekNumber}'s recap was sent to participants now.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send the recap now.');
    } finally {
      setSendingNow(false);
    }
  };

  // A class picture uploads as soon as it is picked; it only becomes part of the week when the editor is saved.
  const handleClassImage = async (kind: 'graphic' | 'teacher', file: File) => {
    if (!weekEditTarget) return;
    const weekId = weekEditTarget.week.id;
    setClassImageBusy(kind);
    setClassImageError('');
    try {
      const url = await uploadClassImage(weekEditTarget.cohortId, weekId, kind, file);
      // The editor may have moved to another week (or closed) while this was uploading: drop the picture then.
      if (editedWeekId.current !== weekId) { void removeClassImage(url); return; }
      sessionUploads.current.push(url);
      if (kind === 'graphic') setClassGraphicDraft(url); else setTeacherPhotoDraft(url);
    } catch (error) {
      setClassImageError(error instanceof Error ? error.message : 'Could not upload that picture.');
    } finally {
      setClassImageBusy(null);
    }
  };

  const handleManualDocument = async (file: File | null) => {
    if (!weekEditTarget) return;
    setManualDocUploading(true);
    setManualDocError('');
    try {
      if (file) {
        const { url, name } = await manualDocumentsApi.upload(weekEditTarget.week.id, file);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, manualDocumentUrl: url, manualDocumentName: name } } : prev));
      } else {
        await manualDocumentsApi.remove(weekEditTarget.week.id);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, manualDocumentUrl: null, manualDocumentName: null } } : prev));
      }
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
    } catch (error) {
      setManualDocError(error instanceof Error ? error.message : 'The manual document could not be saved.');
    } finally {
      setManualDocUploading(false);
    }
  };

  const handleManualAiDraft = async () => {
    if (!weekEditTarget) return;
    setManualAiDrafting(true);
    setManualAiError('');
    try {
      const draft = await aiApi.draftRecap(weekTitleDraft.trim() || weekEditTarget.week.title || '', manualAiNotes);
      setManualSummaryDraft(draft.summary);
      if (draft.prompt) setManualDiscussionPromptDraft(draft.prompt);
      setManualAiOpen(false);
      setManualAiNotes('');
    } catch (error) {
      setManualAiError(error instanceof Error ? error.message : 'AI help is not available right now.');
    } finally {
      setManualAiDrafting(false);
    }
  };

  // Releases this week's manual to supports and participants right away,
  // ahead of the configured manual time. Unlike recap's send-now, this
  // affects both audiences -- they share one manual release time.
  const handleSendManualNow = async () => {
    if (!weekEditTarget) return;
    setSendingManualNow(true);
    setStatus('');
    try {
      const { week } = await weeksApi.update(weekEditTarget.week.id, { manualReleasedEarlyAt: new Date().toISOString() });
      setWeekEditTarget((prev) => (prev ? { ...prev, week } : prev));
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
      setStatus(`Week ${weekEditTarget.week.weekNumber}'s manual was sent now.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send the manual now.');
    } finally {
      setSendingManualNow(false);
    }
  };

  const openEarlierPicker = async (field: 'manual' | 'recap' | 'teen') => {
    if (!weekEditTarget) return;
    setEarlierPicker(field);
    setEarlierDocsLoading(true);
    setEarlierDocsError('');
    try {
      const { documents } = await earlierClassDocumentsApi.getAll(weekEditTarget.cohortId);
      setEarlierDocs(documents);
    } catch (error) {
      setEarlierDocsError(error instanceof Error ? error.message : 'Could not load earlier files.');
    } finally {
      setEarlierDocsLoading(false);
    }
  };

  const chooseEarlierDocument = async (doc: EarlierClassDocument) => {
    if (!weekEditTarget || !earlierPicker) return;
    if (earlierPicker === 'manual') {
      setManualDocUploading(true);
      try {
        await manualDocumentsApi.choose(weekEditTarget.week.id, doc.url, doc.name);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, manualDocumentUrl: doc.url, manualDocumentName: doc.name } } : prev));
        await syncCohortWeeks(weekEditTarget.cohortId);
        if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
      } catch (error) {
        setManualDocError(error instanceof Error ? error.message : 'Could not attach that file.');
      } finally {
        setManualDocUploading(false);
      }
    } else if (earlierPicker === 'teen') {
      setTeenDocUploading(true);
      try {
        await teenRecapDocumentsApi.choose(weekEditTarget.week.id, doc.url, doc.name);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, teenRecapDocumentUrl: doc.url, teenRecapDocumentName: doc.name } } : prev));
        await syncCohortWeeks(weekEditTarget.cohortId);
        if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
      } catch (error) {
        setTeenDocError(error instanceof Error ? error.message : 'Could not attach that file.');
      } finally {
        setTeenDocUploading(false);
      }
    } else {
      setRecapDocUploading(true);
      try {
        await recapDocumentsApi.choose(weekEditTarget.week.id, doc.url, doc.name);
        setWeekEditTarget((prev) => (prev ? { ...prev, week: { ...prev.week, recapDocumentUrl: doc.url, recapDocumentName: doc.name } } : prev));
        await syncCohortWeeks(weekEditTarget.cohortId);
        if (activeCohort?.id === weekEditTarget.cohortId) await reloadWeeks();
      } catch (error) {
        setRecapDocError(error instanceof Error ? error.message : 'Could not attach that file.');
      } finally {
        setRecapDocUploading(false);
      }
    }
    setEarlierPicker(null);
  };

  const handleArchiveToggle = async (cohort: Cohort) => {
    setStatus('');
    try {
      await cohortsApi.update(cohort.id, {
        status: cohort.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED',
      });
      await reloadCohorts();
      setStatus(
        cohort.status === 'ARCHIVED'
          ? `${cohort.name} is active again.`
          : `${cohort.name} was archived. It will stay hidden unless archived cohorts are shown.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update cohort status.');
    }
  };

  const handleCompletedToggle = async (cohort: Cohort) => {
    setStatus('');
    const completing = cohort.status !== 'COMPLETED';
    try {
      await cohortsApi.update(cohort.id, { status: completing ? 'COMPLETED' : 'ACTIVE' });
      await reloadCohorts();
      setStatus(completing
        ? `${cohort.name} is marked completed. Reminders stop and the dashboard shows its final summary.`
        : `${cohort.name} is running again.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update cohort status.');
    }
  };

  const handleDeleteCohort = async () => {
    if (!cohortToDelete) return;
    const remainingCohorts = cohorts.filter((cohort) => cohort.id !== cohortToDelete.id);
    if (remainingCohorts.length === 0) {
      setStatus('At least one cohort must remain in the workspace.');
      return;
    }

    const fallbackCohort = remainingCohorts.find((cohort) => cohort.status !== 'ARCHIVED') || remainingCohorts[0];

    setDeletingCohort(true);
    setStatus('');
    try {
      await cohortsApi.delete(cohortToDelete.id);
      await reloadCohorts();
      if (activeCohort?.id === cohortToDelete.id && fallbackCohort) {
        await setActiveCohort(fallbackCohort.id);
        await reloadWeeks();
      }
      setDeleteOpen(false);
      setCohortToDelete(null);
      setStatus(`${cohortToDelete.name} was permanently deleted.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete cohort.');
    } finally {
      setDeletingCohort(false);
    }
  };

  const canDeleteSelectedCohort = !!cohortToDelete && cohorts.length > 1;

  const headerAction = (
    <button
      type="button"
      onClick={openCreateModal}
      className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
    >
      New Cohort
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Cohorts"
        subtitle="See the active cohort, archive old ones, and only delete when you really mean it."
        action={headerAction}
      />

      {status && (
        <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-gray-700">
          {status}
        </div>
      )}

      {activeCohort && (
        <section className="surface-card mb-6 overflow-hidden">
          <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50/70 via-white to-white px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Current Cohort</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold text-gray-900">{activeCohort.name}</h2>
                  {activeCohort.status === 'COMPLETED' && <CohortStatusPill status="COMPLETED" />}
                </div>
                <p className="mt-1 text-sm text-gray-500">{activeCohort.description || 'No cohort description yet.'}</p>
                <p className="mt-1 text-sm text-gray-500">{activeCohort.venue ? `Venue: ${activeCohort.venue}` : 'Venue not set yet.'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {weekCounts[activeCohort.id] || 0} weeks
                </span>
                {activeSummary && (
                  <>
                    <span className="rounded-full bg-sky-100/80 px-3 py-1.5 text-xs font-semibold text-sky-700">
                      {activeSummary.groups} groups
                    </span>
                    <span className="rounded-full bg-indigo-100/80 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                      {activeSummary.hubs} hubs
                    </span>
                    <span className="rounded-full bg-emerald-100/80 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                      {activeSummary.supports} supports
                    </span>
                    <span className="rounded-full bg-amber-100/80 px-3 py-1.5 text-xs font-semibold text-amber-700">
                      {activeSummary.participants} participants
                    </span>
                  </>
                )}
                <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700">
                  {formatDateRange(activeCohort.startDate, activeCohort.endDate)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[0.85fr_minmax(0,1.5fr)_0.7fr_auto]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Window</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{formatDateRange(activeCohort.startDate, activeCohort.endDate)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Weeks</p>
              <WeekChipRow
                weeks={getCohortWeeks(activeCohort.id)}
                disabled={weekActionPending}
                onAdd={(weekNumber) => openAddWeekModal(activeCohort.id, weekNumber)}
                onDelete={(week) => openDeleteWeekModal(activeCohort.id, week)}
                onEdit={(week) => openEditWeekModal(activeCohort.id, week)}
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Venue</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{activeCohort.venue || 'Not set'}</p>
            </div>
            <div className="flex items-center justify-end">
              <AppOverflowMenu
                align="right"
                items={[
                  { label: activeCohort.status === 'COMPLETED' ? 'Reopen cohort' : 'Mark completed', onClick: () => void handleCompletedToggle(activeCohort) },
                  { label: activeCohort.status === 'ARCHIVED' ? 'Unarchive' : 'Archive', onClick: () => void handleArchiveToggle(activeCohort) },
                  { label: 'Details', onClick: () => openDetailsModal(activeCohort) },
                  { label: 'Members', onClick: () => openMembersModal(activeCohort) },
                  { label: 'Delete', onClick: () => openDeleteModal(activeCohort), tone: 'danger' },
                ]}
              />
            </div>
          </div>
        </section>
      )}

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 px-5 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Older Cohorts</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">Cohort table</h2>
            <p className="mt-1 text-sm text-gray-500">Previous and parallel cohorts stay visible here in chronological order. Archived cohorts stay tucked away unless you ask to see them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArchived((prev) => !prev)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                showArchived
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {showArchived ? 'Hide Archived' : `Show Archived${archivedOlderCohortCount ? ` (${archivedOlderCohortCount})` : ''}`}
            </button>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {olderCohorts.length} visible
            </span>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_auto] gap-4 border-b border-orange-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            <span>Cohort</span>
            <span>Window</span>
            <span>Weeks</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {olderCohorts.map((cohort) => (
            <div key={cohort.id} className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_auto] gap-4 border-b border-orange-100 px-5 py-4 last:border-b-0">
              <div>
                <p className="text-sm font-semibold text-gray-900">{cohort.name}</p>
                <p className="mt-1 text-xs text-gray-500">{cohort.description || 'No cohort description yet.'}</p>
                {cohort.venue && <p className="mt-1 text-xs text-gray-500">{cohort.venue}</p>}
              </div>
              <div className="text-sm text-gray-600">{formatDateRange(cohort.startDate, cohort.endDate)}</div>
              <div className="text-sm font-semibold text-gray-900">{weekCounts[cohort.id] || 0}</div>
              <div>
                <CohortStatusPill status={cohort.status} />
              </div>
              <div className="flex items-center justify-end">
                <AppOverflowMenu
                  align="right"
                  items={[
                    { label: 'Set active', onClick: () => void setActiveCohort(cohort.id) },
                    { label: 'Details', onClick: () => openDetailsModal(cohort) },
                    { label: 'Members', onClick: () => openMembersModal(cohort) },
                    { label: cohort.status === 'COMPLETED' ? 'Reopen cohort' : 'Mark completed', onClick: () => void handleCompletedToggle(cohort) },
                    { label: cohort.status === 'ARCHIVED' ? 'Unarchive' : 'Archive', onClick: () => void handleArchiveToggle(cohort) },
                    { label: 'Delete', onClick: () => openDeleteModal(cohort), tone: 'danger' },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 p-4 lg:hidden">
          {olderCohorts.map((cohort) => (
            <article key={cohort.id} className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-gray-900">{cohort.name}</p>
                  <p className="mt-1 text-sm text-gray-500">{cohort.description || 'No cohort description yet.'}</p>
                  {cohort.venue && <p className="mt-1 text-sm text-gray-500">{cohort.venue}</p>}
                </div>
                <CohortStatusPill status={cohort.status} />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-gray-600">
                <p><span className="font-semibold text-gray-900">Window:</span> {formatDateRange(cohort.startDate, cohort.endDate)}</p>
                <p><span className="font-semibold text-gray-900">Venue:</span> {cohort.venue || 'Not set'}</p>
                <p><span className="font-semibold text-gray-900">Weeks:</span> {weekCounts[cohort.id] || 0}</p>
              </div>
              <div className="mt-3 flex items-center justify-end">
                <AppOverflowMenu
                  align="right"
                  items={[
                    { label: 'Set active', onClick: () => void setActiveCohort(cohort.id) },
                    { label: 'Details', onClick: () => openDetailsModal(cohort) },
                    { label: 'Members', onClick: () => openMembersModal(cohort) },
                    { label: cohort.status === 'COMPLETED' ? 'Reopen cohort' : 'Mark completed', onClick: () => void handleCompletedToggle(cohort) },
                    { label: cohort.status === 'ARCHIVED' ? 'Unarchive' : 'Archive', onClick: () => void handleArchiveToggle(cohort) },
                    { label: 'Delete', onClick: () => openDeleteModal(cohort), tone: 'danger' },
                  ]}
                />
              </div>
            </article>
          ))}
          {olderCohorts.length === 0 && (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-orange-50/50 px-4 py-10 text-center text-sm text-gray-500">
              {archivedOlderCohortCount > 0 && !showArchived ? 'No visible older cohorts. Turn on archived cohorts to review them.' : 'No older cohorts yet.'}
            </div>
          )}
        </div>
      </section>

      <ModalShell
        isOpen={createOpen}
        title="New cohort"
        subtitle={activeCohort ? `This will copy ${activeCohort.name} and set up a default 9-week window.` : 'Copy the current active cohort into a new independent one.'}
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateCohort} className="space-y-4">
          <input
            type="text"
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Cohort name"
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            required
          />
          <textarea
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Short cohort description"
            rows={3}
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="text"
            value={createForm.venue}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, venue: event.target.value }))}
            placeholder="Venue"
            className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Start</span>
              <input
                type="date"
                value={createForm.startDate}
                onChange={(event) => updateStartDate(setCreateForm, event.target.value, createForm.weekCount)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Weeks</span>
              <input
                type="number"
                min={1}
                max={52}
                value={createForm.weekCount}
                onChange={(event) => {
                  const wc = Math.max(1, parseInt(event.target.value, 10) || 1);
                  setCreateForm((prev) => ({
                    ...prev,
                    weekCount: wc,
                    endDate: prev.startDate ? getAutoEndDate(prev.startDate, wc) : '',
                  }));
                }}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">End (auto)</span>
              <input
                type="date"
                value={createForm.endDate}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-gray-600">
            End date is auto-calculated from the start date and week count, but you can override it.
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!activeCohort || savingCreate}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {savingCreate ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Creating...</span>) : 'Create Cohort'}
            </button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        isOpen={detailsOpen}
        title="Cohort details"
        subtitle="Switch focus, see the week count, and manage the cohort."
        onClose={() => setDetailsOpen(false)}
      >
        <div className="space-y-4">
          <div className="rounded-3xl border border-orange-100 bg-orange-50/40 p-4">
            <AppSelect
              value={selectedCohortId}
              onChange={setSelectedCohortId}
              options={cohortOptions}
              placeholder="Choose cohort"
              label="Selected Cohort"
            />
            {selectedCohort && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Weeks</p>
                <WeekChipRow
                  weeks={getCohortWeeks(selectedCohort.id)}
                  disabled={weekActionPending}
                  onAdd={(weekNumber) => openAddWeekModal(selectedCohort.id, weekNumber)}
                  onDelete={(week) => openDeleteWeekModal(selectedCohort.id, week)}
                  onEdit={(week) => openEditWeekModal(selectedCohort.id, week)}
                />
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => selectedCohortId && void setActiveCohort(selectedCohortId)}
                  className="rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  Switch Active Cohort
                </button>
                <button
                  type="button"
                  onClick={() => selectedCohort && void handleArchiveToggle(selectedCohort)}
                  disabled={!selectedCohort}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {selectedCohort?.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => selectedCohort && openDeleteModal(selectedCohort)}
                  disabled={!selectedCohort}
                  className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Delete Cohort
                </button>
            </div>
          </div>

          <form onSubmit={handleSaveDetails} className="space-y-4">
            <input
              type="text"
              value={detailsForm.name}
              onChange={(event) => setDetailsForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Cohort name"
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              required
            />
            <textarea
              value={detailsForm.description}
              onChange={(event) => setDetailsForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Description"
              rows={3}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={detailsForm.venue}
              onChange={(event) => setDetailsForm((prev) => ({ ...prev, venue: event.target.value }))}
              placeholder="Venue"
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Start</span>
                <input
                  type="date"
                  value={detailsForm.startDate}
                  onChange={(event) => updateStartDate(setDetailsForm, event.target.value, detailsForm.weekCount)}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">End</span>
                <input
                  type="date"
                  value={detailsForm.endDate}
                  onChange={(event) => setDetailsForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={savingDetails}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {savingDetails ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving...</span>) : 'Save Details'}
              </button>
            </div>
          </form>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={membersOpen}
        title="Support members"
        subtitle={selectedCohort ? `Toggle who has access to ${selectedCohort.name}.` : 'Assign support users to the selected cohort.'}
        onClose={() => setMembersOpen(false)}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <input
              type="search"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search by name, phone or email"
              className="min-h-[48px] w-full rounded-xl border border-gray-200 px-3.5 py-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {sortedSupportUsers.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-gray-500">
                  {visibleSupportUsers.filter((user) => memberIds.includes(user.id)).length} of {visibleSupportUsers.length} on
                </p>
                <button
                  type="button"
                  onClick={toggleAllVisibleMembers}
                  disabled={visibleSupportUsers.length === 0}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {allVisibleMembersOn ? 'Turn all off' : 'Turn all on'}
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {visibleSupportUsers.length === 0 && (
              <p className="rounded-2xl border border-dashed border-orange-200 py-8 text-center text-sm text-gray-500">
                {memberSearch.trim() ? `No supports match '${memberSearch.trim()}'.` : 'No support users found.'}
              </p>
            )}
            {visibleSupportUsers.map((member) => {
              const enabled = memberIds.includes(member.id);
              return (
                <div key={member.id} className="flex items-center justify-between rounded-2xl border border-orange-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{member.name}</p>
                    <p className="truncate text-xs text-gray-500">{member.email || member.phone || 'No contact value'}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={() => setMemberIds((prev) => (
                      prev.includes(member.id) ? prev.filter((id) => id !== member.id) : [...prev, member.id]
                    ))}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
                      enabled ? 'bg-primary' : 'bg-slate-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        enabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMembersOpen(false)}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveMembers()}
              disabled={savingMembers}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {savingMembers ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving...</span>) : 'Save Members'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={!!weekAddTarget}
        title={weekAddTarget ? `Add Week ${weekAddTarget.weekNumber}` : 'Add week'}
        subtitle="Start with seven blank days or duplicate an existing week."
        onClose={() => {
          if (weekActionPending) return;
          setWeekAddTarget(null);
        }}
      >
        <div className="space-y-4">
          <AppSelect
            value={addWeekChoice}
            onChange={setAddWeekChoice}
            options={[
              { value: 'blank', label: 'Start blank', meta: 'Create the week with empty Sunday-Saturday days' },
              ...(weekAddTarget ? [...getCohortWeeks(weekAddTarget.cohortId)]
                .sort((a, b) => a.weekNumber - b.weekNumber)
                .map((week) => ({
                  value: String(week.id),
                  label: `Duplicate Week ${week.weekNumber}`,
                  meta: `${week.days.reduce((total, day) => total + day.activities.length, 0)} activities`,
                })) : []),
            ]}
            placeholder="Choose how to create this week"
            label="Week setup"
          />

          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-gray-600">
            Duplicating copies days, activities, order, periods, and activity tags into the new week.
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setWeekAddTarget(null)}
              disabled={weekActionPending}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAddWeek()}
              disabled={weekActionPending}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {weekActionPending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Adding...</span>) : 'Add Week'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={!!weekDeleteTarget}
        title={weekDeleteTarget ? `Delete Week ${weekDeleteTarget.weekNumber}?` : 'Delete week?'}
        subtitle="This removes its days and activities. This cannot be undone."
        onClose={() => {
          if (weekActionPending) return;
          setWeekDeleteTarget(null);
        }}
      >
        <div className="space-y-4">
          <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-4 text-sm text-rose-700">
            Delete Week {weekDeleteTarget?.weekNumber}? This removes its days and activities. This cannot be undone.
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setWeekDeleteTarget(null)}
              disabled={weekActionPending}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteWeek()}
              disabled={weekActionPending}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {weekActionPending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Deleting...</span>) : 'Delete Week'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={!!weekEditTarget}
        title={weekEditTarget ? `Week ${weekEditTarget.week.weekNumber}` : 'Week'}
        subtitle="Class manual, recap, and what participants see."
        onClose={() => {
          if (weekActionPending) return;
          setWeekEditTarget(null);
          setWeekTitleDraft('');
          setRecapSummaryDraft('');
          setDiscussionPromptDraft('');
        }}
        footer={(
          <>
            <button
              type="button"
              onClick={() => {
                setWeekEditTarget(null);
                setWeekTitleDraft('');
                setRecapSummaryDraft('');
                setDiscussionPromptDraft('');
              }}
              disabled={weekActionPending}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveWeekTitle()}
              disabled={weekActionPending}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {weekActionPending ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving...</span>) : 'Save week'}
            </button>
          </>
        )}
      >
        {(() => {
          const week = weekEditTarget?.week;
          const manualDone = !!week?.manualDocumentUrl;
          const recapDone = !!(week?.recapDocumentUrl || recapSummaryDraft.trim());
          const teenRecapDone = !!(week?.teenRecapDocumentUrl || week?.teenRecapSummary?.trim() || week?.teenDiscussionPrompt?.trim());
          const manualReleaseLabel = `${formatDayTime(recapReleaseTimes.manualDay, recapReleaseTimes.manualTime)} in Week ${week?.weekNumber ?? ''} of the cohort`;
          const nextLine = !manualDone
            ? `Next: upload the manual · goes out ${manualReleaseLabel}`
            : !recapDone
            ? 'Next: add the recap'
            : 'All set';
          return (
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={weekTitleDraft}
                  onChange={(event) => setWeekTitleDraft(event.target.value)}
                  placeholder="e.g. Faith"
                  maxLength={60}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-base font-semibold focus:border-primary focus:outline-none"
                />
                <p className="mt-1.5 text-xs font-semibold text-gray-500">{nextLine}</p>
              </div>

              {/* Class card: what participants see on the home page for the next class */}
              <div className="rounded-2xl border border-orange-100 p-4">
                <p className="text-sm font-bold text-gray-900">Class card</p>
                <p className="mt-0.5 text-xs text-gray-500">Shown to participants on the home page before this class. Everything here is optional; leave it empty and the card stays plain.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Class graphic</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-16 w-24 flex-none overflow-hidden rounded-xl bg-neutral-100">
                        {classGraphicDraft && <img src={classGraphicDraft} alt="Class graphic" className="h-full w-full object-cover" />}
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <label className="cursor-pointer rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                          {classImageBusy === 'graphic' ? 'Uploading…' : classGraphicDraft ? 'Replace' : 'Add graphic'}
                          <input type="file" accept="image/*" className="hidden" disabled={classImageBusy !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleClassImage('graphic', file); }} />
                        </label>
                        {classGraphicDraft && <button type="button" onClick={() => setClassGraphicDraft(null)} className="text-xs font-semibold text-red-600">Remove</button>}
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600">Teacher photo</p>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="h-16 w-16 flex-none overflow-hidden rounded-full bg-neutral-100">
                        {teacherPhotoDraft && <img src={teacherPhotoDraft} alt="Teacher" className="h-full w-full object-cover" />}
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <label className="cursor-pointer rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                          {classImageBusy === 'teacher' ? 'Uploading…' : teacherPhotoDraft ? 'Replace' : 'Add photo'}
                          <input type="file" accept="image/*" className="hidden" disabled={classImageBusy !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleClassImage('teacher', file); }} />
                        </label>
                        {teacherPhotoDraft && <button type="button" onClick={() => setTeacherPhotoDraft(null)} className="text-xs font-semibold text-red-600">Remove</button>}
                      </div>
                    </div>
                  </div>
                </div>
                {classImageError && <p className="mt-2 text-xs font-semibold text-red-600">{classImageError}</p>}
                <div className="mt-3 space-y-2">
                  <input type="text" value={teacherNameDraft} onChange={(event) => setTeacherNameDraft(event.target.value)} placeholder="Teacher's name" maxLength={60} className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                  <input type="text" value={teacherRoleDraft} onChange={(event) => setTeacherRoleDraft(event.target.value)} placeholder="Role or title (optional)" maxLength={80} className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                  <textarea value={teacherBioDraft} onChange={(event) => setTeacherBioDraft(event.target.value)} placeholder="Two or three lines about them (optional)" rows={3} maxLength={320} className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none" />
                  <p className="text-[11px] text-gray-500">The photo and bio only show once a name is added.</p>
                </div>
              </div>

              {/* ① Class manual */}
              <div className="rounded-2xl border border-orange-100 p-4">
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold ${manualDone ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                    {manualDone ? '✓' : '1'}
                  </span>
                  <p className="text-sm font-bold text-gray-900">Class manual</p>
                  <span className="ml-auto text-right text-[11px] font-semibold text-gray-500">Goes out {manualReleaseLabel}</span>
                </div>
                <p className="ml-[34px] mt-0.5 text-xs text-gray-500">{manualDone ? 'Document attached' : 'No document yet'}</p>

                <div className="mt-3">
                  {week?.manualDocumentUrl ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-red-50 text-[10px] font-bold text-red-600">PDF</span>
                      <a href={week.manualDocumentUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 hover:text-primary">
                        {week.manualDocumentName || 'Class manual'}
                      </a>
                      <label className={`flex-none cursor-pointer text-xs font-semibold text-primary ${manualDocUploading ? 'pointer-events-none opacity-50' : ''}`}>
                        Replace
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleManualDocument(file); }} />
                      </label>
                      <button type="button" onClick={() => void handleManualDocument(null)} disabled={manualDocUploading} className="flex-none text-xs font-semibold text-red-700 disabled:opacity-50">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-4 text-sm font-semibold text-gray-600 hover:border-primary hover:text-primary ${manualDocUploading ? 'pointer-events-none opacity-50' : ''}`}>
                        {manualDocUploading ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Uploading…</span>) : 'Upload PDF'}
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleManualDocument(file); }} />
                      </label>
                      <button type="button" onClick={() => void openEarlierPicker('manual')} disabled={manualDocUploading} className="flex-none rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        Choose earlier file
                      </button>
                    </div>
                  )}
                  {manualDocError && <p className="mt-1.5 text-xs text-red-700">{manualDocError}</p>}
                </div>

                <EarlierFilePicker
                  open={earlierPicker === 'manual'}
                  docs={earlierDocs}
                  loading={earlierDocsLoading}
                  error={earlierDocsError}
                  onChoose={(doc) => void chooseEarlierDocument(doc)}
                  onCancel={() => setEarlierPicker(null)}
                />

                <button type="button" onClick={() => setManualAiOpen((open) => !open)} className="mt-3 text-xs font-semibold text-primary">
                  {manualAiOpen ? 'Close' : 'Write with AI'}
                </button>
                {manualAiOpen && (
                  <div className="mt-2 space-y-3">
                    <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-3">
                      <textarea
                        value={manualAiNotes}
                        onChange={(event) => { setManualAiNotes(event.target.value); setManualAiError(''); }}
                        placeholder="Paste the manual text. The AI writes a short summary and a discussion prompt for you to check and edit."
                        rows={4}
                        className="w-full resize-y rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm focus:border-primary focus:outline-none"
                      />
                      {manualAiError && <p className="mt-1.5 text-xs text-red-700">{manualAiError}</p>}
                      <div className="mt-2 flex items-center gap-3">
                        <p className="text-[11px] text-gray-500">Sent to a free AI service (OpenRouter). Check before saving.</p>
                        <button type="button" onClick={() => { void handleManualAiDraft(); }} disabled={manualAiDrafting || manualAiNotes.trim().length < 40} className="ml-auto flex-none rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                          {manualAiDrafting ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Drafting…</span>) : 'Draft with AI'}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={manualSummaryDraft}
                      onChange={(event) => setManualSummaryDraft(event.target.value)}
                      placeholder="A short summary of the manual (optional)."
                      rows={3}
                      className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                    />
                    <textarea
                      value={manualDiscussionPromptDraft}
                      onChange={(event) => setManualDiscussionPromptDraft(event.target.value)}
                      placeholder="A discussion prompt (optional)."
                      rows={2}
                      className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* ② Recap */}
              <div className="rounded-2xl border border-orange-100 p-4">
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold ${recapDone ? 'bg-emerald-100/80 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                    {recapDone ? '✓' : '2'}
                  </span>
                  <p className="text-sm font-bold text-gray-900">Recap</p>
                </div>
                <p className="ml-[34px] mt-0.5 text-xs text-gray-500">{recapDone ? 'Recap ready' : 'No recap yet'}</p>
                <div className="mt-2.5">
                  <SegmentedTabs
                    tabs={[{ key: 'adults', label: 'Adults' }, { key: 'teens', label: teenRecapDone ? 'Teens ✓' : 'Teens' }]}
                    active={recapAudience}
                    onChange={(key) => { setRecapAudience(key as 'adults' | 'teens'); setEarlierPicker(null); }}
                  />
                </div>
                {recapAudience === 'adults' && (
                  <>

                <div className="mt-3">
                  {week?.recapDocumentUrl ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-red-50 text-[10px] font-bold text-red-600">PDF</span>
                      <a href={week.recapDocumentUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 hover:text-primary">
                        {week.recapDocumentName || 'Recap document'}
                      </a>
                      <label className={`flex-none cursor-pointer text-xs font-semibold text-primary ${recapDocUploading ? 'pointer-events-none opacity-50' : ''}`}>
                        Replace
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleRecapDocument(file); }} />
                      </label>
                      <button type="button" onClick={() => void handleRecapDocument(null)} disabled={recapDocUploading} className="flex-none text-xs font-semibold text-red-700 disabled:opacity-50">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-4 text-sm font-semibold text-gray-600 hover:border-primary hover:text-primary ${recapDocUploading ? 'pointer-events-none opacity-50' : ''}`}>
                        {recapDocUploading ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Uploading…</span>) : 'Upload PDF'}
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleRecapDocument(file); }} />
                      </label>
                      <button type="button" onClick={() => void openEarlierPicker('recap')} disabled={recapDocUploading} className="flex-none rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                        Choose earlier file
                      </button>
                    </div>
                  )}
                  {recapDocError && <p className="mt-1.5 text-xs text-red-700">{recapDocError}</p>}
                </div>

                <EarlierFilePicker
                  open={earlierPicker === 'recap'}
                  docs={earlierDocs}
                  loading={earlierDocsLoading}
                  error={earlierDocsError}
                  onChoose={(doc) => void chooseEarlierDocument(doc)}
                  onCancel={() => setEarlierPicker(null)}
                />

                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-3">
                    <button type="button" onClick={() => setAiNotesOpen((open) => !open)} className="text-xs font-semibold text-primary">
                      {aiNotesOpen ? 'Close' : 'Draft with AI'}
                    </button>
                  </div>
                  {aiNotesOpen && (
                    <div className="mb-3 rounded-2xl border border-orange-100 bg-orange-50/40 p-3">
                      <textarea
                        value={aiNotes}
                        onChange={(event) => { setAiNotes(event.target.value); setAiError(''); }}
                        placeholder="Paste the class notes. The AI writes a short recap summary and a discussion prompt for you to check and edit."
                        rows={5}
                        className="w-full resize-y rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm focus:border-primary focus:outline-none"
                      />
                      {aiError && <p className="mt-1.5 text-xs text-red-700">{aiError}</p>}
                      <div className="mt-2 flex items-center gap-3">
                        <p className="text-[11px] text-gray-500">Sent to a free AI service (OpenRouter). Check the result before saving.</p>
                        <button type="button" onClick={() => { void handleAiDraft(); }} disabled={aiDrafting || aiNotes.trim().length < 40} className="ml-auto flex-none rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
                          {aiDrafting ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Drafting…</span>) : 'Draft summary and prompt'}
                        </button>
                      </div>
                    </div>
                  )}
                  <textarea
                    value={recapSummaryDraft}
                    onChange={(event) => setRecapSummaryDraft(event.target.value)}
                    placeholder="A short summary of what this week's class covered."
                    rows={3}
                    className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                  <textarea
                    value={discussionPromptDraft}
                    onChange={(event) => setDiscussionPromptDraft(event.target.value)}
                    placeholder="A question or action for the group to talk through."
                    rows={2}
                    className="mt-2 w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                  </>
                )}

                {recapAudience === 'teens' && (
                  <>
                    <div className="mt-3">
                      {week?.teenRecapDocumentUrl ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3">
                          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-pink-50 text-[10px] font-bold text-pink-600">PDF</span>
                          <a href={week.teenRecapDocumentUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 hover:text-primary">
                            {week.teenRecapDocumentName || 'Teen recap document'}
                          </a>
                          <label className={`flex-none cursor-pointer text-xs font-semibold text-primary ${teenDocUploading ? 'pointer-events-none opacity-50' : ''}`}>
                            Replace
                            <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleTeenRecapDocument(file); }} />
                          </label>
                          <button type="button" onClick={() => void handleTeenRecapDocument(null)} disabled={teenDocUploading} className="flex-none text-xs font-semibold text-red-700 disabled:opacity-50">
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 px-4 py-4 text-sm font-semibold text-gray-600 hover:border-primary hover:text-primary ${teenDocUploading ? 'pointer-events-none opacity-50' : ''}`}>
                            {teenDocUploading ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Uploading…</span>) : 'Upload PDF'}
                            <input type="file" accept=".pdf,image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleTeenRecapDocument(file); }} />
                          </label>
                          <button type="button" onClick={() => void openEarlierPicker('teen')} disabled={teenDocUploading} className="flex-none rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                            Choose earlier file
                          </button>
                        </div>
                      )}
                      {teenDocError && <p className="mt-1.5 text-xs text-red-700">{teenDocError}</p>}
                    </div>

                    <EarlierFilePicker
                      open={earlierPicker === 'teen'}
                      docs={earlierDocs}
                      loading={earlierDocsLoading}
                      error={earlierDocsError}
                      onChoose={(doc) => void chooseEarlierDocument(doc)}
                      onCancel={() => setEarlierPicker(null)}
                    />

                    <div className="mt-3">
                      <textarea
                        value={teenSummaryDraft}
                        onChange={(event) => setTeenSummaryDraft(event.target.value)}
                        placeholder="A short summary of this week's class for the teens (optional if you upload a document)."
                        rows={3}
                        className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                      />
                      <textarea
                        value={teenPromptDraft}
                        onChange={(event) => setTeenPromptDraft(event.target.value)}
                        placeholder="A question or action for the teens to talk through (optional)."
                        rows={2}
                        className="mt-2 w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>

                    <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">When Teen Supports see it</p>
                      <SegmentedTabs
                        className="mt-2"
                        tabs={[{ key: 'now', label: 'As soon as it is uploaded' }, { key: 'time', label: 'Set a time' }]}
                        active={teenReleaseMode}
                        onChange={(key) => setTeenReleaseMode(key as 'now' | 'time')}
                      />
                      {teenReleaseMode === 'time' && (
                        <div className="mt-2">
                          <AppDateTimePicker value={teenReleaseDraft} onChange={setTeenReleaseDraft} placeholder="Pick a day and time (Lagos time)" ariaLabel="Teen recap release time" />
                          {!teenReleaseDraft && <p className="mt-1.5 text-xs text-amber-700">Pick a time, or switch back to "As soon as it is uploaded".</p>}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-gray-500">Teen Supports only. Participants do not see the Teen recap.</p>
                    </div>
                  </>
                )}
              </div>

              {/* ③ Participants */}
              <div className="rounded-2xl border border-orange-100 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-600">3</span>
                  <p className="text-sm font-bold text-gray-900">Participants</p>
                  <InfoTip label="Where participants see these details">
                    The lines below appear in “What&apos;s expected” on the participant Home page, in the “This week” card after the cohort starts. The recap is shared separately using the switch below.
                  </InfoTip>
                </div>
                <p className="ml-[34px] mt-0.5 text-xs text-gray-500">Shown on participant Home</p>

                <div className="mt-3">
                  <textarea
                    value={expectationsDraft}
                    onChange={(event) => setExpectationsDraft(event.target.value)}
                    placeholder={'What\'s expected this week (optional)\nBring your Bible and a journal'}
                    rows={3}
                    className="w-full resize-y rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="mt-1.5 text-xs text-gray-500">One item per line.</p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-orange-100 px-4 py-3">
                  <p className="min-w-0 text-sm font-semibold text-gray-900">Share recap with participants</p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shareWithParticipantsDraft}
                    aria-label="Share recap with participants"
                    onClick={() => setShareWithParticipantsDraft((prev) => !prev)}
                    className={`relative inline-flex h-8 w-14 flex-none items-center rounded-full transition ${shareWithParticipantsDraft ? 'bg-primary' : 'bg-slate-200'}`}
                  >
                    <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${shareWithParticipantsDraft ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>

                {week && (
                  <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">When manual + recap go out</p>
                    <p className="mt-1.5 text-sm text-gray-700">
                      Manual: {week.manualReleasedEarlyAt ? 'sent early' : manualReleaseLabel}
                      {' · '}
                      Recap (supports): {formatRecapReleaseAt(recapReleaseAt(cohorts.find((c) => c.id === weekEditTarget?.cohortId)?.startDate, week, recapReleaseTimes.supportDay, recapReleaseTimes.supportTime))}
                      {' · '}
                      Recap (participants): {week.participantReleasedEarlyAt ? 'sent early' : formatRecapReleaseAt(recapReleaseAt(cohorts.find((c) => c.id === weekEditTarget?.cohortId)?.startDate, week, recapReleaseTimes.participantDay, recapReleaseTimes.participantTime))}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-4">
                      {week.manualReleasedEarlyAt ? (
                        <p className="text-xs text-emerald-700">Manual sent early on {new Date(week.manualReleasedEarlyAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })}.</p>
                      ) : (
                        <button type="button" onClick={() => setManualSendNowConfirmOpen(true)} disabled={weekActionPending || !manualDone} className="text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-50">
                          Send manual now
                        </button>
                      )}
                      {week.participantReleasedEarlyAt ? (
                        <p className="text-xs text-emerald-700">Recap sent early on {new Date(week.participantReleasedEarlyAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' })}.</p>
                      ) : (
                        <button type="button" onClick={() => setSendNowConfirmOpen(true)} disabled={weekActionPending} className="text-xs font-semibold text-primary hover:text-primary-dark disabled:opacity-50">
                          Send recap to participants now
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </ModalShell>

      <ConfirmationModal
        isOpen={manualSendNowConfirmOpen}
        onClose={() => setManualSendNowConfirmOpen(false)}
        onConfirm={() => void handleSendManualNow()}
        title="Send manual now?"
        message={weekEditTarget ? `Week ${weekEditTarget.week.weekNumber}'s class manual will go out to supports and participants immediately, ahead of the usual time.` : ''}
        confirmText={sendingManualNow ? 'Sending...' : 'Send now'}
        confirmLoading={sendingManualNow}
        type="info"
        confirmDisabled={sendingManualNow}
      />

      <ConfirmationModal
        isOpen={sendNowConfirmOpen}
        onClose={() => setSendNowConfirmOpen(false)}
        onConfirm={() => void handleSendNow()}
        title="Send to participants now?"
        message={weekEditTarget ? `Week ${weekEditTarget.week.weekNumber}'s recap will go to participants immediately, ahead of the usual time. Supports are not affected -- they still get it at their own configured time.` : ''}
        confirmText={sendingNow ? 'Sending...' : 'Send now'}
        confirmLoading={sendingNow}
        type="info"
        confirmDisabled={sendingNow}
      />

      <ModalShell
        isOpen={deleteOpen}
        title="Delete Cohort"
        subtitle={cohortToDelete ? `Deleting ${cohortToDelete.name} is permanent. Archive is usually the safer choice.` : 'Delete the selected cohort.'}
        onClose={() => {
          if (deletingCohort) return;
          setDeleteOpen(false);
          setCohortToDelete(null);
        }}
      >
        <div className="space-y-4">
          <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
            <p className="font-semibold">Delete removes live cohort data.</p>
            <p className="mt-2">If you only want this cohort out of the main view, archive it instead. Archived cohorts stay preserved and can be restored later with the archived filter.</p>
          </div>

          <div className="rounded-3xl border border-rose-100 bg-rose-50/50 p-4">
            <p className="text-sm font-semibold text-gray-900">This delete will remove:</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>All weeks, days, and activities inside this cohort</li>
              <li>Support membership assignments tied to this cohort</li>
              <li>Support completion history tied to this cohort’s activities</li>
              <li>Any schedule data that depends on those cohort weeks and activities</li>
            </ul>
            <p className="mt-3 text-sm text-gray-600">
              Sent announcements remain in history, but any direct link back to this cohort will be removed.
            </p>
          </div>

          {!canDeleteSelectedCohort && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-gray-700">
              At least one cohort must remain. Create or keep another cohort before deleting this one.
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (!cohortToDelete) return;
                void handleArchiveToggle(cohortToDelete);
                setDeleteOpen(false);
                setCohortToDelete(null);
              }}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Archive Instead
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(false);
                setCohortToDelete(null);
              }}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteCohort()}
              disabled={!canDeleteSelectedCohort || deletingCohort}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deletingCohort ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Deleting...</span>) : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </ModalShell>

      <NextCohortAssignModal
        isOpen={!!nextCohortPrompt}
        contacts={nextCohortPrompt?.contacts ?? []}
        targetCohortId={nextCohortPrompt?.newCohortId ?? ''}
        targetCohortName={nextCohortPrompt?.newCohortName}
        supports={sortedSupportUsers}
        onClose={() => setNextCohortPrompt(null)}
        onDone={(message) => { setNextCohortPrompt(null); setStatus(message); }}
      />
    </div>
  );
};

const WeekChipRow: React.FC<{
  weeks: Week[];
  disabled?: boolean;
  onAdd: (weekNumber: number) => void;
  onDelete: (week: Week) => void;
  onEdit: (week: Week) => void;
}> = ({ weeks, disabled = false, onAdd, onDelete, onEdit }) => {
  const [expanded, setExpanded] = useState(false);
  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const weekByNumber = new Map(sortedWeeks.map((week) => [week.weekNumber, week]));
  const maxWeekNumber = sortedWeeks.reduce((max, week) => Math.max(max, week.weekNumber), 0);
  const slots = Array.from({ length: maxWeekNumber }, (_, index) => index + 1);
  const canDelete = sortedWeeks.length > 1 && !disabled;

  // Collapsed by default: a single "Weeks (N)" field with an edit pencil that
  // expands the individual week pills for editing.
  if (!expanded) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-flex h-9 items-center rounded-2xl border border-orange-100 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm">
          Weeks ({sortedWeeks.length})
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="grid h-9 w-9 place-items-center rounded-2xl border border-orange-100 bg-white text-gray-500 shadow-sm hover:bg-orange-50 hover:text-primary"
          aria-label="Edit weeks"
          title="Edit weeks"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="inline-flex h-9 items-center gap-1 rounded-2xl border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-primary hover:bg-orange-100"
        title="Collapse weeks"
      >
        Done
      </button>
      {slots.map((weekNumber) => {
        const week = weekByNumber.get(weekNumber);
        if (!week) {
          return (
            <button
              key={`gap-${weekNumber}`}
              type="button"
              onClick={() => onAdd(weekNumber)}
              disabled={disabled}
              className="inline-flex h-9 min-w-[92px] items-center justify-center rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 px-3 text-xs font-semibold text-primary hover:bg-orange-100 disabled:opacity-50"
              title={`Add Week ${weekNumber}`}
            >
              + Week {weekNumber}
            </button>
          );
        }

        return (
          <div
            key={week.id}
            role="button"
            tabIndex={0}
            onClick={() => onEdit(week)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onEdit(week);
              }
            }}
            className="inline-flex h-9 min-w-[112px] cursor-pointer items-center justify-between gap-2 rounded-2xl border border-orange-100 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm hover:bg-orange-50"
            title={`${week.title ? `Week ${week.weekNumber}: ${week.title}` : `Set title for Week ${week.weekNumber}`}${week.recapDocumentUrl ? ' · Recap added' : ''}`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {week.recapDocumentUrl && (
                <span
                  className="grid h-4 w-4 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700"
                  title="Recap added"
                  aria-label="Recap added"
                >
                  <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="m5 13 4 4L19 7" />
                  </svg>
                </span>
              )}
              <span className="min-w-0 truncate text-left">
                {week.title?.trim() ? `W${week.weekNumber}: ${week.title}` : `Week ${week.weekNumber}`}
              </span>
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(week);
              }}
              disabled={!canDelete}
              className="grid h-5 w-5 place-items-center rounded-full text-gray-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={`Delete Week ${week.weekNumber}`}
              title={canDelete ? `Delete Week ${week.weekNumber}` : 'A cohort must keep at least one week'}
            >
              <span aria-hidden="true">x</span>
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onAdd(maxWeekNumber + 1)}
        disabled={disabled}
        className="inline-flex h-9 min-w-[92px] items-center justify-center rounded-2xl border border-primary bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        title={`Add Week ${maxWeekNumber + 1}`}
      >
        + Week {maxWeekNumber + 1}
      </button>
    </div>
  );
};

const ModalShell: React.FC<{
  isOpen: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Actions pinned to the bottom (frosted sticky bar), always reachable on long forms. */
  footer?: React.ReactNode;
}> = ({ isOpen, title, subtitle, onClose, children, footer }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close modal" />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 border-b border-orange-100 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl p-2 text-gray-400 hover:bg-orange-50 hover:text-gray-700"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-6 py-6">{children}</div>
        {footer && (
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-gray-100 bg-white/80 px-6 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] backdrop-blur-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default CohortsPage;

const COHORT_STATUS_META: Record<'ACTIVE' | 'COMPLETED' | 'ARCHIVED', { label: string; cls: string }> = {
  ACTIVE: { label: 'Active', cls: 'bg-emerald-100/80 text-emerald-700' },
  COMPLETED: { label: 'Completed', cls: 'bg-violet-100/80 text-violet-700' },
  ARCHIVED: { label: 'Archived', cls: 'bg-neutral-100 text-neutral-600' },
};

const CohortStatusPill: React.FC<{ status?: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED' }> = ({ status }) => {
  const meta = COHORT_STATUS_META[status ?? 'ACTIVE'];
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>;
};
