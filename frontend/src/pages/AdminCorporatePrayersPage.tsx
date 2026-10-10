import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import SegmentedTabs from '../components/SegmentedTabs';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import { corporatePrayersApi } from '../services/api';
import type { PrayerOverview, PrayerSlot } from '../types';
import ScheduleTab from '../components/corporatePrayers/ScheduleTab';
import VersesTab from '../components/corporatePrayers/VersesTab';
import LivePrayerTab from '../components/corporatePrayers/LivePrayerTab';
import CoverageTab from '../components/corporatePrayers/CoverageTab';
import PreviewTab from '../components/corporatePrayers/PreviewTab';
import SlotEditorModal from '../components/corporatePrayers/SlotEditorModal';
import { Notice, PRIMARY_BTN } from '../components/corporatePrayers/ui';

// Corporate prayers (admin): when the cohort prays together, what is prayed, and who is prayed for.
// See docs/specs/corporate-prayers-admin.md and FLOW_MAP rule 54.

type TabKey = 'schedule' | 'verses' | 'live' | 'coverage' | 'preview';
const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'schedule', label: 'Schedule' },
  { key: 'verses', label: 'Verses' },
  { key: 'live', label: 'Live prayers' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'preview', label: 'Preview' },
];

const dayCount = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
const shortDay = (iso: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));

const StatusStrip: React.FC<{ overview: PrayerOverview; cohortName: string }> = ({ overview, cohortName }) => {
  const activeSlots = overview.slots.filter((slot) => slot.active);
  const needsVerses = activeSlots.some((slot) => slot.slotType === 'PRAYER');
  const missing: string[] = [];
  if (!overview.startDate) missing.push('Set the start week');
  if (activeSlots.length === 0) missing.push('Add a slot');
  if (needsVerses && overview.verses.active === 0) missing.push('Add at least one verse');
  let state: { label: string; tone: string };
  if (missing.length > 0) state = { label: 'Not set up', tone: 'bg-amber-100/80 text-amber-800' };
  else if (overview.endDate && overview.today > overview.endDate.slice(0, 10)) state = { label: 'Ended', tone: 'bg-gray-200 text-gray-700' };
  else if (overview.running) state = { label: 'Running', tone: 'bg-emerald-100/80 text-emerald-700' };
  else {
    const days = overview.startDate ? dayCount(overview.today, overview.startDate) : 0;
    state = { label: `Starts in ${days} day${days === 1 ? '' : 's'}`, tone: 'bg-sky-100/80 text-sky-700' };
  }
  return (
    <div data-wt="cp-status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_3px_rgba(17,24,39,0.06)]">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${state.tone}`}>{state.label}</span>
      <span className="text-sm text-gray-600">
        {cohortName}
        {overview.startDate ? ` · Prayers start ${shortDay(overview.startDate)}` : ''}
        {` · ${activeSlots.length} slot${activeSlots.length === 1 ? '' : 's'} a day`}
        {` · ${overview.counted.participants + overview.counted.supports} people notified`}
      </span>
      {missing.length > 0 && <span className="text-sm font-semibold text-amber-800">{missing.join(' · ')}</span>}
    </div>
  );
};

const AdminCorporatePrayersPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  const canAdd = can('corporate_prayers', 'add');
  const { activeCohort, weeks } = useAppData();
  const [tab, setTab] = useState<TabKey>('schedule');
  const [overview, setOverview] = useState<PrayerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PrayerSlot | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const cohortId = activeCohort?.id ?? null;

  // A background refresh that fails keeps what is on the page; only the first load shows an error.
  const load = useCallback(async (silent = false) => {
    if (!cohortId) { setLoading(false); return; }
    try {
      setOverview(await corporatePrayersApi.overview(cohortId));
      setError('');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not load corporate prayers.');
    } finally { setLoading(false); }
  }, [cohortId]);

  useEffect(() => { setLoading(true); setOverview(null); void load(false); }, [load]);
  const reload = useCallback(() => { void load(true); }, [load]);

  const cohortWeeks = useMemo(() => weeks.filter((week) => !cohortId || week.cohortId === cohortId), [weeks, cohortId]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const openAdd = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (slot: PrayerSlot) => { setEditing(slot); setEditorOpen(true); };

  return (
    <div className="page-content">
      <PageHeader
        title="Corporate prayers"
        tourId="admin:corporate-prayers"
        subtitle={activeCohort ? 'When the cohort prays together, what is prayed, and who is prayed for.' : 'No active cohort'}
        action={cohortId && overview && canAdd && (
          <button type="button" onClick={openAdd} className={PRIMARY_BTN}>Add slot</button>
        )}
      />
      {!cohortId ? (
        <p className="text-sm text-gray-500">Select or create a cohort first.</p>
      ) : loading ? (
        <PageLoader />
      ) : error || !overview ? (
        <div className="space-y-3">
          <Notice tone="error">{error || 'Could not load corporate prayers.'}</Notice>
          <button type="button" onClick={() => { setLoading(true); void load(false); }} className={PRIMARY_BTN}>Try again</button>
        </div>
      ) : (
        <>
          <StatusStrip overview={overview} cohortName={activeCohort?.name ?? ''} />
          <SegmentedTabs tabs={TABS} active={tab} onChange={(key) => setTab(key as TabKey)} scrollable className="mb-5" />
          {tab === 'schedule' && <ScheduleTab overview={overview} cohortId={cohortId} weeks={cohortWeeks} onReload={reload} onAdd={openAdd} onEdit={openEdit} hubs={overview.hubs} />}
          {tab === 'verses' && <VersesTab onChanged={reload} />}
          {tab === 'live' && <LivePrayerTab overview={overview} onEdit={openEdit} onAdd={openAdd} />}
          {tab === 'coverage' && <CoverageTab cohortId={cohortId} overview={overview} onReload={reload} />}
          {tab === 'preview' && <PreviewTab overview={overview} cohortId={cohortId} />}
          <SlotEditorModal isOpen={editorOpen} onClose={() => setEditorOpen(false)} cohortId={cohortId} slot={editing} hubs={overview.hubs} onSaved={reload} />
        </>
      )}
    </div>
  );
};

export default AdminCorporatePrayersPage;
