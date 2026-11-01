import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PageLoader from '../components/PageLoader';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useAppData } from '../context/AppDataContext';
import { activitiesApi, labelsApi, usersApi } from '../services/api';
import type { Label, User } from '../types';
import { findDutyOverlaps, ROTA_DUTIES } from '../config/rotaDuties';
import {
  buildRotaGrid,
  cellKey,
  findUnmatchedActivities,
  describeOwners,
  isGroupSupportLabel,
  type LabelOwners,
  type RotaCell,
} from '../utils/rotaGrid';
import AppSelect from '../components/AppSelect';
import ConfirmationModal from '../components/ConfirmationModal';
import RotaGrid from '../components/rota/RotaGrid';
import RotaApplyModal, { type StagedChange } from '../components/rota/RotaApplyModal';
import UnmatchedActivitiesPanel from '../components/rota/UnmatchedActivitiesPanel';

const labelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const AdminRotaPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { can } = usePermissions();
  const canEdit = can('schedule', 'edit');
  const navigate = useNavigate();
  const { weeks, activeCohort, reloadWeeks } = useAppData();

  const [labels, setLabels] = useState<Label[]>([]);
  const [labelOwners, setLabelOwners] = useState<LabelOwners>(new Map());
  const [loading, setLoading] = useState(true);
  const [staged, setStaged] = useState<Map<string, string[]>>(new Map());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fillDutyId, setFillDutyId] = useState('');
  const [fillLabelId, setFillLabelId] = useState('');
  const [fillConfirmOpen, setFillConfirmOpen] = useState(false);
  const [fillProgress, setFillProgress] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [labelRes, ownerRes] = await Promise.all([labelsApi.getAll(), usersApi.getLabelOwners()]);
        if (cancelled) return;
        setLabels(labelRes.labels || []);
        const owners: LabelOwners = new Map();
        for (const row of ownerRes.owners || []) {
          const list = owners.get(row.labelId);
          if (list) list.push(row.user as User);
          else owners.set(row.labelId, [row.user as User]);
        }
        setLabelOwners(owners);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load labels');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupLabels = useMemo(
    () => labels.filter(isGroupSupportLabel).sort((a, b) => labelCollator.compare(a.name, b.name)),
    [labels]
  );

  const sortedWeeks = useMemo(
    () => [...weeks].sort((a, b) => a.weekNumber - b.weekNumber),
    [weeks]
  );

  const grid = useMemo(() => buildRotaGrid(sortedWeeks), [sortedWeeks]);
  const unmatched = useMemo(() => findUnmatchedActivities(sortedWeeks), [sortedWeeks]);

  // A description matching two duties would let one assignment wipe the other's,
  // since applying replaces every label on the matched activities.
  const blockedDutyIds = useMemo(() => {
    const all = sortedWeeks.flatMap((w) => (w.days || []).flatMap((d) => d.activities || []));
    const overlaps = findDutyOverlaps(all);
    return new Set(overlaps.flatMap((o) => o.dutyIds));
  }, [sortedWeeks]);

  const handleStage = useCallback((key: string, value: string[] | undefined) => {
    setStaged((prev) => {
      const next = new Map(prev);
      if (value === undefined) next.delete(key);
      else next.set(key, value);
      return next;
    });
    setNotice('');
  }, []);

  const changes: StagedChange[] = useMemo(
    () =>
      [...staged.entries()]
        .map(([key, value]) => {
          const cell = grid.get(key);
          return cell ? { key, cell, value } : null;
        })
        .filter((c): c is StagedChange => c !== null),
    [staged, grid]
  );

  const handleApply = async () => {
    setApplying(true);
    setError('');
    const failed: string[] = [];
    const applied: string[] = [];

    // Sequential, and one cell's failure must not abandon the rest.
    for (const change of changes) {
      try {
        await activitiesApi.setLabelsForActivities(change.cell.activityIds, change.value);
        applied.push(change.key);
      } catch (err) {
        failed.push(`Week ${change.cell.weekNumber}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }

    // Re-derive from the server rather than trusting optimistic state.
    await reloadWeeks();

    setStaged((prev) => {
      const next = new Map(prev);
      for (const key of applied) next.delete(key);
      return next;
    });

    setApplying(false);
    if (failed.length > 0) {
      setError(`${applied.length} applied, ${failed.length} failed. ${failed.join('; ')}`);
    } else {
      setReviewOpen(false);
      setNotice(`${applied.length} ${applied.length === 1 ? 'change' : 'changes'} applied.`);
    }
  };

  // Every week's cell for the chosen duty that has a matching activity, split into those that still need
  // writing and those already that person's alone (nothing to write, but any staged edit there is moot).
  const { fillTargets, fillAlreadyDone, fillSkipped } = useMemo(() => {
    const targets: RotaCell[] = [];
    const already: RotaCell[] = [];
    // A week whose activities also carry other (non-group) labels is left for Review & apply, which warns about them;
    // a bulk write would either drop those labels or copy them onto activities that never had them.
    const skipped: RotaCell[] = [];
    if (fillDutyId && fillLabelId) {
      for (const week of sortedWeeks) {
        const cell = grid.get(cellKey(fillDutyId, week.id));
        if (!cell || cell.state === 'empty') continue;
        const alreadyThem =
          cell.state === 'assigned' && cell.groupLabels.length === 1 && cell.groupLabels[0].label.id === fillLabelId;
        if (alreadyThem) already.push(cell);
        else if (cell.foreignLabels.length > 0) skipped.push(cell);
        else targets.push(cell);
      }
    }
    return { fillTargets: targets, fillAlreadyDone: already, fillSkipped: skipped };
  }, [fillDutyId, fillLabelId, sortedWeeks, grid]);

  const handleFillEveryWeek = async () => {
    // The confirm box closes itself the moment it is clicked, so progress shows on the page instead.
    setApplying(true);
    setError('');
    setNotice('');
    const failed: string[] = [];
    const written: RotaCell[] = [];
    try {
      // Same save call and same one-by-one loop as the review flow above. Non-duty labels on a cell are kept.
      for (const [i, cell] of fillTargets.entries()) {
        setFillProgress(`Filling week ${cell.weekNumber} (${i + 1} of ${fillTargets.length})...`);
        try {
          await activitiesApi.setLabelsForActivities(cell.activityIds, [fillLabelId]);
          written.push(cell);
        } catch (err) {
          failed.push(`Week ${cell.weekNumber}: ${err instanceof Error ? err.message : 'failed'}`);
        }
      }
      try {
        await reloadWeeks();
      } catch (err) {
        failed.push(`Could not refresh the grid: ${err instanceof Error ? err.message : 'failed'}`);
      }
      // Anything staged for cells just written, or already that person's, is now out of date.
      setStaged((prev) => {
        const next = new Map(prev);
        for (const cell of [...written, ...fillAlreadyDone]) next.delete(cellKey(cell.dutyId, cell.weekId));
        return next;
      });
      if (failed.length > 0) setError(`${written.length} weeks filled, ${failed.length} failed. ${failed.join('; ')}`);
      else setNotice(`${written.length} ${written.length === 1 ? 'week' : 'weeks'} filled.`);
    } finally {
      setFillProgress('');
      setApplying(false);
      setFillConfirmOpen(false);
    }
  };

  const fillDutyName = ROTA_DUTIES.find((d) => d.id === fillDutyId)?.name || '';
  const fillLabelName = groupLabels.find((l) => l.id === fillLabelId)?.name || '';

  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (loading && weeks.length === 0) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rota"
        subtitle="Assign each weekly duty to a support person. Saving writes the labels that drive their reminders."
      />

      {!activeCohort ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          No active cohort selected.
        </div>
      ) : sortedWeeks.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          This cohort has no weeks yet.
        </div>
      ) : (
        <>
          {notice && (
            <p className="rounded-xl bg-emerald-100/80 px-3 py-2 text-[13px] font-medium text-emerald-700">
              {notice}
            </p>
          )}
          {error && !reviewOpen && (
            <p className="rounded-xl bg-red-100/80 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>
          )}

          {canEdit && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[13px] font-semibold text-gray-900">Same person every week</p>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Pick a duty and a support, and every week of this cohort gets that person for it.
              </p>
              <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
                <div className="md:w-64">
                  <AppSelect
                    value={fillDutyId}
                    onChange={setFillDutyId}
                    placeholder="Choose a duty"
                    compact
                    options={ROTA_DUTIES.filter((d) => !blockedDutyIds.has(d.id)).map((d) => ({
                      value: d.id,
                      label: d.name,
                      meta: d.subLabel,
                    }))}
                  />
                </div>
                <div className="md:w-64">
                  <AppSelect
                    value={fillLabelId}
                    onChange={setFillLabelId}
                    placeholder="Choose a support"
                    compact
                    options={groupLabels.map((l) => ({
                      value: l.id,
                      label: l.name,
                      meta: describeOwners(labelOwners.get(l.id)),
                    }))}
                  />
                </div>
                <button
                  type="button"
                  disabled={applying || fillTargets.length === 0}
                  onClick={() => setFillConfirmOpen(true)}
                  className="rounded-xl bg-[var(--color-primary,#f97316)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {fillProgress ? 'Filling...' : 'Fill every week'}
                </button>
              </div>
              {fillProgress && <p className="mt-2 text-[12px] font-medium text-gray-600">{fillProgress}</p>}
            </div>
          )}

          <RotaGrid
            weeks={sortedWeeks}
            grid={grid}
            groupLabels={groupLabels}
            labelOwners={labelOwners}
            staged={staged}
            onStage={handleStage}
            // Without the Edit tick the duty pickers are locked, same as while applying.
            applying={applying || !canEdit}
            blockedDutyIds={blockedDutyIds}
          />

          <UnmatchedActivitiesPanel groups={unmatched} onOpenSchedule={() => navigate('/schedule')} />

          {changes.length > 0 && (
            // Nothing is written until this is reviewed — reminders are live.
            <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-2xl border-t border-gray-100 bg-white/80 px-4 py-3 shadow-lg backdrop-blur-xl">
              <span className="text-[13px] font-medium text-gray-700">
                {changes.length} unsaved {changes.length === 1 ? 'change' : 'changes'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStaged(new Map())}
                  className="rounded-xl border border-gray-300 px-3 py-1.5 text-[13px] font-medium text-gray-700"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  className="rounded-xl bg-[var(--color-primary,#f97316)] px-4 py-1.5 text-[13px] font-semibold text-white"
                >
                  Review &amp; apply
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmationModal
        isOpen={fillConfirmOpen}
        onClose={() => setFillConfirmOpen(false)}
        onConfirm={handleFillEveryWeek}
        title="Same person every week?"
        message={`${fillLabelName} will be set as the only owner of "${fillDutyName}" in ${fillTargets.length} ${fillTargets.length === 1 ? 'week' : 'weeks'}, replacing whoever is there now.${fillSkipped.length ? ` Left alone because they carry other labels (use Review & apply): week ${fillSkipped.map((c) => c.weekNumber).join(', ')}.` : ''} Their reminders start straight away.`}
        confirmText="Fill every week"
        type="warning"
        confirmLoading={applying}
      />

      <RotaApplyModal
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onConfirm={handleApply}
        changes={changes}
        groupLabels={groupLabels}
        labelOwners={labelOwners}
        applying={applying}
        error={error}
      />
    </div>
  );
};

export default AdminRotaPage;
