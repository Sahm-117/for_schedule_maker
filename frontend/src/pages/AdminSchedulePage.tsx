import React from 'react';
import { Navigate } from 'react-router-dom';
import FilterBar, { NO_CHOICES, type FilterGroup, type FilterValues } from '../components/filters/FilterBar';
import LabelManagement from '../components/LabelManagement';
import PageHeader from '../components/PageHeader';
import ScheduleView from '../components/ScheduleView';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { labelsApi, usersApi, cohortsApi } from '../services/api';
import AppOverflowMenu from '../components/AppOverflowMenu';
import ConfirmationModal from '../components/ConfirmationModal';
import AdminSupportTaskModal from '../components/schedule/AdminSupportTaskModal';
import type { Day, Label, User } from '../types';
import { exportAllWeeksToPDF, exportDayToPDF, exportWeekToPDF } from '../utils/pdfExport';
import { sortByText } from '../utils/sort';
import Spinner from '../components/Spinner';
import { pickableUsers } from '../utils/testUsers';
import { hasSupportRole } from '../utils/people';

const AdminSchedulePage: React.FC = () => {
  const { user, isAdmin, userLabelIds } = useAuth();
  const {
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
    loading,
    activeCohort,
    reloadCohorts,
  } = useAppData();
  const [publishing, setPublishing] = React.useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = React.useState(false);
  const schedulePublished = activeCohort?.schedulePublished === true;

  const togglePublished = async () => {
    if (!activeCohort || publishing) return;
    setConfirmPublishOpen(false);
    setPublishing(true);
    try {
      await cohortsApi.update(activeCohort.id, { schedulePublished: !schedulePublished });
      await reloadCohorts();
    } catch { /* ignore */ }
    finally { setPublishing(false); }
  };
  const [showTagManagement, setShowTagManagement] = React.useState(false);
  const [showSupportTask, setShowSupportTask] = React.useState(false);
  const [showDayExportPicker, setShowDayExportPicker] = React.useState(false);
  const [headerAddDayId, setHeaderAddDayId] = React.useState<number | null>(null);
  const [showDayAddPicker, setShowDayAddPicker] = React.useState(false);
  const [crossWeekRequest, setCrossWeekRequest] = React.useState(0);
  const [supportGroups, setSupportGroups] = React.useState<Label[]>([]);
  // Filter choices (see FilterBar): activity tag and support person; several of each at once.
  const [filters, setFilters] = React.useState<FilterValues>({});
  const selectedGroupIds = filters.tag ?? NO_CHOICES;
  const selectedUserIds = filters.person ?? NO_CHOICES;
  const [supportUsers, setSupportUsers] = React.useState<User[]>([]);

  React.useEffect(() => {
    if (!isAdmin) return;
    labelsApi.getAll()
      .then((response) => setSupportGroups(sortByText(response.labels, (label) => label.name)))
      .catch((error) => console.warn('Failed to load activity tags for filter:', error));
  }, [isAdmin]);

  React.useEffect(() => {
    if (!isAdmin) return;
    usersApi.getAll()
      .then(async (response) => {
        const onlySupportUsers = pickableUsers(response.users.filter((member) => hasSupportRole(member)));
        const usersWithLabels = await Promise.all(
          onlySupportUsers.map(async (member) => {
            try {
              const labelsResponse = await usersApi.getUserLabels(member.id);
              return { ...member, labels: labelsResponse.labels };
            } catch {
              return { ...member, labels: [] };
            }
          })
        );
        setSupportUsers(sortByText(usersWithLabels, (member) => member.name));
      })
      .catch((error) => console.warn('Failed to load support users:', error));
  }, [isAdmin]);

  const canManageSchedule = isAdmin;

  const exportSelectedWeek = async () => {
    if (!selectedWeek) return;
    await exportWeekToPDF(selectedWeek, { includeEmptyDays: false });
  };

  const exportAllWeeks = async () => {
    await exportAllWeeksToPDF(weeks, { includeEmptyDays: false });
  };

  const exportDay = async (day: Day) => {
    if (!selectedWeek) return;
    setShowDayExportPicker(false);
    await exportDayToPDF(selectedWeek, day, { includeEmptyDays: false });
  };

  // Support people who carry any of the chosen tags (all of them when no tag is chosen).
  const filteredSupportUsers = React.useMemo(() => {
    const users = selectedGroupIds.length > 0
      ? supportUsers.filter((member) => member.labels?.some((label) => selectedGroupIds.includes(label.id)))
      : supportUsers;
    return sortByText(users, (member) => member.name);
  }, [selectedGroupIds, supportUsers]);

  // A chosen person who no longer carries a chosen tag is dropped, so no hidden filter stays on.
  React.useEffect(() => {
    const kept = selectedUserIds.filter((id) => filteredSupportUsers.some((member) => member.id === id));
    if (kept.length !== selectedUserIds.length) setFilters((prev) => ({ ...prev, person: kept }));
  }, [filteredSupportUsers, selectedUserIds]);

  // Tags an activity must carry (any of): the chosen tags, narrowed to the chosen people's tags when both are chosen.
  const effectiveFilterLabelIds = React.useMemo(() => {
    const userLabelIds = new Set(supportUsers.filter((member) => selectedUserIds.includes(member.id)).flatMap((member) => member.labels?.map((label) => label.id) ?? []));
    if (selectedUserIds.length > 0 && selectedGroupIds.length > 0) return selectedGroupIds.filter((id) => userLabelIds.has(id));
    if (selectedUserIds.length > 0) return [...userLabelIds];
    if (selectedGroupIds.length > 0) return selectedGroupIds;
    return undefined;
  }, [selectedGroupIds, selectedUserIds, supportUsers]);

  // How many of the week's activities the filters leave, and the chips with counts.
  const weekActivities = React.useMemo(() => (selectedWeek?.days ?? []).flatMap((day) => day.activities), [selectedWeek]);
  const shownActivities = effectiveFilterLabelIds ? weekActivities.filter((a) => a.labels?.some((l) => effectiveFilterLabelIds.includes(l.id))).length : weekActivities.length;
  const filterGroups: FilterGroup[] = [
    { key: 'tag', label: 'Activity tag', options: supportGroups.map((group) => ({ value: group.id, label: group.name, count: weekActivities.filter((a) => a.labels?.some((l) => l.id === group.id)).length })) },
    { key: 'person', label: 'Support person', options: filteredSupportUsers.map((member) => ({ value: member.id, label: member.name })) },
  ].filter((g) => g.options.length > 0);

  const headerAction = canManageSchedule ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isAdmin && (
        <button
          type="button"
          onClick={() => setConfirmPublishOpen(true)}
          disabled={!activeCohort || publishing}
          title={schedulePublished ? 'Supports can see their activities. Click to unpublish.' : 'Supports cannot see activities yet. Click to publish.'}
          className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:opacity-60 ${
            schedulePublished ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${schedulePublished ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {publishing ? (<span className="inline-flex items-center gap-1.5"><Spinner className="h-3.5 w-3.5" />Saving…</span>) : schedulePublished ? 'Published' : 'Draft'}
        </button>
      )}
      {selectedWeek && (
        <>
      <button
        type="button"
        onClick={() => setShowDayAddPicker(true)}
        className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Add Activity
      </button>
      <AppOverflowMenu
        align="right"
        items={[
          ...(isAdmin ? [{ label: 'Add task for supports', onClick: () => setShowSupportTask(true) }] : []),
          { label: 'Daily export', onClick: () => setShowDayExportPicker(true) },
          { label: 'Export week', onClick: () => { void exportSelectedWeek(); } },
          { label: 'Export all', onClick: () => { void exportAllWeeks(); } },
          ...(isAdmin ? [{ label: 'Manage tags', onClick: () => setShowTagManagement(true) }] : []),
          { label: 'Cross-Week', onClick: () => setCrossWeekRequest((prev) => prev + 1) },
        ]}
      />
        </>
      )}
    </div>
  ) : null;

  // Guards are placed after all hooks to satisfy the Rules of Hooks.
  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support/schedule" replace />;
  }
  if (loading) {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        tourId="admin:schedule"
        subtitle="Manage weekly programme activities, exports, and edits that go through approval."
        action={headerAction}
      />

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <div data-wt="sched-week" className="relative z-30">
        <WeekSelector
          weeks={weeks}
          selectedWeek={selectedWeek}
          compact
          className="relative z-30"
          onWeekSelect={(weekId) => {
            void handleWeekSelect(weekId);
          }}
        />
        </div>
        {isAdmin && (
          <div data-wt="sched-filters" className="surface-card relative z-20 rounded-3xl border border-gray-100 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Activity tags</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">Filter assignments fast</p>
            <p className="mt-1 text-xs text-gray-500">Show only activities with these tags, or for these people.</p>
            <div className="mt-4">
              <FilterBar groups={filterGroups} value={filters} onChange={setFilters} shown={shownActivities} total={weekActivities.length} noun="activities" />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)]">
        <div data-wt="sched-view" className="space-y-4">
          {selectedWeek ? (
            <ScheduleView
              week={selectedWeek}
              weeks={weeks}
              pendingChanges={pendingChangesForSelectedWeek}
              onWeekUpdate={reloadWeeks}
              onPendingChangesRefresh={refreshPendingChanges}
              isAdmin={isAdmin}
              canEdit={isAdmin}
              filterLabelIds={effectiveFilterLabelIds ?? (isAdmin ? undefined : userLabelIds)}
              showInlineAdminActions={false}
              compactHeader
              externalAddDayId={headerAddDayId}
              onExternalAddHandled={() => setHeaderAddDayId(null)}
              externalCrossWeekRequest={crossWeekRequest}
              onExternalCrossWeekHandled={() => setCrossWeekRequest(0)}
            />
          ) : (
            <div className="surface-card p-12 text-center text-sm text-gray-500">Select a week to view the schedule.</div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmPublishOpen}
        onClose={() => setConfirmPublishOpen(false)}
        onConfirm={() => { void togglePublished(); }}
        title={schedulePublished ? 'Unpublish schedule?' : 'Publish schedule to supports?'}
        message={schedulePublished
          ? `Supports will immediately stop seeing their activities for ${activeCohort?.name ?? 'this cohort'}. You can publish again anytime.`
          : `Every support will immediately see the activities tagged to them in ${activeCohort?.name ?? 'this cohort'}. Make sure the schedule is ready.`}
        confirmText={schedulePublished ? 'Unpublish' : 'Publish'}
        type={schedulePublished ? 'danger' : 'info'}
      />

      {isAdmin && (
        <AdminSupportTaskModal isOpen={showSupportTask} onClose={() => setShowSupportTask(false)} weeks={weeks} selectedWeek={selectedWeek} />
      )}

      {isAdmin && (
        <LabelManagement
          isOpen={showTagManagement}
          onClose={() => {
            setShowTagManagement(false);
            labelsApi.getAll()
              .then((response) => setSupportGroups(sortByText(response.labels, (label) => label.name)))
              .catch((error) => console.warn('Failed to reload activity tags:', error));
          }}
        />
      )}

      {showDayAddPicker && selectedWeek && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Choose a day</h2>
                <p className="text-sm text-gray-500">Open the activity form for a specific day in Week {selectedWeek.weekNumber}.</p>
              </div>
              <button type="button" onClick={() => setShowDayAddPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {selectedWeek.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    setHeaderAddDayId(day.id);
                    setShowDayAddPicker(false);
                  }}
                  className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {day.dayName}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showDayExportPicker && selectedWeek && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Daily export</h2>
                <p className="text-sm text-gray-500">Choose which day from Week {selectedWeek.weekNumber} to export.</p>
              </div>
              <button type="button" onClick={() => setShowDayExportPicker(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {selectedWeek.days.map((day) => (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => {
                    void exportDay(day);
                  }}
                  className="w-full rounded-2xl bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {day.dayName}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSchedulePage;
