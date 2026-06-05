import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
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

const CohortsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { cohorts, activeCohort, setActiveCohort, reloadWeeks, reloadCohorts } = useAppData();
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [weekCounts, setWeekCounts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const [savingCreate, setSavingCreate] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [addingWeek, setAddingWeek] = useState(false);

  const [createForm, setCreateForm] = useState<CohortFormState>(emptyForm);
  const [detailsForm, setDetailsForm] = useState<CohortFormState>(emptyForm);

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

  const cohortCards = useMemo(
    () => [...cohorts].sort((a, b) => {
      if (a.id === activeCohort?.id) return -1;
      if (b.id === activeCohort?.id) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }),
    [activeCohort?.id, cohorts],
  );

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

  const handleAddWeek = async (cohortId: string) => {
    setAddingWeek(true);
    setStatus('');
    try {
      await cohortsApi.addWeek(cohortId);
      await reloadCohorts();
      if (activeCohort?.id === cohortId) {
        await reloadWeeks();
      }
      setWeekCounts((prev) => ({ ...prev, [cohortId]: (prev[cohortId] || 0) + 1 }));
      setStatus('A new week was added to the cohort.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to add week.');
    } finally {
      setAddingWeek(false);
    }
  };

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
        subtitle="Manage the active cohort, review prior cohorts, and open focused overlays when you want to create, edit, or assign."
        action={headerAction}
      />

      {status && (
        <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-gray-700">
          {status}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-card overflow-hidden">
          <div className="border-b border-orange-100 bg-gradient-to-r from-orange-50/70 via-white to-white px-6 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Active Cohort</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{activeCohort?.name || 'No active cohort'}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {activeCohort?.description || 'This is the cohort currently driving schedules, activity overview, approvals, and cohort-scoped announcements.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                  {weekCounts[activeCohort?.id || ''] || 0} weeks
                </span>
                <span className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700">
                  {activeCohort?.startDate || 'No start'} to {activeCohort?.endDate || 'No end'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
            <ActionTile
              title="Switch focus"
              text="Move the whole admin workspace to another cohort."
              buttonLabel="Choose cohort"
              onClick={() => setDetailsOpen(true)}
            />
            <ActionTile
              title="Edit details"
              text="Update dates, title, and notes for the selected cohort."
              buttonLabel="Open details"
              onClick={() => selectedCohort && openDetailsModal(selectedCohort)}
            />
            <ActionTile
              title="Support access"
              text="Control exactly which support users belong to this cohort."
              buttonLabel="Manage members"
              onClick={() => selectedCohort && openMembersModal(selectedCohort)}
            />
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Prior Cohorts</p>
              <h2 className="mt-1 text-xl font-bold text-gray-900">Cohort library</h2>
              <p className="mt-1 text-sm text-gray-500">Review older or parallel cohorts without exposing every control inline.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {cohortCards.length} total
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {cohortCards.map((cohort) => {
              const active = cohort.id === activeCohort?.id;
              return (
                <article
                  key={cohort.id}
                  className={`rounded-3xl border px-4 py-4 transition ${
                    active ? 'border-primary/30 bg-orange-50/60' : 'border-orange-100 bg-white hover:bg-orange-50/40'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{cohort.name}</h3>
                        {active && (
                          <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-white">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        {cohort.description || 'No cohort description added yet.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!active && (
                        <button
                          type="button"
                          onClick={() => void setActiveCohort(cohort.id)}
                          className="rounded-full border border-primary px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5"
                        >
                          Set Active
                        </button>
                      )}
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
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <InfoPill label={`${weekCounts[cohort.id] || 0} weeks`} />
                    <InfoPill label={`${cohort.startDate || 'No start'} to ${cohort.endDate || 'No end'}`} />
                    <InfoPill label={cohort.status || 'ACTIVE'} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <ModalShell
        isOpen={createOpen}
        title="Create New Cohort"
        subtitle={activeCohort ? `This will clone ${activeCohort.name} and keep the new cohort independent from the source.` : 'Clone the current active cohort into a new independent cohort.'}
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
            <input
              type="date"
              value={createForm.startDate}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, startDate: event.target.value }))}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="date"
              value={createForm.endDate}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, endDate: event.target.value }))}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
            />
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
        subtitle="Switch active cohort, adjust dates, and extend the selected cohort without cluttering the main page."
        onClose={() => setDetailsOpen(false)}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-3">
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Selected Cohort</label>
            <select
              value={selectedCohortId}
              onChange={(event) => setSelectedCohortId(event.target.value)}
              className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm focus:border-primary focus:outline-none"
            >
              {cohorts.map((cohort) => (
                <option key={cohort.id} value={cohort.id}>
                  {cohort.name}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap gap-2">
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
                disabled={!selectedCohortId || addingWeek}
                className="rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-50"
              >
                {addingWeek ? 'Adding...' : 'Add Week'}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="date"
                value={detailsForm.startDate}
                onChange={(event) => setDetailsForm((prev) => ({ ...prev, startDate: event.target.value }))}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="date"
                value={detailsForm.endDate}
                onChange={(event) => setDetailsForm((prev) => ({ ...prev, endDate: event.target.value }))}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
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
        subtitle={selectedCohort ? `Choose which support users belong to ${selectedCohort.name}.` : 'Assign support users to the selected cohort.'}
        onClose={() => setMembersOpen(false)}
      >
        <div className="space-y-4">
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {sortedSupportUsers.map((member) => (
              <label key={member.id} className="flex items-center justify-between rounded-2xl border border-orange-100 px-4 py-3 hover:bg-orange-50/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{member.name}</p>
                  <p className="truncate text-xs text-gray-500">{member.email || member.phone || 'No contact value'}</p>
                </div>
                <input
                  type="checkbox"
                  checked={memberIds.includes(member.id)}
                  onChange={() => setMemberIds((prev) => (
                    prev.includes(member.id) ? prev.filter((id) => id !== member.id) : [...prev, member.id]
                  ))}
                  className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </label>
            ))}
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
    </div>
  );
};

const ActionTile: React.FC<{
  title: string;
  text: string;
  buttonLabel: string;
  onClick: () => void;
}> = ({ title, text, buttonLabel, onClick }) => (
  <div className="rounded-3xl border border-orange-100 bg-white px-4 py-4 shadow-sm">
    <p className="text-base font-semibold text-gray-900">{title}</p>
    <p className="mt-1 text-sm text-gray-500">{text}</p>
    <button
      type="button"
      onClick={onClick}
      className="mt-4 rounded-full border border-orange-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-orange-50"
    >
      {buttonLabel}
    </button>
  </div>
);

const InfoPill: React.FC<{ label: string }> = ({ label }) => (
  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
    {label}
  </span>
);

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
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
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
