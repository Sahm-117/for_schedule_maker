import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { cohortsApi, usersApi, weeksApi } from '../services/api';
import type { Cohort, User } from '../types';

type CohortFormState = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
};

const emptyForm = (): CohortFormState => ({
  name: '',
  description: '',
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
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      .then((response) => setSupportUsers(response.users.filter((user) => user.role === 'SUPPORT')))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    setSelectedCohortId(activeCohort?.id || cohorts[0]?.id || '');
  }, [activeCohort?.id, cohorts]);

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

    const loadWeekCounts = async () => {
      const entries = await Promise.all(
        cohorts.map(async (cohort) => {
          try {
            const response = await weeksApi.getAll(cohort.id);
            return [cohort.id, response.weeks.length] as const;
          } catch {
            return [cohort.id, 0] as const;
          }
        }),
      );

      if (!cancelled) {
        setWeekCounts(Object.fromEntries(entries));
      }
    };

    if (cohorts.length > 0) {
      void loadWeekCounts();
    } else {
      setWeekCounts({});
    }

    return () => {
      cancelled = true;
    };
  }, [cohorts]);

  useEffect(() => {
    if (!selectedCohort) {
      setDetailsForm(emptyForm());
      return;
    }
    setDetailsForm({
      name: selectedCohort.name,
      description: selectedCohort.description || '',
      startDate: selectedCohort.startDate || '',
      endDate: selectedCohort.endDate || '',
    });
  }, [selectedCohort]);

  const sortedSupportUsers = useMemo(
    () => [...supportUsers].sort((a, b) => a.name.localeCompare(b.name)),
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

  const cohortOptions = cohorts.map((cohort) => ({
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
        startDate: detailsForm.startDate || null,
        endDate: detailsForm.endDate || null,
      });
      await reloadCohorts();
      if (activeCohort?.id === selectedCohortId) {
        await setActiveCohort(selectedCohortId);
      }
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

  const syncWeekCounts = async (cohortId: string) => {
    const response = await weeksApi.getAll(cohortId);
    setWeekCounts((prev) => ({ ...prev, [cohortId]: response.weeks.length }));
  };

  const handleAddWeek = async (cohortId: string) => {
    setWeekActionPending(true);
    setStatus('');
    try {
      await cohortsApi.addWeek(cohortId);
      await reloadCohorts();
      await syncWeekCounts(cohortId);
      if (activeCohort?.id === cohortId) {
        await reloadWeeks();
      }
      setStatus('A new week was added to the cohort.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to add week.');
    } finally {
      setWeekActionPending(false);
    }
  };

  const handleDeleteWeek = async (cohortId: string) => {
    setWeekActionPending(true);
    setStatus('');
    try {
      const response = await cohortsApi.deleteLatestWeek(cohortId);
      await reloadCohorts();
      await syncWeekCounts(cohortId);
      if (activeCohort?.id === cohortId) {
        await reloadWeeks();
      }
      setStatus(`Week ${response.deletedWeekNumber} was removed from the cohort.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to remove week.');
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
        subtitle="Keep the current cohort in view, archive older cohorts instead of exposing them by default, and only use delete when you truly want to erase the cohort history."
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
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {weekCounts[activeCohort.id] || 0} weeks
                </span>
                <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700">
                  {formatDateRange(activeCohort.startDate, activeCohort.endDate)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.25fr_0.95fr_1.2fr_auto]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Window</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{formatDateRange(activeCohort.startDate, activeCohort.endDate)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Weeks</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{weekCounts[activeCohort.id] || 0} total weeks</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAddWeek(activeCohort.id)}
                disabled={weekActionPending}
                className="rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                Add Week
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteWeek(activeCohort.id)}
                disabled={weekActionPending || (weekCounts[activeCohort.id] || 0) <= 1}
                className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                Remove Last Week
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
              <button
                type="button"
                onClick={() => void handleArchiveToggle(activeCohort)}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {activeCohort.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
              </button>
              <button
                type="button"
                onClick={() => openDetailsModal(activeCohort)}
                className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => openMembersModal(activeCohort)}
                className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
              >
                Members
              </button>
              <button
                type="button"
                onClick={() => openDeleteModal(activeCohort)}
                className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
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
          <div className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_1.2fr] gap-4 border-b border-orange-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
            <span>Cohort</span>
            <span>Window</span>
            <span>Weeks</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {olderCohorts.map((cohort) => (
            <div key={cohort.id} className="grid grid-cols-[1.4fr_1fr_0.7fr_0.8fr_1.2fr] gap-4 border-b border-orange-100 px-5 py-4 last:border-b-0">
              <div>
                <p className="text-sm font-semibold text-gray-900">{cohort.name}</p>
                <p className="mt-1 text-xs text-gray-500">{cohort.description || 'No cohort description yet.'}</p>
              </div>
              <div className="text-sm text-gray-600">{formatDateRange(cohort.startDate, cohort.endDate)}</div>
              <div className="text-sm font-semibold text-gray-900">{weekCounts[cohort.id] || 0}</div>
              <div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {cohort.status || 'ACTIVE'}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void setActiveCohort(cohort.id)}
                  className="rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  Set Active
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddWeek(cohort.id)}
                  disabled={weekActionPending}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-50"
                >
                  Add Week
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteWeek(cohort.id)}
                  disabled={weekActionPending || (weekCounts[cohort.id] || 0) <= 1}
                  className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => openDetailsModal(cohort)}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => openMembersModal(cohort)}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
                >
                  Members
                </button>
                <button
                  type="button"
                  onClick={() => void handleArchiveToggle(cohort)}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {cohort.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteModal(cohort)}
                  className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
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
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {cohort.status || 'ACTIVE'}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-gray-600">
                <p><span className="font-semibold text-gray-900">Window:</span> {formatDateRange(cohort.startDate, cohort.endDate)}</p>
                <p><span className="font-semibold text-gray-900">Weeks:</span> {weekCounts[cohort.id] || 0}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void setActiveCohort(cohort.id)}
                  className="rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  Set Active
                </button>
                <button
                  type="button"
                  onClick={() => void handleAddWeek(cohort.id)}
                  disabled={weekActionPending}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-50"
                >
                  Add Week
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteWeek(cohort.id)}
                  disabled={weekActionPending || (weekCounts[cohort.id] || 0) <= 1}
                  className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => openDetailsModal(cohort)}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => openMembersModal(cohort)}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
                >
                  Members
                </button>
                <button
                  type="button"
                  onClick={() => void handleArchiveToggle(cohort)}
                  className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {cohort.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => openDeleteModal(cohort)}
                  className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  Delete
                </button>
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
        title="Create New Cohort"
        subtitle={activeCohort ? `This will clone ${activeCohort.name} and set up a default 9-week window for the new cohort.` : 'Clone the current active cohort into a new independent cohort.'}
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
        title="Cohort Details"
        subtitle="Switch focus with the custom selector, see the real week count, and manage growth openly."
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {selectedCohort ? `${weekCounts[selectedCohort.id] || 0} weeks` : '0 weeks'}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  Add and remove are applied immediately
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => selectedCohortId && void setActiveCohort(selectedCohortId)}
                  className="rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  Switch Active Cohort
                </button>
                <button
                  type="button"
                  onClick={() => selectedCohortId && void handleAddWeek(selectedCohortId)}
                  disabled={!selectedCohortId || weekActionPending}
                  className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-50"
                >
                  Add Week
                </button>
                <button
                  type="button"
                  onClick={() => selectedCohortId && void handleDeleteWeek(selectedCohortId)}
                  disabled={!selectedCohortId || weekActionPending || (selectedCohort ? (weekCounts[selectedCohort.id] || 0) <= 1 : true)}
                  className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Remove Last Week
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
        title="Support Membership"
        subtitle={selectedCohort ? `Toggle support access for ${selectedCohort.name}.` : 'Assign support users to the selected cohort.'}
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
