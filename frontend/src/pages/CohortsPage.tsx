import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import AppSelect from '../components/AppSelect';
import PageHeader from '../components/PageHeader';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { cohortsApi, usersApi } from '../services/api';
import type { Cohort, User } from '../types';

const CohortsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { cohorts, activeCohort, setActiveCohort, reloadWeeks, reloadCohorts } = useAppData();
  const [supportUsers, setSupportUsers] = useState<User[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);
  const [savingCohort, setSavingCohort] = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [status, setStatus] = useState('');
  const [newCohort, setNewCohort] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
  });
  const [cohortDraft, setCohortDraft] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (!isAdmin) return;
    usersApi.getAll()
      .then((response) => setSupportUsers(response.users.filter((user) => user.role === 'SUPPORT')))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    setSelectedCohortId(activeCohort?.id || cohorts[0]?.id || '');
  }, [activeCohort?.id, cohorts]);

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
    if (!selectedCohort) {
      setCohortDraft({ name: '', description: '', startDate: '', endDate: '' });
      return;
    }
    setCohortDraft({
      name: selectedCohort.name,
      description: selectedCohort.description || '',
      startDate: selectedCohort.startDate || '',
      endDate: selectedCohort.endDate || '',
    });
  }, [selectedCohortId, selectedCohort]);

  const selectedCohort = cohorts.find((cohort) => cohort.id === selectedCohortId) || null;
  const cohortOptions = cohorts.map((cohort) => ({
    value: cohort.id,
    label: cohort.name,
    meta: cohort.startDate && cohort.endDate ? `${cohort.startDate} → ${cohort.endDate}` : 'No dates yet',
  }));

  const sortedSupportUsers = useMemo(
    () => [...supportUsers].sort((a, b) => a.name.localeCompare(b.name)),
    [supportUsers]
  );

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreateCohort = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeCohort || !newCohort.name.trim()) return;
    setSavingCohort(true);
    setStatus('');
    try {
      await cohortsApi.createFromCurrent({
        name: newCohort.name.trim(),
        description: newCohort.description.trim() || undefined,
        startDate: newCohort.startDate || null,
        endDate: newCohort.endDate || null,
        sourceCohortId: activeCohort.id,
      });
      setStatus('Cohort created from the current active cohort.');
      setNewCohort({ name: '', description: '', startDate: '', endDate: '' });
      await reloadCohorts();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to create cohort.');
    } finally {
      setSavingCohort(false);
    }
  };

  const handleAddWeek = async () => {
    if (!selectedCohortId) return;
    setSavingCohort(true);
    setStatus('');
    try {
      await cohortsApi.addWeek(selectedCohortId);
      await reloadCohorts();
      if (activeCohort?.id === selectedCohortId) {
        await reloadWeeks();
      }
      setStatus('A new week was added to the selected cohort.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to add week.');
    } finally {
      setSavingCohort(false);
    }
  };

  const handleSaveCohortDetails = async () => {
    if (!selectedCohortId || !cohortDraft.name.trim()) return;
    setSavingDates(true);
    setStatus('');
    try {
      await cohortsApi.update(selectedCohortId, {
        name: cohortDraft.name.trim(),
        description: cohortDraft.description.trim() || null,
        startDate: cohortDraft.startDate || null,
        endDate: cohortDraft.endDate || null,
      });
      await reloadCohorts();
      if (activeCohort?.id === selectedCohortId) {
        await setActiveCohort(selectedCohortId);
      }
      setStatus('Cohort details updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update cohort.');
    } finally {
      setSavingDates(false);
    }
  };

  const handleSaveMembers = async () => {
    if (!selectedCohortId) return;
    setSavingMembers(true);
    setStatus('');
    try {
      await cohortsApi.setMembers(selectedCohortId, memberIds);
      setStatus('Cohort members updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update cohort members.');
    } finally {
      setSavingMembers(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cohorts"
        subtitle="Create cohorts from the current schedule, switch the active cohort, extend its weeks, and control which support users belong to it."
      />

      {status && (
        <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-gray-700">
          {status}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-6">
          <div className="surface-card p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Active Cohort</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{activeCohort?.name || 'No cohort selected'}</p>
            <div className="mt-4">
              <AppSelect
                value={selectedCohortId}
                onChange={setSelectedCohortId}
                options={cohortOptions}
                placeholder="Select a cohort"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectedCohortId && void setActiveCohort(selectedCohortId)}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Switch Active Cohort
              </button>
              <button
                type="button"
                onClick={() => void handleAddWeek()}
                disabled={!selectedCohortId || savingCohort}
                className="rounded-full border border-orange-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-orange-50 disabled:opacity-50"
              >
                Add Week
              </button>
            </div>
            {selectedCohort && (
              <div className="mt-4 rounded-3xl border border-orange-100 bg-orange-50/40 p-4">
                <p className="text-sm font-semibold text-gray-900">Cohort details</p>
                <div className="mt-3 grid gap-3">
                  <input
                    type="text"
                    value={cohortDraft.name}
                    onChange={(event) => setCohortDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Cohort name"
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                  <textarea
                    value={cohortDraft.description}
                    onChange={(event) => setCohortDraft((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Description"
                    rows={2}
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="date"
                      value={cohortDraft.startDate}
                      onChange={(event) => setCohortDraft((prev) => ({ ...prev, startDate: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                    />
                    <input
                      type="date"
                      value={cohortDraft.endDate}
                      onChange={(event) => setCohortDraft((prev) => ({ ...prev, endDate: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleSaveCohortDetails()}
                      disabled={!selectedCohortId || savingDates}
                      className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      {savingDates ? 'Saving...' : 'Save Details'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="surface-card p-6">
            <h2 className="text-lg font-semibold text-gray-900">Create New Cohort</h2>
            <p className="mt-1 text-sm text-gray-500">Clone the current active cohort’s full week structure and activities into a new independent cohort.</p>
            <form onSubmit={handleCreateCohort} className="mt-4 space-y-3">
              <input
                type="text"
                value={newCohort.name}
                onChange={(event) => setNewCohort((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Cohort name"
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                required
              />
              <textarea
                value={newCohort.description}
                onChange={(event) => setNewCohort((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                rows={3}
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="date"
                  value={newCohort.startDate}
                  onChange={(event) => setNewCohort((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="date"
                  value={newCohort.endDate}
                  onChange={(event) => setNewCohort((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!activeCohort || savingCohort}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {savingCohort ? 'Creating...' : 'Create from Current Cohort'}
              </button>
            </form>
          </div>
        </div>

        <div className="surface-card p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Support Membership</h2>
              <p className="mt-1 text-sm text-gray-500">Assign support users to the selected cohort. Cohort-scoped announcements and schedules will respect this list.</p>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveMembers()}
              disabled={!selectedCohortId || savingMembers}
              className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {savingMembers ? 'Saving...' : 'Save Members'}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {sortedSupportUsers.map((member) => (
              <label key={member.id} className="flex items-center justify-between rounded-2xl border border-orange-100 px-4 py-3 hover:bg-orange-50/40">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
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
        </div>
      </div>
    </div>
  );
};

export default CohortsPage;
