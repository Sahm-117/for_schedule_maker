import React from 'react';
import { Navigate } from 'react-router-dom';
import AdminCompletionOverviewDrawer from '../components/AdminCompletionOverviewDrawer';
import AppSelect from '../components/AppSelect';
import LabelManagement from '../components/LabelManagement';
import PageHeader from '../components/PageHeader';
import ScheduleView from '../components/ScheduleView';
import WeekSelector from '../components/WeekSelector';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../hooks/useAuth';
import { labelsApi, supportActivityCompletionsApi, usersApi } from '../services/api';
import type { Activity, Day, Label, SupportActivityCompletion, User } from '../types';
import { exportAllWeeksToPDF, exportDayToPDF, exportWeekToPDF } from '../utils/pdfExport';

const AdminSchedulePage: React.FC = () => {
  const { user, isAdmin, isSopPreparer, userLabelIds } = useAuth();
  const {
    weeks,
    selectedWeek,
    handleWeekSelect,
    reloadWeeks,
    pendingChangesForSelectedWeek,
    refreshPendingChanges,
    loading,
  } = useAppData();
  const [showExportMenu, setShowExportMenu] = React.useState(false);
  const [showTagManagement, setShowTagManagement] = React.useState(false);
  const [showDayExportPicker, setShowDayExportPicker] = React.useState(false);
  const [headerAddDayId, setHeaderAddDayId] = React.useState<number | null>(null);
  const [showDayAddPicker, setShowDayAddPicker] = React.useState(false);
  const [crossWeekRequest, setCrossWeekRequest] = React.useState(0);
  const [supportGroups, setSupportGroups] = React.useState<Label[]>([]);
  const [selectedSupportGroupId, setSelectedSupportGroupId] = React.useState('');
  const [supportUsers, setSupportUsers] = React.useState<User[]>([]);
  const [selectedSupportUserId, setSelectedSupportUserId] = React.useState('');
  const [showOverviewDrawer, setShowOverviewDrawer] = React.useState(false);
  const [completions, setCompletions] = React.useState<SupportActivityCompletion[]>([]);

  React.useEffect(() => {
    if (!isAdmin) return;
    labelsApi.getAll()
      .then((response) => setSupportGroups(response.labels))
      .catch((error) => console.warn('Failed to load activity tags for filter:', error));
  }, [isAdmin]);

  React.useEffect(() => {
    if (!isAdmin) return;
    usersApi.getAll()
      .then(async (response) => {
        const onlySupportUsers = response.users.filter((member) => member.role === 'SUPPORT');
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
        setSupportUsers(usersWithLabels);
      })
      .catch((error) => console.warn('Failed to load support users:', error));
  }, [isAdmin]);

  React.useEffect(() => {
    if (!selectedWeek || !isAdmin) {
      setCompletions([]);
      return;
    }

    supportActivityCompletionsApi.getByWeek(selectedWeek.id)
      .then((response) => setCompletions(response.completions))
      .catch((error) => {
        console.warn('Failed to load support completions for overview:', error);
        setCompletions([]);
      });
  }, [isAdmin, selectedWeek]);

  if (user?.role === 'SUPPORT') {
    return <Navigate to="/support/schedule" replace />;
  }

  if (loading) {
    return null;
  }

  const canManageSchedule = isAdmin || isSopPreparer;

  const exportSelectedWeek = async () => {
    if (!selectedWeek) return;
    setShowExportMenu(false);
    await exportWeekToPDF(selectedWeek, { includeEmptyDays: false });
  };

  const exportAllWeeks = async () => {
    setShowExportMenu(false);
    await exportAllWeeksToPDF(weeks, { includeEmptyDays: false });
  };

  const exportDay = async (day: Day) => {
    if (!selectedWeek) return;
    setShowDayExportPicker(false);
    await exportDayToPDF(selectedWeek, day, { includeEmptyDays: false });
  };

  const groupOptions = [
    { value: '', label: 'All activity tags', meta: 'Show every assigned activity' },
    ...supportGroups.map((group) => ({
      value: group.id,
      label: group.name,
      meta: 'Activity tag filter',
    })),
  ];

  const filteredSupportUsers = React.useMemo(() => {
    if (!selectedSupportGroupId) return supportUsers;
    return supportUsers.filter((member) => member.labels?.some((label) => label.id === selectedSupportGroupId));
  }, [selectedSupportGroupId, supportUsers]);

  React.useEffect(() => {
    if (selectedSupportUserId && !filteredSupportUsers.some((member) => member.id === selectedSupportUserId)) {
      setSelectedSupportUserId('');
    }
  }, [filteredSupportUsers, selectedSupportUserId]);

  const supportUserOptions = [
    { value: '', label: 'All support users', meta: 'Show the full support team' },
    ...filteredSupportUsers.map((member) => ({
      value: member.id,
      label: member.name,
      meta: member.labels?.map((label) => label.name).join(' • ') || 'No activity tags yet',
    })),
  ];

  const selectedSupportUser = supportUsers.find((member) => member.id === selectedSupportUserId) || null;
  const effectiveFilterLabelIds = React.useMemo(() => {
    const userGroupIds = selectedSupportUser?.labels?.map((label) => label.id) || [];

    if (selectedSupportUserId && selectedSupportGroupId) {
      return userGroupIds.includes(selectedSupportGroupId) ? [selectedSupportGroupId] : [];
    }

    if (selectedSupportUserId) {
      return userGroupIds;
    }

    if (selectedSupportGroupId) {
      return [selectedSupportGroupId];
    }

    return undefined;
  }, [selectedSupportGroupId, selectedSupportUser, selectedSupportUserId]);

  const overviewActivities = React.useMemo(() => {
    if (!selectedWeek) return [] as Activity[];
    const rawActivities = selectedWeek.days.flatMap((day) => day.activities.map((activity) => ({
      ...activity,
      day,
    })));

    if (!effectiveFilterLabelIds) return rawActivities;

    return rawActivities.filter((activity) =>
      activity.labels?.some((label) => effectiveFilterLabelIds.includes(label.id))
    );
  }, [effectiveFilterLabelIds, selectedWeek]);

  const headerAction = canManageSchedule ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowTagManagement(true)}
          className="inline-flex h-10 items-center justify-center rounded-full border border-orange-200 px-4 text-sm font-semibold text-gray-700 hover:bg-orange-50"
        >
          Manage tags
        </button>
      )}
      {selectedWeek && (
        <>
      {isAdmin && (
        <button
          type="button"
          onClick={() => setShowOverviewDrawer(true)}
          className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Overview
        </button>
      )}
      <button
        type="button"
        onClick={() => setShowDayAddPicker(true)}
        className="inline-flex h-10 items-center justify-center rounded-full border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5"
      >
        Add Activity
      </button>
      <button
        type="button"
        onClick={() => setCrossWeekRequest((prev) => prev + 1)}
        className="inline-flex h-10 items-center justify-center rounded-full border border-orange-200 px-4 text-sm font-semibold text-gray-700 hover:bg-orange-50"
      >
        Cross-Week
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowExportMenu((prev) => !prev)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Export
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 9-7 7-7-7" />
          </svg>
        </button>
        {showExportMenu && (
          <div className="absolute right-0 top-12 z-20 w-44 rounded-2xl border border-orange-100 bg-white p-2 shadow-xl">
            <button
              type="button"
              onClick={() => {
                setShowExportMenu(false);
                setShowDayExportPicker(true);
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
            >
              Daily export
            </button>
            <button
              type="button"
              onClick={() => {
                void exportSelectedWeek();
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
            >
              Export week
            </button>
            <button
              type="button"
              onClick={() => {
                void exportAllWeeks();
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-gray-700 hover:bg-orange-50"
            >
              Export all
            </button>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle="Manage weekly programme activities, exports, and edits that go through approval."
        action={headerAction}
      />

      <div className="mb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <WeekSelector
          weeks={weeks}
          selectedWeek={selectedWeek}
          compact
          className="relative z-30"
          onWeekSelect={(weekId) => {
            void handleWeekSelect(weekId);
          }}
        />
        {isAdmin && (
          <div className="surface-card relative z-20 rounded-3xl border border-orange-100 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Activity tags</p>
            <p className="mt-1 text-sm font-semibold text-gray-900">Filter assignments fast</p>
            <p className="mt-1 text-xs text-gray-500">See one tag’s exact workload without opening the native browser picker.</p>
            <div className="mt-4">
              <AppSelect
                value={selectedSupportGroupId}
                onChange={setSelectedSupportGroupId}
                options={groupOptions}
                placeholder="All activity tags"
                compact
              />
            </div>
            <div className="mt-4">
              <AppSelect
                value={selectedSupportUserId}
                onChange={setSelectedSupportUserId}
                options={supportUserOptions}
                placeholder="All support users"
                compact
                label="Support person"
              />
            </div>
          </div>
        )}
        <div className="surface-card relative z-0 rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/60 to-white p-4">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Focus</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {selectedWeek ? `Week ${selectedWeek.weekNumber} command view` : 'Select a week'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <QuickMetric
              label="Visible days"
              value={selectedWeek?.days.length ?? 0}
            />
            <QuickMetric
              label="Support filter"
              value={selectedSupportGroupId ? '1 active' : 'All'}
            />
            <QuickMetric
              label="Support user"
              value={selectedSupportUser ? selectedSupportUser.name.split(' ')[0] : 'All'}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)]">
        <div className="space-y-4">
          {selectedWeek ? (
            <ScheduleView
              week={selectedWeek}
              weeks={weeks}
              pendingChanges={pendingChangesForSelectedWeek}
              onWeekUpdate={reloadWeeks}
              onPendingChangesRefresh={refreshPendingChanges}
              isAdmin={isAdmin}
              canEdit={isAdmin || isSopPreparer}
              filterLabelIds={effectiveFilterLabelIds ?? (isAdmin || isSopPreparer ? undefined : userLabelIds)}
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

      {isAdmin && selectedWeek && (
        <AdminCompletionOverviewDrawer
          open={showOverviewDrawer}
          onClose={() => setShowOverviewDrawer(false)}
          activities={overviewActivities}
          users={supportUsers}
          completions={completions}
          selectedUserId={selectedSupportUserId || undefined}
          heading={`Week ${selectedWeek.weekNumber} completion overview`}
          subheading={
            selectedSupportUser
              ? `Tracking done versus pending tasks for ${selectedSupportUser.name}.`
              : selectedSupportGroupId
                ? 'Tracking done versus pending tasks for the selected activity tag.'
                : 'Tracking done versus pending tasks for the full selected week.'
          }
        />
      )}

      {isAdmin && (
        <LabelManagement
          isOpen={showTagManagement}
          onClose={() => {
            setShowTagManagement(false);
            labelsApi.getAll()
              .then((response) => setSupportGroups(response.labels))
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
                  className="w-full rounded-2xl border border-orange-100 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-orange-50"
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
                  className="w-full rounded-2xl border border-orange-100 px-4 py-3 text-left text-sm font-medium text-gray-700 hover:bg-orange-50"
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

const QuickMetric: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-2xl border border-white bg-white/85 px-3 py-3 shadow-sm">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{label}</p>
    <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
  </div>
);

export default AdminSchedulePage;
