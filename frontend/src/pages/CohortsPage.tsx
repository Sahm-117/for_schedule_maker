import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import AppOverflowMenu from '../components/AppOverflowMenu';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { cohortsApi, usersApi, weeksApi, groupsApi, participantsApi } from '../services/api';
import type { Cohort, User, Week } from '../types';
import { sortByText } from '../utils/sort';

type CohortFormState = {
  name: string;
  description: string;
  venue: string;
  startDate: string;
  endDate: string;
};

const emptyForm = (): CohortFormState => ({
  name: '',
  description: '',
  venue: '',
  startDate: '',
  endDate: '',
});

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

const getAutoEndDate = (startDate: string) => {
  if (!startDate) return '';
  const date = new Date(`${startDate}T12:00:00`);
  date.setDate(date.getDate() + 56);
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
};

const updateStartDate = (
  setter: React.Dispatch<React.SetStateAction<CohortFormState>>,
  startDate: string,
) => {
  setter((prev) => ({
    ...prev,
    startDate,
    endDate: startDate ? getAutoEndDate(startDate) : '',
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [weekAddTarget, setWeekAddTarget] = useState<{ cohortId: string; weekNumber: number } | null>(null);
  const [weekDeleteTarget, setWeekDeleteTarget] = useState<{ cohortId: string; weekId: number; weekNumber: number } | null>(null);
  const [weekEditTarget, setWeekEditTarget] = useState<{ cohortId: string; week: Week } | null>(null);
  const [addWeekChoice, setAddWeekChoice] = useState('blank');
  const [weekTitleDraft, setWeekTitleDraft] = useState('');

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
      .then((response) => setSupportUsers(sortByText(response.users.filter((user) => user.role === 'SUPPORT'), (user) => user.name)))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    setSelectedCohortId(activeCohort?.id || cohorts[0]?.id || '');
  }, [activeCohort?.id, cohorts]);

  // Summary counts for the active cohort card.
  const [activeSummary, setActiveSummary] = useState<{ groups: number; supports: number; participants: number } | null>(null);
  useEffect(() => {
    if (!activeCohort?.id) { setActiveSummary(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const [{ groups }, { participants }] = await Promise.all([
          groupsApi.getAll({ cohortId: activeCohort.id }),
          participantsApi.getAll({ cohortId: activeCohort.id }),
        ]);
        if (cancelled) return;
        const supports = new Set(groups.map((g) => g.supportId).filter(Boolean)).size;
        setActiveSummary({ groups: groups.length, supports, participants: participants.length });
      } catch {
        if (!cancelled) setActiveSummary(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCohort?.id]);

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
    });
  }, [selectedCohort]);

  const sortedSupportUsers = useMemo(
    () => sortByText(supportUsers, (user) => user.name),
    [supportUsers],
  );

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
      await cohortsApi.createFromCurrent({
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

  const handleSaveWeekTitle = async () => {
    if (!weekEditTarget) return;
    setWeekActionPending(true);
    setStatus('');
    try {
      await weeksApi.update(weekEditTarget.week.id, {
        title: weekTitleDraft.trim() || null,
      });
      await syncCohortWeeks(weekEditTarget.cohortId);
      if (activeCohort?.id === weekEditTarget.cohortId) {
        await reloadWeeks();
      }
      setWeekEditTarget(null);
      setWeekTitleDraft('');
      setStatus(`Week ${weekEditTarget.week.weekNumber} title updated.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update week title.');
    } finally {
      setWeekActionPending(false);
    }
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
                <h2 className="mt-2 text-2xl font-bold text-gray-900">{activeCohort.name}</h2>
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
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {cohort.status || 'ACTIVE'}
                </span>
              </div>
              <div className="flex items-center justify-end">
                <AppOverflowMenu
                  align="right"
                  items={[
                    { label: 'Set active', onClick: () => void setActiveCohort(cohort.id) },
                    { label: 'Details', onClick: () => openDetailsModal(cohort) },
                    { label: 'Members', onClick: () => openMembersModal(cohort) },
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
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {cohort.status || 'ACTIVE'}
                </span>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Start</span>
              <input
                type="date"
                value={createForm.startDate}
                onChange={(event) => updateStartDate(setCreateForm, event.target.value)}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">End</span>
              <input
                type="date"
                value={createForm.endDate}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-gray-600">
            Picking a start date auto-fills the end date to the Sunday that closes a 9-week run.
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
              {savingCreate ? 'Creating...' : 'Create Cohort'}
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
                  onChange={(event) => updateStartDate(setDetailsForm, event.target.value)}
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
                {savingDetails ? 'Saving...' : 'Save Details'}
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
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {sortedSupportUsers.map((member) => {
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
              {savingMembers ? 'Saving...' : 'Save Members'}
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
              {weekActionPending ? 'Adding...' : 'Add Week'}
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
              {weekActionPending ? 'Deleting...' : 'Delete Week'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={!!weekEditTarget}
        title={weekEditTarget ? `Week ${weekEditTarget.week.weekNumber} title` : 'Week title'}
        subtitle="Set the short class title used on the support dashboard."
        onClose={() => {
          if (weekActionPending) return;
          setWeekEditTarget(null);
          setWeekTitleDraft('');
        }}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Class title</label>
            <input
              type="text"
              value={weekTitleDraft}
              onChange={(event) => setWeekTitleDraft(event.target.value)}
              placeholder="e.g. Faith"
              maxLength={60}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>

          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 px-4 py-3 text-sm text-gray-600">
            This title powers the support dashboard’s “Next class” card for this week.
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setWeekEditTarget(null);
                setWeekTitleDraft('');
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
              {weekActionPending ? 'Saving...' : 'Save Title'}
            </button>
          </div>
        </div>
      </ModalShell>

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
              {deletingCohort ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </ModalShell>
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
            title={week.title ? `Week ${week.weekNumber}: ${week.title}` : `Set title for Week ${week.weekNumber}`}
          >
            <span className="min-w-0 truncate text-left">
              {week.title?.trim() ? `W${week.weekNumber}: ${week.title}` : `Week ${week.weekNumber}`}
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
}> = ({ isOpen, title, subtitle, onClose, children }) => {
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
      </div>
    </div>
  );
};

export default CohortsPage;
